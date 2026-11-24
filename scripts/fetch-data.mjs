// Taskmarket visualizer — server-side data fetcher.
// Runs hourly (cron on the builder VM), writes public/data.json, then the
// static site is redeployed. No browser ever calls api.taskmarket.dev
// (the API blocks cross-origin browser requests), and no task description
// text is ever fetched, stored, or displayed: only whitelisted metadata
// fields are kept (id, chainId, requester, createdAt, status, mode,
// reward, expiryTime). All numbers on the page are reproduced from the
// public Taskmarket API: https://api.taskmarket.dev
// Endpoints used (all public, no key):
//   /api/market/stats, /api/stats/breakdowns,
//   /api/stats/platform-time-series, /api/stats/activity-heatmap,
//   /api/stats/activity-feed, /api/ecosystem/snapshot,
//   /api/tasks/stats, /api/tasks (metadata only)
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.taskmarket.dev/api';
const CHAINS = [
  { id: 4217, name: 'Tempo', token: 'OUSD' },
  { id: 8453, name: 'Base', token: 'USDC' },
];
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastCall = 0;
async function throttle() {
  // Keep at most ~2 requests/second: the API rate-limits bursts.
  const now = Date.now();
  const wait = 500 - (now - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
}

async function get(path, { retries = 5 } = {}) {
  const url = `${API}${path}`;
  for (let i = 0; i < retries; i++) {
    try {
      await throttle();
      const res = await fetch(url, { headers: { 'User-Agent': 'taskmarket-visualizer/1.0 (+https://taskmarket-visualizer.pages.dev)' } });
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after') || 0) * 1000;
        const wait = retryAfter || 10000 * (i + 1);
        console.error(`429 on ${url}, waiting ${wait}ms (attempt ${i + 1}/${retries})`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return await res.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(2000 * (i + 1));
    }
  }
}

// ISO week key, e.g. "2026-W47"
function weekKey(iso) {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const fday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fday + 3);
  const week = 1 + Math.round((d - firstThursday) / (7 * 864e5));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function fetchChain(chain) {
  const c = chain.id;
  const [market, breakdowns, feed, eco7, eco30] = await Promise.all([
    get(`/market/stats?chainId=${c}`),
    get(`/stats/breakdowns?chainId=${c}`),
    get(`/stats/activity-feed?chainId=${c}&limit=30`),
    get(`/ecosystem/snapshot?windowDays=7&chainId=${c}&maxNodes=50&maxLinks=50`),
    get(`/ecosystem/snapshot?windowDays=30&chainId=${c}&maxNodes=50&maxLinks=50`),
  ]);
  const series = {};
  for (const range of ['7d', '30d', '90d', 'all']) {
    series[range] = await get(`/stats/platform-time-series?chainId=${c}&range=${range}&bucket=day`);
  }
  const heatmapMode = await get(`/stats/activity-heatmap?chainId=${c}&range=30d&dimension=mode`);
  const heatmapHow = await get(`/stats/activity-heatmap?chainId=${c}&range=30d&dimension=hourOfWeek`);
  return { chain, market, breakdowns, feed: feed.items ?? feed, eco7, eco30, series, heatmapMode, heatmapHow };
}

async function fetchAllTasks(chainId) {
  // Metadata only. The API returns full task objects; we keep a whitelist
  // of scalar fields and drop everything else (notably description text).
  const out = [];
  let cursor = null;
  for (let page = 0; page < 60; page++) {
    const q = `/tasks?chainId=${chainId}&limit=100&sort=newest` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    const res = await get(q);
    for (const t of res.tasks ?? []) {
      out.push({
        id: t.id,
        chainId: t.chainId,
        requester: t.requester,
        createdAt: t.createdAt,
        expiryTime: t.expiryTime,
        status: t.status,
        mode: t.mode,
        reward: t.reward,
        submissionCount: t.submissionCount ?? 0,
      });
    }
    if (!res.hasMore || !res.nextCursor) break;
    cursor = res.nextCursor;
  }
  return out;
}

function derive(tasks) {
  const byWeek = new Map(); // week -> Map(requester -> count)
  const posterCounts = new Map();
  const statusCounts = {};
  const modeCounts = {};
  let totalReward = 0n;
  for (const t of tasks) {
    const wk = weekKey(t.createdAt);
    if (!byWeek.has(wk)) byWeek.set(wk, new Map());
    const m = byWeek.get(wk);
    m.set(t.requester, (m.get(t.requester) ?? 0) + 1);
    posterCounts.set(t.requester, (posterCounts.get(t.requester) ?? 0) + 1);
    statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;
    modeCounts[t.mode] = (modeCounts[t.mode] ?? 0) + 1;
    try { totalReward += BigInt(t.reward ?? '0'); } catch { /* ignore */ }
  }
  const postersPerWeek = [...byWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([week, m]) => ({ week, distinctPosters: m.size, tasks: [...m.values()].reduce((a, b) => a + b, 0) }));
  const topPosters = [...posterCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([address, count]) => ({ address, count, share: tasks.length ? count / tasks.length : 0 }));
  const top5Share = topPosters.slice(0, 5).reduce((a, p) => a + p.share, 0);
  const died = (statusCounts.expired ?? 0) + (statusCounts.cancelled ?? 0);
  const done = statusCounts.completed ?? 0;
  return {
    taskCount: tasks.length,
    totalRewardBaseUnits: totalReward.toString(),
    statusCounts,
    modeCounts,
    postersPerWeek,
    topPosters,
    top5Share,
    died,
    diedShare: tasks.length ? died / tasks.length : 0,
    completedShare: tasks.length ? done / tasks.length : 0,
  };
}

async function main() {
  const fetchedAt = new Date().toISOString();
  const [totals, breakdownsPlatform] = await Promise.all([
    get('/tasks/stats'),
    get('/stats/breakdowns'),
  ]);
  const chains = {};
  const allTasks = [];
  for (const chain of CHAINS) {
    const data = await fetchChain(chain);
    const tasks = await fetchAllTasks(chain.id);
    data.derived = derive(tasks);
    // Keep the chain payload small: drop the raw task list, keep aggregates.
    chains[chain.id] = data;
    allTasks.push(...tasks);
  }
  const combined = derive(allTasks);
  const payload = {
    fetchedAt,
    source: 'https://api.taskmarket.dev',
    chains: { tempo: 4217, base: 8453 },
    totals,
    breakdownsPlatform,
    perChain: chains,
    combined,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload));
  console.log(`wrote ${OUT} (${Math.round(JSON.stringify(payload).length / 1024)} KB) at ${fetchedAt}`);
  console.log(`tasks: tempo=${chains[4217].derived.taskCount} base=${chains[8453].derived.taskCount} combined=${combined.taskCount}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
