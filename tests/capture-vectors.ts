// Captures tests/page-vectors.json: runs the page scenarios (tests/scenarios.ts) against a served
// checkout and writes every snapshot. Run on 24 October 2026 against the UsernameGenerator 12ddca5
// tree (the last hand-written script.js), so tests/smoke.ts can prove for as long as the vectors
// stand that the TypeScript page behaves as 12ddca5 did. Written on the pattern of MoonApp's.
//
//   node tests/capture-vectors.ts --root /path/to/12ddca5/checkout
//                                 --label "UsernameGenerator 12ddca5 (the last hand-written script.js)"
//                                 [--chromium /usr/bin/chromium] [--out tests/page-vectors.json]
//
// --root is required on purpose: capturing from the current tree would only prove the page agrees
// with itself. Recapture only for a deliberate change of behaviour, and review the diff of the
// JSON: every changed snapshot is a change a person would see.

import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { launchChromium } from './cdp.ts';
import { runScenarios } from './scenarios.ts';
import { startServer } from './server.ts';

const arg = (name: string): string | null => {
  const i = process.argv.indexOf(name);
  return i > 0 ? (process.argv[i + 1] ?? null) : null;
};
const root = arg('--root');
const label = arg('--label');
if (!root || !label) {
  console.error('usage: node tests/capture-vectors.ts --root DIR --label TEXT [--chromium PATH] [--out FILE]');
  process.exit(2);
}
const out = arg('--out') ?? new URL('./page-vectors.json', import.meta.url).pathname;
const sha = (f: string): string => createHash('sha256').update(readFileSync(join(resolve(root), f))).digest('hex');

const work = mkdtempSync(join(tmpdir(), 'usernamegenerator-capture-'));
const server = await startServer({ root: resolve(root) });
const browser = await launchChromium({ chromium: arg('--chromium') ?? '/usr/bin/chromium', out: work });
try {
  const vectors = await runScenarios(browser, server.base);
  const doc = {
    about: 'Page snapshots captured by tests/capture-vectors.ts and replayed by tests/smoke.ts. Generated: do not edit by hand.',
    capturedFrom: label,
    capturedAt: new Date().toISOString().slice(0, 10),
    sources: { 'script.js': sha('script.js'), 'index.html': sha('index.html') },
    vectors,
  };
  // One vector per line, so a recapture diffs line by line.
  const { vectors: list, ...head } = doc;
  const body = list.map((v) => `  ${JSON.stringify(v)}`).join(',\n');
  writeFileSync(out, `${JSON.stringify(head, null, 1).replace(/\n}$/, ',')}\n "vectors": [\n${body}\n ]\n}\n`);
  console.log(`wrote ${out}: ${vectors.length} vectors from ${label}`);
} finally {
  await browser.close();
  server.stop();
  rmSync(work, { recursive: true, force: true });
}
