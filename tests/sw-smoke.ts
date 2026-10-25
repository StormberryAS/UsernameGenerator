// The offline pilot's browser test: the service worker (ts/sw.ts, compiled to sw.js) in headless
// Chromium, under the real name and scheme. Added 24 October 2026 with the pilot, ported from
// MoonApp cba61dd (itself from SunApp 88f59d4; the fix rounds and verify findings named below are
// SunApp's). What this app adds to the MoonApp test: the page needs its 33 word lists and the
// entropy model to give a right answer, so every "the page works offline" check generates a name in
// the mixed-language setting and compares the strength readout with the one seen online; a
// readout from the built-in fallback list would differ.
//
//   node tests/sw-smoke.ts [--chromium /usr/bin/chromium]
//
// The worker registers only on https://username.stormberry.as, so the test does not bend that rule with a
// flag: tests/serve.py --tls serves a copy of the site with a throwaway certificate for that name,
// and Chromium is told to resolve username.stormberry.as (and labs.stormberry.as, for the other-host
// check) to a local relay in front of it and to trust that one certificate. The relay is how the
// test goes offline: it drops every open connection and refuses new ones, so every request fails
// the way it does in flight mode. The copy is how the test deploys: it edits a file in the copy and
// runs the copy's bump_assets.py, as a real release would. Nothing in the repository is written.
//
// Checks, in order (each later one builds on the state the earlier ones leave):
//   1. no worker without ?offline=1, on another host name, or over plain HTTP on 127.0.0.1;
//   2. with ?offline=1 the worker installs, stores every listed file in the cache whose name the
//      stamped list gives, and controls the page, which still generates;
//   3. offline, the page opens (from / and from /?offline=1, by navigation and by reload),
//      generates a name with the online strength readout (so the 33 word lists and the entropy model
//      came from the worker), and the disclaimer and privacy pages open; without the worker the same load fails;
//   4. after a deploy (a changed stylesheet, stamped by bump_assets.py), the first online load
//      serves the new version, the new worker replaces the old cache, and offline then serves it;
//   5. a file served with bytes that do not match its new stamp (a CDN lagging a push) is never
//      stored: the new worker does not install, the old one keeps working offline, and once the
//      right bytes are served the next visit installs the new worker;
//   6. after a deploy whose new script and stylesheet fail to arrive (the network dies after the
//      page), the last complete version still opens offline, and the new one is kept once its
//      files arrive (fix round 1, verify 0 offline S-1);
//   7. a file opened in a tab (/sw.js) is left to the browser and never stored (fix round 1, C-3);
//   8. a first visit while the edge still serves an older sw.js with the older files, next to a
//      newer index.html, installs nothing; once the edge catches up the next visit installs
//      (fix round 1, verify 0 offline S-2);
//   9. kill switch 1, OFFLINE_PILOT = 'off': the next visit leaves no worker and no usernamegenerator- cache,
//      and a later request from that page does not bring a cache back (fix round 1, C-1);
//  10. kill switch 2, KILL = true: the next visit leaves no worker and no usernamegenerator- cache, the page
//      does not reload itself, and putting KILL back lets a ?offline=1 visit install it again;
//  11. the wrong way to retire the pilot, and the way back: a deploy that deletes sw.js and takes
//      offlinePilot() out of script.js leaves the worker in place (logged, not asserted: it is the
//      browser's behaviour, which is why ts/sw.ts says never to retire it so), and serving a
//      sw.js with KILL = true again then leaves no worker and no usernamegenerator- cache (fix round 2,
//      verify 1 offline S-1);
//  12. throughout: nothing leaves the origin, no console error, no policy violation.
//
// To fail or replace one single address (6 and 8), serve.py reads an overrides file on every
// request (--overrides); the relay alone works per connection and cannot.
// Prints one line per check and exits 1 on the first failure.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, connect } from 'node:net';
import type { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { inPage, launchChromium, openPage, sleep } from './cdp.ts';
import type { Browser, Page } from './cdp.ts';
import { press, setControl } from './scenarios.ts';
import { startServer } from './server.ts';
import { defined } from './helpers.ts';

const arg = (name: string): string | null => {
  const i = process.argv.indexOf(name);
  return i > 0 ? (process.argv[i + 1] ?? null) : null;
};
const chromium = arg('--chromium') ?? '/usr/bin/chromium';
const repo = fileURLToPath(new URL('../', import.meta.url));
const work = mkdtempSync(join(tmpdir(), 'usernamegenerator-sw-smoke-'));
const site = join(work, 'site');
const ORIGIN = 'https://username.stormberry.as';

// The copy of the site the test serves and deploys into: everything but the git directory, the
// installed compiler and the Android and store trees (serve.py applies the copy's _config.yml).
cpSync(repo, site, {
  recursive: true,
  filter: (src) => !['.git', 'node_modules', 'android', 'fastlane'].includes(relative(repo, src).split(sep)[0] ?? ''),
});
const siteFile = (p: string): string => join(site, p);
const readSite = (p: string): string => readFileSync(siteFile(p), 'utf8');
/** Replaces one exact piece of a file in the copy; the piece must occur once. */
function edit(p: string, from: string, to: string): void {
  const text = readSite(p);
  assert.equal(text.split(from).length, 2, `${p} holds ${JSON.stringify(from)} exactly once`);
  writeFileSync(siteFile(p), text.replace(from, to));
}
const bump = (): void => { execFileSync('python3', ['-I', siteFile('bump_assets.py')], { stdio: 'ignore' }); };
const stampOf = (p: string): string => createHash('sha256').update(readFileSync(siteFile(p))).digest('hex').slice(0, 8);

/** The worker's file list as deployed, and the cache name it derives from it (FNV-1a, as ts/sw.ts). */
function deployed(): { assets: string[]; cache: string } {
  const m = defined(/const ASSETS = \[([\s\S]*?)\];/.exec(readSite('sw.js'))?.[1], 'the ASSETS list in sw.js');
  const assets = [...m.matchAll(/'([^']*)'/g)].map((x) => defined(x[1], 'an entry'));
  let h = 0x811c9dc5;
  const text = assets.join('\n');
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return { assets, cache: `usernamegenerator-${h.toString(16).padStart(8, '0')}` };
}

/** A relay in front of the TLS server. Offline, it drops every open connection and refuses new ones. */
async function startRelay(target: number): Promise<{ port: number; setOnline: (v: boolean) => void; refused: () => number; close: () => void }> {
  const open = new Set<Socket>();
  let online = true;
  let refused = 0;
  const server = createServer((client) => {
    if (!online) { refused += 1; client.destroy(); return; }
    const up = connect(target, '127.0.0.1');
    open.add(client); open.add(up);
    const done = (): void => { client.destroy(); up.destroy(); open.delete(client); open.delete(up); };
    client.on('error', done); up.on('error', done); client.on('close', done); up.on('close', done);
    client.pipe(up); up.pipe(client);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('the relay has no port');
  return {
    port: address.port,
    setOnline: (v) => { online = v; if (!v) for (const s of open) s.destroy(); },
    refused: () => refused,
    close: () => { for (const s of open) s.destroy(); server.close(); },
  };
}

const overridesFile = join(work, 'overrides.json');
/** What serve.py answers instead, per address with its query: 'drop' or another file's bytes. */
const setOverrides = (table: Record<string, 'drop' | { file: string }>): void => { writeFileSync(overridesFile, JSON.stringify(table)); };
setOverrides({});
/** The stamp index.html gives a local script or stylesheet. */
const pageStamp = (file: string): string => defined(new RegExp(`(?:src|href)="${file.replace('.', '\\.')}\\?v=([0-9a-f]{8})"`).exec(readSite('index.html'))?.[1], `the stamp of ${file} in index.html`);
/** Keeps a copy of a file of the site as it is now, outside it, and returns where. */
function keep(p: string, as: string): string {
  const to = join(work, as);
  writeFileSync(to, readFileSync(siteFile(p)));
  return to;
}

const tls = await startServer({ root: site, tls: true, overrides: overridesFile });
const plain = await startServer({ root: site });
const relay = await startRelay(Number(new URL(tls.base).port));
const browser: Browser = await launchChromium({
  chromium,
  out: work,
  args: [
    `--host-resolver-rules=MAP username.stormberry.as 127.0.0.1:${relay.port},MAP labs.stormberry.as 127.0.0.1:${relay.port}`,
    `--ignore-certificate-errors-spki-list=${defined(tls.spki, 'the certificate hash')}`,
  ],
});

// Every request a page saw fail, with its address (the console line alone does not name it).
const requested = new Map<string, string>();
const failed: string[] = [];
// Every page (document) answer: where it came from. Offline, a page must come from the worker, not
// from the HTTP cache (which also holds index.html for its ten minutes).
const documents: Array<{ url: string; fromServiceWorker: boolean; status: number }> = [];
browser.listeners.add((m) => {
  if (m.method === 'Network.responseReceived' && m.params.type === 'Document') {
    documents.push({ url: m.params.response.url, fromServiceWorker: !!m.params.response.fromServiceWorker, status: m.params.response.status });
  }
  if (m.method === 'Network.requestWillBeSent') requested.set(m.params.requestId, m.params.request.url);
  if (m.method === 'Network.loadingFailed') failed.push(`${requested.get(m.params.requestId) ?? '?'} ${m.params.errorText}`);
});

async function cleanup(): Promise<void> {
  await browser.close();
  relay.close();
  tls.stop();
  plain.stop();
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

/**
 * Nothing off the origin, no error, no policy refusal. One allowance, offline only: disclaimer.html
 * has no <link rel="icon">, so Chromium asks for /favicon.ico by itself, and with no network that
 * request fails with a console line. The worker leaves that address alone (it is not in ASSETS), so
 * this is what any page without an icon link shows offline; it is not the worker's doing.
 */
function quiet(p: Page, where: string, { offline = false }: { offline?: boolean } = {}): void {
  assert.deepEqual(p.log.offsite, [], `${where}: requests off the origin`);
  const favicon = failed.filter((f) => f.startsWith(`${ORIGIN}/favicon.ico `));
  const errors = offline && favicon.length === failed.length
    ? p.log.errors.filter((e) => !/^network: Failed to load resource: net::ERR_/.test(e))
    : p.log.errors;
  assert.deepEqual(errors, [], `${where}: console or page errors; failed loads: ${JSON.stringify(failed)}`);
  assert.deepEqual(p.log.csp, [], `${where}: policy violations`);
  // The next check starts from a clean record.
  p.log.errors.length = 0;
  failed.length = 0;
}

/**
 * Forgives the failed loads a check caused on purpose: every failed request must be one of
 * [urls] (or the favicon.ico an offline disclaimer asks for), and their console lines go.
 */
function forgive(p: Page, urls: string[]): void {
  const unexpected = failed.filter((f) => !urls.some((u) => f.startsWith(`${u} `)) && !f.startsWith(`${ORIGIN}/favicon.ico `));
  assert.deepEqual(unexpected, [], 'only the dropped addresses failed');
  const kept = p.log.errors.filter((e) => !/^network: Failed to load resource: net::ERR_/.test(e));
  p.log.errors.length = 0;
  p.log.errors.push(...kept);
  failed.length = 0;
}

declare global {
  interface Window {
    /** Set before a reload, gone after it (reload()). */
    __beforeReload?: number;
    /** Set before KILL is deployed; still there if the page did not reload itself. */
    __stay?: number;
  }
}

// The code that runs inside the page, written as typed functions and sent with p.run (see
// tests/cdp.ts): each uses only its own parameters and the page's globals.

/** What this browser context holds: workers registered for the page's origin, and its caches. */
async function held(p: Page): Promise<{ workers: number; caches: string[] }> {
  return p.run(async () => ({
    workers: 'serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0,
    caches: self.caches ? (await caches.keys()) : [],
  }));
}

/** The registration as the page sees it, for failure messages. */
const state = (p: Page): Promise<string> => p.run(async () => {
  const r = await navigator.serviceWorker.getRegistration();
  const w = (x: ServiceWorker | null | undefined): string | null => x ? x.state + ' ' + x.scriptURL : null;
  return JSON.stringify({ href: location.href, controller: w(navigator.serviceWorker.controller), active: r && w(r.active), waiting: r && w(r.waiting), installing: r && w(r.installing), caches: await caches.keys() });
}).catch((e: unknown) => String(e));

/** The addresses stored in a cache, whole or as paths. */
const storedIn = (p: Page, cache: string, paths = false): Promise<string[]> =>
  p.run(async (name, onlyPath) => (await (await caches.open(name)).keys()).map((r) => onlyPath ? new URL(r.url).pathname : r.url), cache, paths);

/** The text of one stored response ('' if the cache has none), found in the named cache. */
const storedText = (p: Page, cache: string, url: string): Promise<string> =>
  p.run(async (name, address) => { const r = await (await caches.open(name)).match(address); return r ? r.text() : ''; }, cache, url);

/** The text the page gets for an address (cache 'no-store' skips the HTTP cache). */
const fetchedText = (p: Page, url: string, noStore = false): Promise<string> =>
  p.run((address, fresh) => fetch(address, fresh ? { cache: 'no-store' } : {}).then((r) => r.text()), url, noStore);

/** Whether a service worker controls the page. */
const isControlled = (p: Page): Promise<boolean> => p.run(() => !!navigator.serviceWorker.controller);

/** Whether the page has settled on one active worker that controls it (and, with needController, whether it has one). */
const workerSettled = (p: Page, needController: boolean): Promise<boolean> => p.run(async (need) => {
  const r = await navigator.serviceWorker.getRegistration();
  return !!r && (!need || !!navigator.serviceWorker.controller) && r.active === navigator.serviceWorker.controller && !r.waiting && !r.installing;
}, needController);

/** Whether the page has every one of these elements. */
const hasAll = (p: Page, selectors: string[]): Promise<boolean> => p.run((list) => list.every((sel) => !!document.querySelector(sel)), selectors);

/** The deploy marker the test stylesheets set on :root. */
const deployMarker = (p: Page): Promise<string> => p.run(() => getComputedStyle(document.documentElement).getPropertyValue('--sw-smoke-deploy').trim());

/** The document has loaded and shows this element (if given) at this path (if given). */
const loadedWith = (p: Page, selector: string | null, path: string | null): Promise<boolean> =>
  p.run((sel, at) => document.readyState === 'complete' && (sel === null || !!document.querySelector(sel)) && (at === null || location.pathname === at), selector, path);

/** Waits until fn holds, polling; returns whether it did. */
async function until(fn: () => Promise<boolean>, ms = 20000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if (await fn()) return true; } catch { /* the page is between documents */ }
    await sleep(200);
  }
  return false;
}

/** Navigates and waits for the page to be ready (or for ms to pass); returns whether it became ready. */
async function go(p: Page, url: string, ms = 8000): Promise<boolean> {
  await p.s('Page.navigate', { url });
  return until(() => p.run(isReady), ms);
}

async function reload(p: Page, ms = 8000): Promise<boolean> {
  await p.run(() => { window.__beforeReload = 1; });
  await p.s('Page.reload', {});
  return until(() => p.run(isReadyAfterReload), ms);
}

/** The page is ready once the first username has replaced the placeholder and the readout has its figure. */
const isReady = (): boolean => document.readyState === 'complete' && document.getElementById('output')?.textContent !== 'Initialize to begin...' && !document.getElementById('output')?.classList.contains('loading') && /bits/.test(document.getElementById('strengthBits')?.textContent ?? '');

/** Ready, and a new document: the mark set before the reload is gone. */
const isReadyAfterReload = (): boolean => !window.__beforeReload && document.readyState === 'complete' && document.getElementById('output')?.textContent !== 'Initialize to begin...' && !document.getElementById('output')?.classList.contains('loading') && /bits/.test(document.getElementById('strengthBits')?.textContent ?? '');

/**
 * Mixes the languages and word types, generates a name, and returns the strength readout. Mixing
 * needs all 33 word lists; the figure needs the entropy model. Without either the page falls back
 * to its built-in list and a different readout.
 */
async function generates(p: Page): Promise<string> {
  await setControl(p, 'lang', 'mix');
  await setControl(p, 'type', 'mixed');
  await setControl(p, 'words', '3');
  await press(p, '#generateBtn');
  const name = await p.run(() => document.getElementById('output')!.textContent!.trim());
  assert.ok(name.length >= 6 && name !== 'Initialize to begin...', `a username was generated (${JSON.stringify(name)})`);
  return p.run(() => document.getElementById('strengthBits')!.textContent!.trim() + ' | ' + document.getElementById('strengthDetail')!.textContent!.trim());
}

/** The readout the mixed-language setting shows with the network up; every later check must show the same. */
let readout = '';
const sameReadout = async (p: Page, where: string): Promise<void> => {
  assert.equal(await generates(p), readout, `${where}: the strength readout is the online one`);
};

/** Whether the page can read all 33 word lists and the entropy model, as a fetch of its own would. */
const DATA_FILES = [
  ...['de', 'en', 'es', 'fr', 'it', 'la', 'nl', 'no', 'pl', 'pt', 'ro'].flatMap((l) => ['adjectives', 'nouns', 'verbs'].map((t) => `data/${l}_${t}.txt`)),
  'data/entropy-model.tsv',
];
const dataReadable = (p: Page): Promise<boolean> => p.run(
  (files) => Promise.all(files.map((u) => fetch(u).then((r) => r.ok ? r.text() : '').then((t) => t.length > 100))).then((a) => a.length === 34 && a.every(Boolean)),
  DATA_FILES,
);

await check('no worker without ?offline=1, on another host name, or over plain HTTP', async () => {
  for (const url of [`${ORIGIN}/`, 'https://labs.stormberry.as/?offline=1', `${plain.base}?offline=1`, `${plain.base.replace('127.0.0.1', 'localhost')}?offline=1`]) {
    const p = await openPage(browser, url, { timezone: 'Europe/Oslo' });
    assert.ok(await until(() => p.run(isReady), 8000), `${url} loaded`);
    await sleep(1500);
    assert.deepEqual(await held(p), { workers: 0, caches: [] }, url);
    quiet(p, url);
    await p.close();
  }
});

// One page, in one browser context, for checks 2 to 6: a person's phone.
const p = await openPage(browser, `${ORIGIN}/?offline=1`, { timezone: 'Europe/Oslo' });

await check('with ?offline=1 the worker installs, stores every listed file and controls the page', async () => {
  assert.ok(await until(async () => (await isControlled(p))), 'the worker controls the page');
  const { assets, cache } = deployed();
  assert.ok(assets.length >= 60, 'the list as deployed');
  assert.deepEqual((await held(p)).caches, [cache], 'one cache, named from the stamped list');
  const stored = await storedIn(p, cache);
  const want = assets.map((a) => new URL(a, `${ORIGIN}/`).href);
  assert.deepEqual([...stored].sort(), [...want].sort(), 'every listed file, under its own address');
  assert.equal(await p.run(() => navigator.serviceWorker.controller!.scriptURL), `${ORIGIN}/sw.js`);
  assert.equal(await fetchedText(p, '/sw.js', true), readFileSync(join(repo, 'sw.js'), 'utf8'), 'the worker served is the compiled sw.js');
  readout = await generates(p);
  assert.match(readout, /\d bits/, 'the readout has its figure');
  assert.ok(await dataReadable(p), 'online, all 33 word lists and the entropy model are readable');
  quiet(p, 'online, with the worker');
});

await check('offline: the page opens and calculates; the disclaimer opens; without the worker it does not', async () => {
  relay.setOnline(false);
  const before = relay.refused();
  documents.length = 0;
  assert.ok(await go(p, `${ORIGIN}/`), 'offline, / opens');
  await sameReadout(p, 'offline');
  assert.ok(await dataReadable(p), 'offline, all 33 word lists and the entropy model are readable (from the worker)');
  assert.ok(await reload(p), 'offline, a reload opens');
  assert.ok(await go(p, `${ORIGIN}/?offline=1`), 'offline, /?offline=1 (the Home Screen address) opens');
  await sameReadout(p, 'check 3');
  await p.s('Page.navigate', { url: `${ORIGIN}/disclaimer.html` });
  assert.ok(await until(async () => (await loadedWith(p, 'a.back', null)), 8000), 'offline, the disclaimer opens');
  await p.s('Page.navigate', { url: `${ORIGIN}/privacy.html` });
  assert.ok(await until(async () => (await loadedWith(p, 'a.back', '/privacy.html')), 8000), 'offline, the privacy page opens');
  assert.ok(relay.refused() > before, 'the network was tried, and failed');
  assert.deepEqual(documents.map((d) => [d.url, d.fromServiceWorker, d.status]), [
    [`${ORIGIN}/`, true, 200], [`${ORIGIN}/`, true, 200], [`${ORIGIN}/?offline=1`, true, 200], [`${ORIGIN}/disclaimer.html`, true, 200], [`${ORIGIN}/privacy.html`, true, 200],
  ], 'every offline page came from the worker');
  quiet(p, 'offline', { offline: true });
  // The control: a fresh context (a phone that never visited) gets nothing offline.
  const q = await browser.send('Target.createBrowserContext');
  const { targetId } = await browser.send('Target.createTarget', { url: `${ORIGIN}/`, browserContextId: q.browserContextId });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  await sleep(4000);
  const r = await browser.send('Runtime.evaluate', { expression: inPage(() => !!document.getElementById('generateBtn')), returnByValue: true }, sessionId);
  assert.equal(r.result.value, false, 'without the worker, the page does not open offline');
  await browser.send('Target.disposeBrowserContext', { browserContextId: q.browserContextId });
  relay.setOnline(true);
});

await check('a deploy: the first online load serves the new version, and the new worker replaces the cache', async () => {
  const old = deployed();
  writeFileSync(siteFile('style.css'), `${readSite('style.css')}\n:root { --sw-smoke-deploy: 2; }\n`);
  bump();
  const now = deployed();
  const stamp = stampOf('style.css');
  assert.notEqual(now.cache, old.cache, 'the new stamp renames the cache');
  assert.ok(now.assets.includes(`./style.css?v=${stamp}`), 'sw.js lists the new stamp');
  // A plain navigation, not a reload: the worker revalidates pages, so the HTTP cache's ten
  // minutes on index.html do not hold the old page back.
  assert.ok(await go(p, `${ORIGIN}/`), 'online, / opens');
  assert.ok(await hasAll(p, [`link[href="style.css?v=${stamp}"]`]), 'the new page, with the new stamp');
  assert.equal(await deployMarker(p), '2', 'the new stylesheet');
  assert.ok(await until(async () => JSON.stringify((await held(p)).caches) === JSON.stringify([now.cache])), `only the new cache is left (${JSON.stringify((await held(p)).caches)})`);
  assert.ok(await until(async () => (await workerSettled(p, true))), 'the new worker controls the page');
  relay.setOnline(false);
  assert.ok(await reload(p), 'offline, the new version opens');
  assert.equal(await deployMarker(p), '2', 'offline, the new stylesheet');
  await sameReadout(p, 'check 4');
  relay.setOnline(true);
  quiet(p, 'deploy', { offline: true });
});

await check('a file whose bytes do not match its stamp is never stored; the old worker keeps working', async () => {
  // A deploy whose stylesheet the CDN still serves in its old version under the new stamp (GitHub
  // Pages' own cache can lag a push by minutes). The new worker must not pin the old bytes.
  const before = deployed();
  const old = readSite('style.css');
  writeFileSync(siteFile('style.css'), `${old}\n:root { --sw-smoke-deploy: 3; }\n`);
  bump();
  const fresh = readSite('style.css');
  const next = deployed();
  writeFileSync(siteFile('style.css'), old);
  assert.ok(await go(p, `${ORIGIN}/`), 'online, the page opens');
  await sleep(3000);
  assert.deepEqual((await held(p)).caches, [before.cache], 'the new worker did not install; the old cache stays');
  assert.equal(await p.run(() => navigator.serviceWorker.controller!.scriptURL), `${ORIGIN}/sw.js`);
  const stored = await storedIn(p, before.cache);
  const wrong = next.assets.filter((a) => /style\.css/.test(a)).map((a) => new URL(a, `${ORIGIN}/`).href);
  assert.deepEqual(stored.filter((u) => wrong.includes(u)), [], 'the mismatched file was not stored under its new stamp');
  relay.setOnline(false);
  assert.ok(await reload(p), 'offline, the last good version still opens');
  relay.setOnline(true);
  // The CDN catches up. The HTTP cache still holds the old bytes under the new stamp for its four
  // hours; the worker, finding they do not match, asks the server past it and stores the right ones.
  writeFileSync(siteFile('style.css'), fresh);
  const url = defined(wrong[0], 'the new stylesheet address');
  const text = await fetchedText(p, url);
  assert.match(text, /--sw-smoke-deploy: 3;/, 'the worker answered with the right bytes');
  // The worker answers first and stores after, so wait for the stored copy rather than read it at once.
  assert.ok(await until(async () => /--sw-smoke-deploy: 3;/.test(await storedText(p, before.cache, url))), 'and stored them');
  // The next online visit installs the new worker.
  assert.ok(await reload(p), 'online, the page opens');
  assert.ok(await until(async () => JSON.stringify((await held(p)).caches) === JSON.stringify([next.cache])), `the new worker installed (${await state(p)})`);
  const installed = await storedText(p, next.cache, url);
  assert.match(installed, /--sw-smoke-deploy: 3;/, 'the new cache holds the new stylesheet');
  quiet(p, 'stamp mismatch', { offline: true });
});

await check('a deploy whose new files fail partway keeps the last complete version offline', async () => {
  const before = deployed();
  const oldApp = pageStamp('script.js');
  const oldCss = pageStamp('style.css');
  writeFileSync(siteFile('script.js'), `${readSite('script.js')}\n/* sw-smoke deploy 4 */\n`);
  writeFileSync(siteFile('style.css'), `${readSite('style.css')}\n:root { --sw-smoke-deploy: 4; }\n`);
  bump();
  const newApp = pageStamp('script.js');
  const newCss = pageStamp('style.css');
  const dropped = [`${ORIGIN}/script.js?v=${newApp}`, `${ORIGIN}/style.css?v=${newCss}`];
  // The network dies after the page: the new page arrives, its new script and stylesheet do not.
  setOverrides({ [`/script.js?v=${newApp}`]: 'drop', [`/style.css?v=${newCss}`]: 'drop' });
  await p.s('Page.navigate', { url: `${ORIGIN}/` });
  assert.ok(await until(async () => (await loadedWith(p, `script[src="script.js?v=${newApp}"]`, null)), 8000), 'online, the new page arrived');
  await sleep(3000);
  assert.deepEqual((await held(p)).caches, [before.cache], 'the new worker did not install; the old cache stays');
  const storedPage = await storedText(p, before.cache, `${ORIGIN}/`);
  assert.ok(storedPage.includes(`script.js?v=${oldApp}`), 'the stored page is still the last complete one');
  forgive(p, dropped);
  relay.setOnline(false);
  assert.ok(await reload(p), 'offline, the last complete version opens');
  assert.ok(await hasAll(p, [`script[src="script.js?v=${oldApp}"]`, `link[href="style.css?v=${oldCss}"]`]), 'offline, the previous page and its files');
  await sameReadout(p, 'check 5');
  relay.setOnline(true);
  quiet(p, 'partial deploy, offline', { offline: true });
  // The network recovers: the next online visit keeps the new page with its files, and the new
  // worker installs.
  setOverrides({});
  assert.ok(await go(p, `${ORIGIN}/`), 'online, the new version opens');
  const next = deployed();
  assert.ok(await until(async () => JSON.stringify((await held(p)).caches) === JSON.stringify([next.cache])), `the new worker installed (${await state(p)})`);
  assert.ok(await until(async () => (await workerSettled(p, false))), 'the new worker controls the page');
  relay.setOnline(false);
  assert.ok(await reload(p), 'offline, the new version opens');
  assert.ok(await hasAll(p, [`script[src="script.js?v=${newApp}"]`]), 'offline, the new page');
  await sameReadout(p, 'check 6');
  relay.setOnline(true);
  quiet(p, 'partial deploy, recovered', { offline: true });
});

await check('a file opened in a tab is left to the browser and never stored', async () => {
  const { cache } = deployed();
  documents.length = 0;
  await p.s('Page.navigate', { url: `${ORIGIN}/sw.js` });
  assert.ok(await until(async () => (await loadedWith(p, null, '/sw.js')), 8000), '/sw.js opened');
  await sleep(1000);
  assert.deepEqual(documents.map((d) => [d.url, d.fromServiceWorker]), [[`${ORIGIN}/sw.js`, false]], 'the worker did not answer it');
  const keys = await storedIn(p, cache, true);
  assert.ok(!keys.includes('/sw.js'), `not stored (${JSON.stringify(keys)})`);
  // A text file has no icon link, so Chromium asks for /favicon.ico by itself, which the site does
  // not have: that one 404 is the browser's, not the worker's.
  assert.ok(p.log.requests.some((r) => r.url === `${ORIGIN}/favicon.ico`), 'the browser asked for /favicon.ico');
  const notFound = 'network: Failed to load resource: the server responded with a status of 404 (Not Found)';
  assert.ok(p.log.errors.filter((e) => e === notFound).length <= 1, 'at most the one favicon 404');
  const others = p.log.errors.filter((e) => e !== notFound);
  p.log.errors.length = 0;
  p.log.errors.push(...others);
  assert.ok(await go(p, `${ORIGIN}/`), 'back to the page');
  quiet(p, 'a file in a tab');
});

await check('a first visit while the edge serves an older sw.js and older files next to a newer page installs nothing', async () => {
  // What the edge still holds from the previous deploy: sw.js and the stamped files it lists.
  const oldApp = pageStamp('script.js');
  const oldCss = pageStamp('style.css');
  const oldSw = keep('sw.js', 'old-sw.js');
  const oldAppFile = keep('script.js', 'old-script.js');
  const oldCssFile = keep('style.css', 'old-style.css');
  writeFileSync(siteFile('script.js'), `${readSite('script.js')}\n/* sw-smoke deploy 5 */\n`);
  writeFileSync(siteFile('style.css'), `${readSite('style.css')}\n:root { --sw-smoke-deploy: 5; }\n`);
  bump();
  setOverrides({
    '/sw.js': { file: oldSw },
    [`/script.js?v=${oldApp}`]: { file: oldAppFile },
    [`/style.css?v=${oldCss}`]: { file: oldCssFile },
  });
  // A phone that never visited: the page (never cached at the edge) is new, and works online.
  const q = await openPage(browser, `${ORIGIN}/?offline=1`, { timezone: 'Europe/Oslo' });
  assert.ok(await hasAll(q, [`script[src="script.js?v=${pageStamp('script.js')}"]`]), 'the new page');
  await sameReadout(q, 'check 7');
  await sleep(4000);
  assert.deepEqual(await held(q), { workers: 0, caches: [] }, 'the older worker did not install a page whose scripts it lacks');
  quiet(q, 'older sw.js at the edge');
  // The edge catches up: the next visit installs, and the page then opens offline even with the
  // HTTP cache emptied (which would otherwise hide a missing file).
  setOverrides({});
  assert.ok(await go(q, `${ORIGIN}/?offline=1`), 'online, the page opens');
  assert.ok(await until(async () => (await isControlled(q))), `the current worker installed (${await state(q)})`);
  assert.deepEqual((await held(q)).caches, [deployed().cache]);
  await q.s('Network.clearBrowserCache');
  relay.setOnline(false);
  assert.ok(await reload(q), 'offline, the page opens');
  await sameReadout(q, 'check 8');
  assert.equal(await q.run(() => document.fonts.ready.then(() => document.fonts.check('16px InterVariable'))), true, 'offline, the page font comes from the worker');
  relay.setOnline(true);
  // With the HTTP cache emptied, two requests the worker leaves to the network fail offline, as
  // designed: Cloudflare's speculation rules (/cdn-cgi/, passed through) and the static Inter
  // face the browser asks for while InterVariable is still loading (not in ASSETS). The page is
  // whole without them; the HTTP cache hides both in the other offline checks.
  forgive(q, [`${ORIGIN}/cdn-cgi/speculation`, `${ORIGIN}/fonts/inter/Inter-Regular.woff2`]);
  quiet(q, 'older sw.js at the edge, recovered', { offline: true });
  await q.close();
});

await check("kill switch 1: with OFFLINE_PILOT = 'off' the next visit leaves no worker and no cache", async () => {
  edit('script.js', "const OFFLINE_PILOT = 'opt-in';", "const OFFLINE_PILOT = 'off';");
  bump();
  assert.ok(await go(p, `${ORIGIN}/?offline=1`), 'online, the page opens');
  let visits = 1;
  let clean = await until(async () => JSON.stringify(await held(p)) === JSON.stringify({ workers: 0, caches: [] }), 10000);
  if (!clean) { visits += 1; await go(p, `${ORIGIN}/?offline=1`); clean = await until(async () => JSON.stringify(await held(p)) === JSON.stringify({ workers: 0, caches: [] }), 10000); }
  assert.ok(clean, `no worker and no cache (${JSON.stringify(await held(p))})`);
  console.log(`  (clean after ${visits} visit${visits > 1 ? 's' : ''})`);
  // The worker still answers this page until it closes; a later request (an icon, a font) must
  // not bring a cache back (fix round 1, verify 0 offline C-1).
  const controlled = await isControlled(p);
  assert.ok(await p.run((files) => Promise.all(files.map((u) => fetch(u).then((r) => r.ok))).then((a) => a.every(Boolean)), ['/favicon.svg', '/switcher-icons/username.svg', '/fonts/inter/InterVariable.woff2']), 'the later requests succeed');
  await sleep(1500);
  assert.deepEqual(await held(p), { workers: 0, caches: [] }, `still no cache after later requests (page controlled: ${controlled})`);
  // A reload asks the server for the page (the HTTP cache alone may still answer a plain
  // navigation for ten minutes, worker or not); offline, nothing is left to answer it.
  relay.setOnline(false);
  assert.equal(await reload(p, 4000), false, 'offline, a reload finds no worker to answer');
  relay.setOnline(true);
  edit('script.js', "const OFFLINE_PILOT = 'off';", "const OFFLINE_PILOT = 'opt-in';");
  bump();
  quiet(p, 'kill switch 1', { offline: true });
});

await check('kill switch 2: with KILL = true the next visit leaves no worker and no cache, and nothing loops', async () => {
  // With no worker, a plain navigation may still get the 'off' page from the HTTP cache (index.html
  // is fresh there for ten minutes, as on the live site); a reload asks the server for it.
  assert.ok(await go(p, `${ORIGIN}/?offline=1`), 'online, the page opens');
  assert.ok(await reload(p), 'online, a reload opens the opt-in page');
  assert.ok(await until(async () => (await isControlled(p))), `installed again: ${await state(p)}`);
  edit('sw.js', 'const KILL = false;', 'const KILL = true;');
  assert.ok(await go(p, `${ORIGIN}/?offline=1`), 'online, the page opens');
  await p.run(() => { window.__stay = 1; });
  assert.ok(await until(async () => JSON.stringify(await held(p)) === JSON.stringify({ workers: 0, caches: [] }), 15000), `no worker and no cache (${JSON.stringify(await held(p))})`);
  await sleep(3000);
  assert.equal(await p.run(() => window.__stay), 1, 'the page did not reload itself');
  assert.deepEqual(await held(p), { workers: 0, caches: [] }, 'and it stays that way');
  await sameReadout(p, 'check 9');
  // Recovery: a fixed worker deployed again installs on the next ?offline=1 visit.
  edit('sw.js', 'const KILL = true;', 'const KILL = false;');
  assert.ok(await go(p, `${ORIGIN}/?offline=1`), 'online, the page opens');
  assert.ok(await until(async () => (await isControlled(p))), 'installed again after KILL is undone');
  assert.deepEqual((await held(p)).caches, [deployed().cache]);
  quiet(p, 'kill switch 2', { offline: true });
});

await check('after a revert that deletes sw.js, a KILL sw.js served again clears the stranded worker', async () => {
  // The state check 10 left: the worker installed again, opt-in.
  assert.ok(await until(async () => (await isControlled(p))), `installed: ${await state(p)}`);
  const before = keep('sw.js', 'sw-before-retire.js');
  // The revert: sw.js gone (it answers 404) and offlinePilot() no longer called by script.js.
  rmSync(siteFile('sw.js'));
  edit('script.js', '    try {\n        offlinePilot();\n    }\n    catch { }\n', '');
  bump();
  for (let visit = 0; visit < 2; visit += 1) assert.ok(await go(p, `${ORIGIN}/`), 'online, the reverted page opens');
  await p.run(() => navigator.serviceWorker.getRegistration().then((r) => r && r.update()).then(() => undefined).catch(() => undefined));
  await sleep(1500);
  const stranded = await held(p);
  console.log(`  (after the revert: ${stranded.workers} worker(s), caches ${JSON.stringify(stranded.caches)})`);
  // Chromium reports the failed update of a deleted sw.js; that is what the check provokes.
  const kept = p.log.errors.filter((e) => !/sw\.js|status of 404|bad HTTP response code/.test(e));
  p.log.errors.length = 0;
  p.log.errors.push(...kept);
  // The way back: a sw.js with KILL = true served again.
  writeFileSync(siteFile('sw.js'), readFileSync(before, 'utf8').replace('const KILL = false;', 'const KILL = true;'));
  assert.match(readSite('sw.js'), /const KILL = true;/);
  bump();
  let visits = 0;
  let clean = false;
  while (!clean && visits < 3) {
    visits += 1;
    assert.ok(await go(p, `${ORIGIN}/`), 'online, the page opens');
    clean = await until(async () => JSON.stringify(await held(p)) === JSON.stringify({ workers: 0, caches: [] }), 10000);
  }
  assert.ok(clean, `no worker and no cache (${JSON.stringify(await held(p))}, ${await state(p)})`);
  console.log(`  (clean after ${visits} visit${visits > 1 ? 's' : ''})`);
  await sameReadout(p, 'check 10');
  quiet(p, 'retire');
});

await p.close();
console.log(`sw-smoke: all ${passed} checks passed`);
await cleanup();
