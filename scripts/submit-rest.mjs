// Submit notes.txt to Taskmarket bounty TSK-BRK611AN via the documented
// Raw REST fallback (docs.taskmarket.dev/reference/raw-api, "Artifact
// Submission"). Used because the first-party CLI's fetch fails deterministically
// on this VM's egress proxy ("other side closed" on GET /api/tasks/{id}),
// while curl/node fetch of the same endpoints succeeds with retries.
//
// Flow (canonical presigned-upload flow):
//  1. sign taskmarket:market:submit:<taskId>:upload:<expiresAt>
//  2. POST /submissions/request-upload-url -> {uploadUrl, artifactKey}
//  3. PUT exact bytes to uploadUrl
//  4. sign taskmarket:market:submit:<taskId>:<artifactKey>
//  5. POST /submissions/from-keys with hashes + signature + idempotency key
// The submit-message format was verified offline against two real
// submissions on this task (ecrecover matched both workers).
//
// Usage: node scripts/submit-rest.mjs [--file notes.txt] [--dry-run]
// Key is read from ~/workspace/wallets/taskmarket-visualizer.key (never printed).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ethers } from 'ethers';

const TASK_ID = '0x3f6d7b4406bb6d263939514f5612b08e6cec5e9ee9d053d1a601650d446c3947';
const API = 'https://api.taskmarket.dev';
const KEY_PATH = process.env.TASKMARKET_KEY || '/home/hatch/workspace/wallets/taskmarket-visualizer.key';

const args = process.argv.slice(2);
const fileArg = args.includes('--file') ? args[args.indexOf('--file') + 1] : 'notes.txt';
const dryRun = args.includes('--dry-run');

const fileBytes = readFileSync(fileArg);
const fileName = fileArg.split('/').pop();
const sizeBytes = fileBytes.length;
const sha256 = createHash('sha256').update(fileBytes).digest('hex');
const keccak256 = ethers.keccak256(fileBytes);

const key = readFileSync(KEY_PATH, 'utf8').trim();
const wallet = new ethers.Wallet(key);
const workerAddress = wallet.address;
console.log('worker:', workerAddress);
console.log('file:', fileName, sizeBytes, 'bytes, sha256:', sha256.slice(0, 16) + '...');

async function fetchRetry(url, opts, tries = 8) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, opts);
      const text = await r.text();
      return { status: r.status, text };
    } catch (e) {
      lastErr = e;
      console.log(`  fetch attempt ${i} failed (${e.cause?.message || e.message}), retrying...`);
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  throw lastErr;
}

// 1. upload signature
const expiresAt = Math.floor(Date.now() / 1000) + 540;
const uploadMsg = `taskmarket:market:submit:${TASK_ID}:upload:${expiresAt}`;
const uploadSig = await wallet.signMessage(uploadMsg);
console.log('upload signature ready, expiresAt:', expiresAt);

if (dryRun) {
  console.log('DRY RUN: stopping before request-upload-url.');
  process.exit(0);
}

// 2. request upload URL
const up = await fetchRetry(`${API}/api/tasks/${TASK_ID}/submissions/request-upload-url`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    workerAddress, signature: uploadSig, fileName,
    mimeType: 'text/plain', role: 'final', sizeBytes, expiresAt,
  }),
});
console.log('request-upload-url ->', up.status, up.text.slice(0, 300));
if (up.status !== 200) { console.error('FAILED at request-upload-url'); process.exit(1); }
const { uploadUrl, artifactKey } = JSON.parse(up.text);
console.log('artifactKey:', artifactKey);

// 3. upload exact bytes
const put = await fetchRetry(uploadUrl, {
  method: 'PUT',
  headers: { 'Content-Type': 'text/plain', 'Content-Length': String(sizeBytes) },
  body: fileBytes,
});
console.log('PUT upload ->', put.status, put.text.slice(0, 200));
if (put.status !== 200 && put.status !== 204) { console.error('FAILED at upload PUT'); process.exit(1); }

// 4. submit signature over the artifact key
const submitMsg = `taskmarket:market:submit:${TASK_ID}:${artifactKey}`;
const submitSig = await wallet.signMessage(submitMsg);

// 5. submit from-keys (same idempotency key across retries of this operation)
const idem = crypto.randomUUID();
const sub = await fetchRetry(`${API}/api/tasks/${TASK_ID}/submissions/from-keys`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Taskmarket-Idempotency-Key': idem },
  body: JSON.stringify({
    workerAddress,
    artifacts: [{ artifactKey, fileName, mimeType: 'text/plain', role: 'final', sizeBytes, sha256Hash: sha256, keccak256Hash: keccak256 }],
    signature: submitSig,
  }),
});
console.log('from-keys ->', sub.status, sub.text.slice(0, 500));
console.log('idempotency key:', idem);
if (sub.status !== 200) { console.error('FAILED at from-keys'); process.exit(1); }
console.log('SUBMITTED:', sub.text);
