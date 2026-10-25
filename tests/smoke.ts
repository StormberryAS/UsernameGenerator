// The browser smoke test: the page as production serves it (tests/serve.py, with the zone's headers
// and the _config.yml exclusions), in headless Chromium. Added on 24 October 2026 with the
// TypeScript move, on MoonApp's tests/smoke.ts.
//
//   node tests/smoke.ts [--chromium /usr/bin/chromium] [--shots DIR]
//
// Checks: every scenario of tests/scenarios.ts gives, step for step, the snapshot frozen in
// tests/page-vectors.json, which was captured from the UsernameGenerator 12ddca5 page (the last
// hand-written script.js), so the page behaves as 12ddca5 did; no request leaves the origin and no
// console error or policy violation appears under the zone's header (except in the three scenarios
// that take the word lists or the entropy model away on purpose); the compiled script.js is what is
// served, under its current stamp; the sources and tooling are not served; no sideways scroll at
// 320, 390 and 1280 px (the terminal guide's wide install commands aside, as in 12ddca5). Prints one line per
// check and exits 1 on the first failure.

import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { launchChromium, openPage } from './cdp.ts';
import type { Page } from './cdp.ts';
import { initScript, press, runScenarios, setControl, setDigits } from './scenarios.ts';
import type { Snap, Vector } from './scenarios.ts';
import { startServer } from './server.ts';
import { defined } from './helpers.ts';

const arg = (name: string): string | null => {
  const i = process.argv.indexOf(name);
  return i > 0 ? (process.argv[i + 1] ?? null) : null;
};
const chromium = arg('--chromium') ?? '/usr/bin/chromium';
const shots = arg('--shots');
if (shots) mkdirSync(shots, { recursive: true });
const work = mkdtempSync(join(tmpdir(), 'usernamegenerator-smoke-'));
const repo = new URL('../', import.meta.url);
const read = (p: string): string => readFileSync(new URL(p, repo), 'utf8');

const server = await startServer();
const base = server.base;
const browser = await launchChromium({ chromium, out: work });

async function cleanup(): Promise<void> {
  await browser.close();
  server.stop();
  rmSync(work, { recursive: true, force: true });
}

let passed = 0;
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`ok ${passed} ${name}`);
  } catch (err) {
    console.log(`not ok ${name}\n  ${String((err as Error | null)?.stack || err).split('\n').join('\n  ')}`);
    await cleanup();
    process.exit(1);
  }
}

/** Nothing off the origin, no error, no policy refusal. */
function quiet(p: Page, where: string): void {
  assert.deepEqual(p.log.offsite, [], `${where}: requests off the origin`);
  assert.deepEqual(p.log.errors, [], `${where}: console or page errors`);
  assert.deepEqual(p.log.csp, [], `${where}: policy violations`);
}

/** The scenarios that take word lists or the entropy model away: the page reports that on the console, as it should. */
const LOSES_DATA = /^(word lists unavailable|entropy model unavailable|nothing from data unavailable)/;

await check('the page as 12ddca5 left it: every scenario step gives its frozen snapshot', async () => {
  const frozen = JSON.parse(read('tests/page-vectors.json')) as { capturedFrom: string; vectors: Vector[] };
  assert.match(frozen.capturedFrom, /^UsernameGenerator 12ddca5 /);
  const now = await runScenarios(browser, base, {
    after: (p, sc) => {
      if (LOSES_DATA.test(sc)) {
        assert.deepEqual(p.log.offsite, [], `${sc}: requests off the origin`);
        assert.deepEqual(p.log.csp, [], `${sc}: policy violations`);
        assert.ok(p.log.console.some((l) => l.startsWith('error: ')), `${sc}: the failure is reported on the console`);
      } else quiet(p, sc);
    },
  });
  assert.deepEqual(now.map((v) => v.name), frozen.vectors.map((v) => v.name), 'the same steps, in the same order');
  const diffs: string[] = [];
  now.forEach((v, i) => {
    const want: Snap = defined(frozen.vectors[i], `vector ${i}`).snap;
    for (const k of new Set([...Object.keys(want), ...Object.keys(v.snap)])) {
      if (JSON.stringify(want[k]) !== JSON.stringify(v.snap[k])) diffs.push(`${v.name}: ${k}\n      frozen: ${JSON.stringify(want[k])}\n      now:    ${JSON.stringify(v.snap[k])}`);
    }
  });
  assert.deepEqual(diffs.slice(0, 10), [], `${diffs.length} differences`);
  console.log(`  (${now.length} snapshots match)`);
});

