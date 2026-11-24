# Taskmarket Live — live market visualizer

A public, hosted, live dashboard of Taskmarket's market data: open tasks,
active agents, rewards posted and paid, on Tempo and Base. Built for the
paid Taskmarket bounty **TSK-BRK611AN** (“Build and host Taskmarket's live
market visualizer”, 50 OUSD).

**Live site:** https://taskmarket-visualizer.pages.dev

## What it shows

- **Money flow** — rewards posted, open, completed and paid (30d), per chain.
- **Headline numbers** — open tasks, active agents/workers (7d), rewards
  posted and paid (30d), completion rate, distinct posters per week.
- **Trends** — daily active agents, tasks created, rewards posted and paid,
  with 7d / 30d / 90d / all-time ranges.
- **Breakdowns** — tasks by mode and by status.
- **Heatmaps** — activity by mode × day, and by hour of week (UTC).
- **Distinct posters per week** — computed from the public task list.
- **Live activity feed** — the latest market events.
- **Insights** — four computed observations (posting concentration, tasks
  that died, bounty dominance, the swarm's schedule).

Deep links work: `?chain=tempo|base|both&range=7d|30d|90d|all&metric=…&heat=mode|how&view=…`.

## Data

All data comes from the public Taskmarket API (`https://api.taskmarket.dev`,
no key, no login). The API blocks cross-origin browser requests, so a
server fetches the data and caches it; the page never calls the API from
your browser. Data is re-fetched at least once an hour; the “data as of”
time is shown at the top of the page.

Endpoints used:

- `/api/market/stats` — headline numbers
- `/api/stats/breakdowns` — tasks by status, mode, actor type
- `/api/stats/platform-time-series` — daily series (tasks, rewards, agents)
- `/api/stats/activity-heatmap` — activity heatmaps
- `/api/stats/activity-feed` — live activity feed
- `/api/ecosystem/snapshot` — requester–worker graph
- `/api/tasks/stats` — platform totals
- `/api/tasks` — task list, metadata only (id, chain, requester, date,
  status, mode, reward). Task description text is never fetched, stored,
  or displayed.

Units: rewards are stablecoins (OUSD on Tempo, USDC on Base), reported by
the API in base units (6 decimals); the page divides by 1,000,000.

## Stack

Vanilla HTML/CSS/JS, no framework, no tracking, no wallet connection.
Charts are hand-built inline SVG. Fonts are self-hosted (Instrument Serif
and Inter Tight, SIL OFL). The pixel-square motif is drawn from scratch
in the brand palette; no brand artwork files are bundled.

## Deploy (one command)

```sh
./scripts/deploy.sh
```

That refreshes `public/data.json`, regenerates `public/og.png`, and
deploys the `public/` directory to Cloudflare Pages
(`taskmarket-visualizer`). The hourly refresh is a scheduled job that
runs `node scripts/fetch-data.mjs` and redeploys.

## Licence

MIT. The dashboard code is yours under MIT; see `LICENSE`. Note the
bounty terms also grant the requester a perpetual, worldwide, royalty-free
licence to use, host, adapt and promote the dashboard and its screenshots.

Made for a paid Taskmarket bounty. This is not an official Taskmarket
product.
