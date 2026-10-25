// A small driver for headless Chromium over the DevTools protocol, with nothing but Node 24
// built-ins (its own WebSocket). Used by tests/smoke.ts and tests/capture-vectors.ts. Not a test
// file itself.
//
// Copied on 24 October 2026 from MoonApp's tests/cdp.ts (c56972b; itself from SunApp's,
// EclipseTracker's and GDPRLetterBuilder's tests/cdp.mjs). Changes for UsernameGenerator: the page
// counts as ready once its first username and its strength readout are on screen (script.js writes
// both from DOMContentLoaded, after fetching the word lists); there is no first-run notice and no
// date field, so the gate handling, setDate and the select-width check are gone; a page can have
// addresses refused (block, through the Fetch domain) to drive the page's fallback paths; and focus
// mobile emulation is off unless asked for (UsernameGenerator's terminal guide is 632 px wide, so with it
// Chromium widens the layout viewport to fit and presses land off target); focus
// emulation is on, so pages running side by side in one browser all behave as the focused one.
//
// Every page opens in a fresh browser context. Everything the page requests, logs or is refused by
// its policy is recorded on page.log.
//
// Code that runs inside the page is TypeScript too (the "In TS" rule, style-tools): it is written
// as typed functions with the DOM library behind them, which this project's strict check reads,
// and sent with inPage(), which serialises the function (Node strips the types, so what is sent is
// the same text with them blanked out) and the JSON of its arguments. A function sent that way has
// no closure: it may use only its parameters and the page's own globals. tests/static.test.ts holds
// the tests to it: no string literal is handed to ev, waitFor, Runtime.evaluate or an init script.
//
// Types: what comes back over the DevTools protocol, and what a page evaluation returns, is JSON
// from the browser, outside anything tsc can know. It is typed FromBrowser (any) in this one place
// on purpose, so the checks read it as they always have; everything of this file's own is typed.

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** JSON from the browser (a protocol result, an event, an evaluated value): untyped on purpose. */
export type FromBrowser = any;
type Send = (method: string, params?: Record<string, unknown>, sessionId?: string) => Promise<FromBrowser>;
type Listener = (message: FromBrowser) => void;

/** A running Chromium: send a protocol command, listen to every message, close it. */
export interface Browser {
  readonly send: Send;
  readonly listeners: Set<Listener>;
  readonly close: () => Promise<void>;
  readonly profile: string;
}

/** What a page recorded: errors, requests (and those off the origin), policy refusals, the console, downloads. */
export interface PageLog {
  readonly errors: string[];
  readonly requests: Array<{ url: string; type: string; method: string; postData: string; headers: Record<string, string>; t: number }>;
  readonly offsite: string[];
  readonly csp: string[];
  readonly console: string[];
  readonly downloads: FromBrowser[];
}

export interface PageOptions {
  width?: number;
  height?: number;
  init?: string | null;
  mobile?: boolean;
  downloads?: string | null;
  base?: string | null;
  timezone?: string | null;
  /** Regular expressions: a request whose address matches one fails, from the first load on. */
  refuse?: readonly string[];
}

type Key = 'Tab' | 'Space' | 'Enter' | 'Escape' | 'ArrowDown' | 'ArrowUp' | 'Backspace';

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

declare global {
  interface Window {
    /** Policy violations the page reported (cdp.ts), "directive blockedURI". */
    __csp: string[];
    /** Where the last mouse press landed (cdp.ts). */
    __down: Node | null;
    /** Fetches in flight, counted by the scenarios' init function. */
    __inflight: number;
    /** What the page wrote to the clipboard, recorded by the scenarios' init function. */
    __copied: string[];
  }
}

/**
 * The JavaScript that calls fn(...args) in the page: a typed function of the tests, serialised
 * (Node blanks its types out when it loads the file, so toString() is plain JavaScript) with its
 * arguments as JSON. fn must not use anything outside itself but its parameters and the page's
 * globals.
 */
export const inPage = <A extends readonly unknown[]>(fn: (...args: A) => unknown, ...args: A): string =>
  `(${fn.toString()})(...${JSON.stringify(args)})`;