await check('the compiled script.js is what is served, under its current stamp', async () => {
  const res = await fetch(`${base}script.js`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), read('script.js'));
  const stamp = createHash('sha256').update(readFileSync(new URL('script.js', repo))).digest('hex').slice(0, 8);
  const html = await (await fetch(base)).text();
  assert.ok(html.includes(`<script src="script.js?v=${stamp}"></script>`));
});

await check('sources, tooling and tests are not served; the site is', async () => {
  const hidden = ['ts/script.ts', 'tests/smoke.ts', 'tests/page-vectors.json', 'tests/serve.py', 'tests/tsconfig.json', 'tools/build-ts.sh', 'tools/package.json',
    'tools/gen-sanitise-golden.js', 'tools/gen-strength-golden.js', 'tools/check-strength-parity.py', 'tools/gen-entropy-model.py',
    'package.json', 'package-lock.json', 'tsconfig.json', '.npmrc', '.gitattributes', 'node_modules/typescript/package.json', 'bump_assets.py', 'README.md', 'CHANGELOG.md',
    'username.py', 'build_dicts.py', 'build_dicts_robust.py', 'android/gradlew', 'android/app/build.gradle.kts', 'fastlane/metadata/android/en-US/full_description.txt',
    'zapstore.yaml', 'DISCLAIMER.md', 'PRIVACY.md', 'LICENSE', 'NOTICE', 'jsconfig.json', 'types/script.d.ts',
    'android/app/src/test/resources/strength-golden.tsv', 'android/app/src/test/resources/sanitise-golden.csv'];
  for (const path of hidden) assert.equal((await fetch(`${base}${path}`)).status, 404, `${path} is not served`);
  for (const path of ['', 'index.html', 'script.js', 'style.css', 'footer.css', 'disclaimer.html', 'privacy.html', 'favicon.svg', 'fonts/inter/inter.css', 'apple-touch-icon.png',
    'data/en_nouns.txt', 'data/pt_verbs.txt', 'data/entropy-model.tsv', 'og-image.png', 'robots.txt']) {
    assert.equal((await fetch(`${base}${path}`)).status, 200, `${path || '/'} is served`);
  }
});

await check('the generator panel fits the width at 320, 390 and 1280 px; only the terminal guide is wider than a phone', async () => {
  // Known and unchanged by the TypeScript move (it is in the 12ddca5 page too): the terminal guide's
  // install commands are pre-formatted lines 632 px wide, so at phone widths the document scrolls
  // sideways to reach the end of them. The generator's own panel must fit, and the document may be
  // wider than the screen only where the guide is. This holds the page to exactly that, so a new
  // overflow of the panel is caught and the old one of the guide is on record.
  for (const width of [320, 390, 1280]) {
    const p = await openPage(browser, base, { width, timezone: 'Europe/Oslo', init: initScript(5) });
    const fits = async (where: string): Promise<void> => {
      const [panelRight, innerWidth, scrollWidth]: number[] = await p.run(() => [document.querySelector('.glass-panel')!.getBoundingClientRect().right, window.innerWidth, document.documentElement.scrollWidth]);
      assert.ok(defined(panelRight, 'panel') <= defined(innerWidth, 'inner width'), `${width}px ${where}: the generator panel fits`);
      assert.equal(defined(scrollWidth, 'scroll width') > defined(innerWidth, 'inner width'), width < 640, `${width}px ${where}: the document is wider than the screen only at phone widths`);
    };
    await fits('as loaded');
    await press(p, '#maxEntropyBtn');
    await fits('at the maximum');
    await setControl(p, 'separator', '');
    await setControl(p, 'lang', 'de');
    await setControl(p, 'type', 'noun');
    await setDigits(p, false);
    await press(p, '#generateBtn');
    await fits('with five words and no separator');
    if (shots) await p.shot(join(shots, `page-${width}.png`));
    quiet(p, `${width}px`);
    await p.close();
  }
});

console.log(`smoke: all ${passed} checks passed`);
await cleanup();