/** Records the page's policy violations on window.__csp. Runs before the page's own scripts. */
const watchPolicy = (): void => {
  window.__csp = [];
  document.addEventListener('securitypolicyviolation', (e) => { window.__csp.push(e.violatedDirective + ' ' + e.blockedURI); }, true);
};

/** Records where the last mouse press landed on window.__down, so click() can say so when it misses. */
const watchPress = (): void => {
  window.__down = null;
  document.addEventListener('mousedown', (e) => { window.__down = e.target as Node; }, true);
};

export async function launchChromium({ chromium = '/usr/bin/chromium', out, args = [] }: { chromium?: string; out: string; args?: readonly string[] }): Promise<Browser> {
  mkdirSync(out, { recursive: true });
  const profile = mkdtempSync(join(out, 'profile-'));
  const proc = spawn(chromium, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--disable-sync', '--disable-component-update', '--disable-breakpad', '--disable-crash-reporter',
    '--disable-features=Translate,OptimizationHints,MediaRouter', ...args, 'about:blank'], {
    stdio: ['ignore', 'ignore', 'pipe'],
    // Keeps Chromium's own folders inside the throwaway profile instead of the person's ~/.config/chromium.
    env: { ...process.env, XDG_CONFIG_HOME: join(profile, 'xdg-config'), CHROME_CONFIG_HOME: join(profile, 'xdg-config'), XDG_CACHE_HOME: join(profile, 'xdg-cache') },
  });
  const wsUrl = await new Promise<string>((res, rej) => {
    let buf = '';
    const t = setTimeout(() => rej(new Error('Chromium did not start')), 30000);
    proc.stderr.on('data', (d) => {
      buf += d;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
      if (m && m[1]) { clearTimeout(t); res(m[1]); }
    });
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let seq = 0;
  const pending = new Map<number, { res: (v: FromBrowser) => void; rej: (e: Error) => void }>();
  const listeners = new Set<Listener>();
  ws.addEventListener('message', (ev) => {
    const m: FromBrowser = JSON.parse(String(ev.data));
    const p = m.id ? pending.get(m.id) : undefined;
    if (p) {
      pending.delete(m.id);
      if (m.error) p.rej(new Error(JSON.stringify(m.error)));
      else p.res(m.result);
    } else for (const fn of listeners) fn(m);
  });
  const send: Send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const close = async (): Promise<void> => {
    try { await send('Browser.close'); } catch { /* already gone */ }
    proc.kill('SIGKILL');
  };
  return { send, listeners, close, profile };
}

/**
 * Opens url in a new context. Options: width, height, init (a script run before the page's own),
 * mobile, downloads (a folder for real downloads), base, timezone.
 */
export async function openPage(browser: Browser, url: string, { width = 1280, height = 900, init = null, mobile = false, downloads = null, base = null, timezone = null, refuse = [] }: PageOptions = {}) {
  const { send, listeners } = browser;
  const { browserContextId } = await send('Target.createBrowserContext');
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m: string, p?: Record<string, unknown>): Promise<FromBrowser> => send(m, p, sessionId);
  const origin = new URL(base || url).origin;
  const log: PageLog = { errors: [], requests: [], offsite: [], csp: [], console: [], downloads: [] };
  const onMsg: Listener = (m) => {
    if (m.method === 'Browser.downloadProgress' && m.params.state === 'completed') log.downloads.push(m.params);
    if (m.method === 'Browser.downloadWillBegin') log.downloads.push({ begin: m.params.suggestedFilename, url: m.params.url });
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Runtime.exceptionThrown') log.errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = m.params.args.map((a: FromBrowser) => a.value ?? a.description).join(' ');
      log.console.push(`${m.params.type}: ${text}`);
      if (m.params.type === 'error') log.errors.push(text);
    }
    if (m.method === 'Log.entryAdded') {
      if (/Content Security Policy|Refused to/i.test(m.params.entry.text)) log.csp.push(m.params.entry.text);
      else if (m.params.entry.level === 'error') log.errors.push(`${m.params.entry.source}: ${m.params.entry.text}`);
    }
    if (m.method === 'Network.requestWillBeSent') {
      const r = m.params.request;
      log.requests.push({ url: r.url, type: m.params.type, method: r.method, postData: r.postData || '', headers: r.headers, t: Date.now() });
      if (!r.url.startsWith(origin) && !r.url.startsWith('data:') && !r.url.startsWith('blob:')) log.offsite.push(r.url);
    }
  };
  listeners.add(onMsg);
  await s('Runtime.enable');
  await s('Network.enable');
  await s('Page.enable');
  await s('Log.enable');
  await s('DOM.enable');
  await s('Emulation.setFocusEmulationEnabled', { enabled: true });
  await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  if (timezone) await s('Emulation.setTimezoneOverride', { timezoneId: timezone });
  if (downloads) await send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: downloads, browserContextId, eventsEnabled: true });
  await s('Page.addScriptToEvaluateOnNewDocument', { source: inPage(watchPolicy) });
  // Where the last press landed, so click() can say so when it misses.
  await s('Page.addScriptToEvaluateOnNewDocument', { source: inPage(watchPress) });
  if (init) await s('Page.addScriptToEvaluateOnNewDocument', { source: init });
  const ev = async (expression: string): Promise<FromBrowser> => {
    const r = await s('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const waitFor = async (expression: string, ms = 10000): Promise<boolean> => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      try { if (await ev(expression)) return true; } catch { /* the page is still loading */ }
      await sleep(50);
    }
    return false;
  };
  /** Calls a typed function in the page (see inPage) and returns what it returns, awaited. */
  const run = <A extends readonly unknown[], R>(fn: (...args: A) => R, ...args: A): Promise<Awaited<R>> => ev(inPage(fn, ...args));
  /** Calls a typed function in the page until it returns something true, for up to ms milliseconds; false if it never did. */
  const until = <A extends readonly unknown[]>(ms: number, fn: (...args: A) => unknown, ...args: A): Promise<boolean> => waitFor(inPage(fn, ...args), ms);
  // Refuses (the request fails, as if the network had) every address the pattern matches; the
  // page's own fallbacks then run. Empty by default: an address nobody blocked goes through.
  const refused = new Set<string>();
  const onPaused: Listener = (m) => {
    if (m.sessionId !== sessionId || m.method !== 'Fetch.requestPaused') return;
    const blocked = [...refused].some((re) => new RegExp(re).test(m.params.request.url));
    void s(blocked ? 'Fetch.failRequest' : 'Fetch.continueRequest', blocked ? { requestId: m.params.requestId, errorReason: 'Failed' } : { requestId: m.params.requestId });
  };
  listeners.add(onPaused);
  const block = async (...patterns: string[]): Promise<void> => {
    for (const p of patterns) refused.add(p);
    await s('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  };
  const load = async (target = url): Promise<void> => {
    await s('Page.navigate', { url: target });
    await until(20000, () => document.readyState === 'complete');
    await until(20000, () => document.fonts.status === 'loaded');
    // And no CSS transition still running: the output box eases for a moment after the username
    // appears, and a press aimed while it moves would land on whatever slid under the pointer.
    await until(20000, () => !document.getAnimations().some((a) => a instanceof CSSTransition && a.playState === 'running'));
    // Ready: the first username has replaced the placeholder and the readout has its figure.
    await until(20000, () => {
      const output = document.getElementById('output');
      return output?.textContent !== 'Initialize to begin...' && !output?.classList.contains('loading') && /bits/.test(document.getElementById('strengthBits')?.textContent ?? '');
    });
    await sleep(150);
  };
  if (refuse.length) await block(...refuse);
  await load();
  const settle = async (): Promise<void> => {
    let last = await run(() => window.scrollY);
    for (let i = 0; i < 40; i++) {
      await sleep(50);
      const now = await run(() => window.scrollY);
      if (now === last) return;
      last = now;
    }
  };
  // Presses an element in its centre with real mouse events, after scrolling it into view and
  // checking nothing covers it there. The element's box is measured until two measurements 60 ms
  // apart agree: a layout that is still moving (a web font arriving, the readout changing the
  // height of its line) would otherwise send the press to whatever slid under the pointer.
  const click = async (selector: string): Promise<void> => {
    await run((sel) => { document.querySelector(sel)?.scrollIntoView({ block: 'center', behavior: 'instant' }); }, selector);
    await settle();
    const measure = (): Promise<{ err?: string; x: number; y: number; ok: boolean }> => run((sel) => {
      const el = document.querySelector(sel);
      if (!el) return { err: 'not found', x: 0, y: 0, ok: false };
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) return { err: 'not visible', x: 0, y: 0, ok: false };
      const x = b.left + b.width / 2, y = b.top + b.height / 2;
      const hit = document.elementFromPoint(x, y);
      const labels = (el as HTMLInputElement).labels;
      return { x, y, ok: !!hit && (hit === el || el.contains(hit) || (!!labels && [...labels].some((l) => l.contains(hit)))) };
    }, selector);
    let r = await measure();
    for (let i = 0; i < 40; i++) {
      await sleep(60);
      const again = await measure();
      const same = again.x === r.x && again.y === r.y;
      r = again;
      if (same) break;
    }
    if (r.err || !r.ok) throw new Error(`cannot press ${selector}: ${r.err || 'covered'}`);
    await s('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
    await s('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await s('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await sleep(80);
    const landed = await run((sel) => {
      const el = document.querySelector(sel)!, t = window.__down;
      const b = el.getBoundingClientRect();
      const labels = (el as HTMLInputElement).labels;
      const element = t instanceof Element ? t : null;
      return {
        ok: !!t && (t === el || el.contains(t) || (!!labels && [...labels].some((l) => l.contains(t)))),
        target: element ? (element.id || element.tagName) : null,
        rectNow: [b.left, b.top, b.width, b.height],
      };
    }, selector);
    if (!landed.ok) throw new Error(`the press on ${selector} at ${r.x},${r.y} landed on ${landed.target}; the element is now at ${landed.rectNow}`);
  };
  const KEYS: Record<Key, { key: string; code: string; windowsVirtualKeyCode: number; text?: string }> = {
    Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
    Space: { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' },
    Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
    Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
    ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
    ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
    Backspace: { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 },
  };
  const key = async (k: Key, { shift = false }: { shift?: boolean } = {}): Promise<void> => {
    const d = KEYS[k];
    const modifiers = shift ? 8 : 0;
    await s('Input.dispatchKeyEvent', { type: 'keyDown', modifiers, ...d });
    await s('Input.dispatchKeyEvent', { type: 'keyUp', modifiers, key: d.key, code: d.code, windowsVirtualKeyCode: d.windowsVirtualKeyCode });
    await sleep(40);
  };
  // Types into a field as a person would: focus, select what is there, insert the text.
  const type = async (selector: string, text: string, { replace = true }: { replace?: boolean } = {}): Promise<void> => {
    await run((sel, all) => {
      const t = document.querySelector(sel) as HTMLInputElement;
      t.scrollIntoView({ block: 'center', behavior: 'instant' });
      t.focus();
      if (all) t.select?.(); else t.selectionStart = t.selectionEnd = t.value.length;
    }, selector, replace);
    if (replace) {
      await s('Input.dispatchKeyEvent', { type: 'keyDown', ...KEYS.Backspace });
      await s('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    }
    if (text) await s('Input.insertText', { text });
    await sleep(60);
  };
  const shot = async (path: string): Promise<void> => {
    const h = await run(() => Math.min(document.documentElement.scrollHeight, 12000));
    const r = await s('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: h, scale: 1 } });
    writeFileSync(path, Buffer.from(r.data, 'base64'));
  };
  const viewShot = async (path: string): Promise<void> => {
    const r = await s('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path, Buffer.from(r.data, 'base64'));
  };
  const close = async (): Promise<void> => {
    listeners.delete(onMsg);
    listeners.delete(onPaused);
    await send('Target.closeTarget', { targetId }).catch(() => {});
    await send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
  };
  return { s, ev, waitFor, run, until, click, key, type, shot, viewShot, close, load, log, block, browserContextId, sessionId, settle };
}

export type Page = Awaited<ReturnType<typeof openPage>>;
