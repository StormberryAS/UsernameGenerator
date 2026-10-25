// The page scenarios behind tests/page-vectors.json: what a person does on the page (change a
// control, generate, copy, press Enter, hover the language hint, pause the carousel, lose the word
// lists) and a snapshot of the page after each step. tests/capture-vectors.ts ran them against the
// UsernameGenerator 12ddca5 page and froze the snapshots; tests/smoke.ts runs them against the
// current page and requires the same snapshots, string for string. Not a test file itself. Added
// on 24 October 2026 with the TypeScript move, on the pattern of MoonApp's tests/scenarios.ts.
//
// Determinism. The page draws every word, digit and separator from crypto.getRandomValues, which
// is the right thing to do and the wrong thing to replay. Each page therefore gets, before its own
// code runs, a fixed xorshift128 stream in place of that one function (RANDOM below); the same
// clicks then draw the same words in every tree. Only the test browser is touched: the shipped
// page still calls the platform CSPRNG, and a static test holds script.js to that. The clipboard
// is a stub that records what was written. The mouse is parked in the top left corner after every
// press, so Chromium's own hover update after a layout change can never show the language hint by
// accident. A step ends when nothing is in flight: no fetch, no username still loading, no pop
// animation.

import { createHash } from 'node:crypto';
import { inPage, openPage, sleep } from './cdp.ts';
import type { Browser, FromBrowser, Page } from './cdp.ts';

const J = JSON.stringify;

/**
 * Runs in the page before its own code (sent with inPage): replaces crypto.getRandomValues with
 * xorshift128 from a seed, counts fetches in flight, and records clipboard writes.
 */
const installTestHooks = (seed: number): void => {
  let a = (0x9E3779B9 ^ seed) >>> 0, b = 0x243F6A88, c = 0xB7E15162, d = 0xDEADBEEF;
  const next = (): number => { let t = d; const s = a; d = c; c = b; b = s; t ^= t << 11; t ^= t >>> 8; a = (t ^ s ^ (s >>> 19)) >>> 0; return a; };
  Object.defineProperty(crypto, 'getRandomValues', { configurable: true, value: (array: Uint32Array): Uint32Array => { for (let i = 0; i < array.length; i++) array[i] = next(); return array; } });
  window.__inflight = 0;
  const realFetch = window.fetch;
  window.fetch = function (this: unknown, ...args: Parameters<typeof fetch>): Promise<Response> { window.__inflight++; return realFetch.apply(this, args).finally(() => { window.__inflight--; }); };
  window.__copied = [];
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (text: string): Promise<void> => { window.__copied.push(text); return Promise.resolve(); } } });
};

/** The script that installs the test hooks with this seed, for the init option of openPage. */
export const initScript = (seed: number): string => inPage(installTestHooks, seed);

/** Removes every ?v= stamp, so trees whose files differ only in their bytes compare equal. */
export const unstamp = (s: string): string => s.replace(/\?v=[0-9a-f]{8}/g, '?v=STAMP');

/** What one snapshot holds: the parts of the page script.js writes to, and a hash of all of it. */
export type Snap = Record<string, string | boolean | number | null | string[]>;

/** Waits until nothing is loading, in flight or in a CSS transition for three polls in a row (75 ms). */
export async function idle(p: Page): Promise<void> {
  const ok = await p.until(20000, () => new Promise<boolean>((done) => {
    let quiet = 0;
    const poll = (): void => {
      const o = document.getElementById('output')!;
      const busy = window.__inflight > 0 || o.classList.contains('loading') || o.style.transform === 'scale(1.02)'
        || document.getElementById('generateBtn')!.style.pointerEvents === 'none'
        || document.getAnimations().some((a) => a instanceof CSSTransition && a.playState === 'running');
      quiet = busy ? 0 : quiet + 1;
      if (quiet >= 3) done(true); else setTimeout(poll, 25);
    };
    poll();
  }));
  if (!ok) throw new Error('the page never went quiet');
}

/** The page as script.js left it, after two animation frames. */
export async function snapshot(p: Page, extra: Snap = {}): Promise<Snap> {
  const raw: FromBrowser = await p.run(() => new Promise<Record<string, string | boolean | null | string[]>>((done) => requestAnimationFrame(() => requestAnimationFrame(() => {
    const el = (id: string): HTMLInputElement => document.getElementById(id) as HTMLInputElement;
    const bubble = getComputedStyle(document.querySelector('.hint-bubble')!);
    done({
      output: el('output').textContent, outputClass: el('output').className, outputStyle: el('output').getAttribute('style'),
      bits: el('strengthBits').textContent, detail: el('strengthDetail').textContent,
      hint: el('maxHint').textContent, hintClass: el('maxHint').className,
      controls: ['words', 'type', 'lang', 'separator', 'digitPosition', 'digitCount'].map((id) => id + '=' + el(id).value).join(' ') + ' digits=' + el('digits').checked,
      disabled: el('digitPosition').disabled + ' ' + el('digitCount').disabled,
      groups: [...document.querySelectorAll('.digit-option')].map((g) => g.className).join(' | '),
      generateStyle: el('generateBtn').getAttribute('style'), copyStyle: el('copyBtn').getAttribute('style'),
      focus: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null,
      bubble: bubble.visibility + ' ' + bubble.opacity + ' ' + bubble.display,
      pause: el('switcher-pause').checked,
      track: getComputedStyle(document.querySelector('.app-switcher-track')!).animationName,
      copied: window.__copied,
      doc: document.documentElement.outerHTML,
    });
  }))));
  const snap: Snap = {};
  for (const [k, val] of Object.entries(raw as Record<string, string | boolean | number | null | string[]>)) {
    // The whole document is kept as a hash: the readable fields above say what changed, the hash
    // that nothing else did.
    if (k === 'doc') snap.docSha256 = createHash('sha256').update(unstamp(String(val))).digest('hex');
    else snap[k] = typeof val === 'string' ? unstamp(val) : val;
  }
  // What the page asked the network for and wrote to the console, so far.
  snap.dataRequests = p.log.requests.map((r) => r.url.replace(/^https?:\/\/[^/]+\//, '')).filter((u) => u.startsWith('data/'));
  // Only the first line of each message (the rest is a stack trace with line numbers and the test
  // server's port), and sorted: parallel fetches fail in no fixed order, and the order is not the page's behaviour.
  const firstLine = (m: string): string => unstamp(m.split('\n')[0] ?? '');
  snap.console = p.log.console.map(firstLine).sort();
  snap.errors = p.log.errors.map(firstLine).sort();
  return { ...snap, ...extra };
}

/** Waits until the language hint's bubble has finished fading to the wanted opacity (1 shown, 0 hidden), and held it for 60 ms. */
export async function hintSettled(p: Page, opacity: 0 | 1): Promise<void> {
  const ok = await p.until(10000, (want: string) => new Promise<boolean>((done) => {
    const o = (): string => getComputedStyle(document.querySelector('.hint-bubble')!).opacity;
    setTimeout(() => done(o() === want), 60);
  }), String(opacity));
  if (!ok) throw new Error(`the hint never reached opacity ${opacity}`);
}

/** Moves the mouse to the top left corner, away from every control. */
export const parkMouse = async (p: Page): Promise<void> => {
  await p.s('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 });
  await sleep(30);
};

/** Presses an element with real mouse events, then parks the mouse and waits for the page. */
export const press = async (p: Page, selector: string): Promise<void> => {
  await p.click(selector);
  await parkMouse(p);
  await idle(p);
};

/** Sets a select or number field as a person's choice would: the value, then input and change. */
export const setControl = async (p: Page, id: string, value: string): Promise<void> => {
  await p.run((id, value) => {
    const t = document.getElementById(id) as HTMLInputElement;
    t.value = value;
    t.dispatchEvent(new Event('input', { bubbles: true }));
    t.dispatchEvent(new Event('change', { bubbles: true }));
  }, id, value);
  await idle(p);
};

/** Switches the digits checkbox to the wanted state with a click, as the checkbox itself would be. */
export const setDigits = async (p: Page, on: boolean): Promise<void> => {
  await p.run((on) => { const t = document.getElementById('digits') as HTMLInputElement; if (t.checked !== on) t.click(); }, on);
  await idle(p);
};

/** The defaults index.html gives each control. */
const DEFAULTS: Record<string, string> = { words: '2', type: 'mixed', lang: 'random', separator: 'random', digitPosition: 'after', digitCount: '1' };

/** Puts every control back to its default. */
export async function resetControls(p: Page): Promise<void> {
  for (const [id, v] of Object.entries(DEFAULTS)) await setControl(p, id, v);
  await setDigits(p, true);
}

/** Gives the element with this id the keyboard focus. */
const focusId = (p: Page, id: string): Promise<void> => p.run((id) => { document.getElementById(id)!.focus(); }, id);

/** Takes the keyboard focus off whatever has it. */
const blurFocused = (p: Page): Promise<void> => p.run(() => { (document.activeElement as HTMLElement).blur(); });

/** Presses Generate and returns the username it showed. */
export async function generate(p: Page): Promise<string> {
  await press(p, '#generateBtn');
  return p.run(() => document.getElementById('output')!.textContent ?? '');
}

/** One recorded step: its name and the page after it. */
export interface Vector { name: string; snap: Snap }

type Rec = (name: string, extra?: Snap) => Promise<void>;
type Step = (p: Page, rec: Rec) => Promise<void>;
interface Scenario { name: string; seed: number; width: number; refuse?: readonly string[]; run: Step }

const LANGS = ['random', 'mix', 'nl', 'en', 'fr', 'de', 'it', 'la', 'no', 'pl', 'pt', 'ro', 'es'] as const;
const TYPES = ['mixed', 'noun', 'adjective', 'verb'] as const;
const SEPARATORS = ['random', 'mix', '-', '_', '.', ''] as const;

/** A small seeded generator (mulberry32) for choosing combinations, so the same ones are chosen every run. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Combo { words: number; type: string; lang: string; digits: boolean; position: string; count: number; separator: string }

/** The nth chosen combination of a seeded sequence. */
export function combinations(n: number, seed: number): Combo[] {
  const rnd = seeded(seed);
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)] as T;
  return Array.from({ length: n }, () => ({
    words: 1 + Math.floor(rnd() * 5), type: pick(TYPES), lang: pick(LANGS), digits: rnd() < 0.7,
    position: pick(['after', 'before']), count: 1 + Math.floor(rnd() * 5), separator: pick(SEPARATORS),
  }));
}

async function apply(p: Page, c: Combo): Promise<void> {
  await setControl(p, 'words', String(c.words));
  await setControl(p, 'type', c.type);
  await setControl(p, 'lang', c.lang);
  await setControl(p, 'separator', c.separator);
  await setDigits(p, c.digits);
  await setControl(p, 'digitPosition', c.position);
  await setControl(p, 'digitCount', String(c.count));
}

/** Sizes of the scenario families; the permanent replay uses the defaults, the build's equivalence harness larger ones. */
export interface Sizes { combos: number; repeatCombos: number; repeats: number }
export const SMALL: Sizes = { combos: 60, repeatCombos: 12, repeats: 3 };

/** The scenarios, in order. The vectors are their recorded steps, named "scenario / step". */
export function buildScenarios(sizes: Sizes = SMALL): Scenario[] {
  const out: Scenario[] = [];
  const family = (width: number, full: boolean): Scenario[] => [
    {
      name: `single controls ${width}`, seed: 11, width,
      run: async (p, rec) => {
        const singles: Array<[string, string[]]> = [
          ['words', ['1', '2', '3', '4', '5']], ['type', [...TYPES]], ['lang', [...LANGS]],
          ['separator', [...SEPARATORS]], ['digitPosition', ['before', 'after']], ['digitCount', ['1', '2', '3', '4', '5']],
        ];
        for (const [id, values] of singles) {
          // At the narrow width the first and the last value of each control are enough: the
          // layout differs there, the script does not.
          for (const v of full ? values : [values[0], values[values.length - 1]].filter((x): x is string => x !== undefined)) {
            await setControl(p, id, v);
            await rec(`${id} ${J(v)}`);
            await generate(p);
            await rec(`${id} ${J(v)} generated`);
            await resetControls(p);
          }
        }
        await setDigits(p, false);
        await rec('digits off');
        await generate(p);
        await rec('digits off generated');
        await setDigits(p, true);
        await rec('digits on again');
      },
    },
    {
      name: `max entropy ${width}`, seed: 12, width,
      run: async (p, rec) => {
        await press(p, '#maxEntropyBtn');
        await rec('max entropy pressed');
        await generate(p);
        await rec('generated at the maximum');
        await setControl(p, 'words', '4');
        await rec('one control moved off the maximum');
        await press(p, '#maxEntropyBtn');
        await rec('max entropy pressed again');
      },
    },
    {
      name: `copy ${width}`, seed: 13, width,
      run: async (p, rec) => {
        // The button turns green when the write succeeds and goes back after 1.5 s. The colour is read
        // 50 ms after the click inside the page, where no test latency can reach it; the snapshot
        // itself waits for the colour to be back.
        const green = await p.run(async () => {
          const copy = document.getElementById('copyBtn') as HTMLButtonElement;
          copy.click();
          await new Promise((r) => setTimeout(r, 50));
          return copy.style.color;
        });
        await p.until(5000, () => document.getElementById('copyBtn')!.style.color === '');
        await idle(p);
        await rec('copied: the button was green, and is restored', { colourAfter50ms: green });
        // Generate and Copy in one evaluation, so the copy lands while the username is still loading.
        const written = await p.run(() => {
          document.getElementById('generateBtn')!.click();
          document.getElementById('copyBtn')!.click();
          return window.__copied.length;
        });
        await idle(p);
        await rec('copy while loading copies nothing', { writtenAtThatMoment: written });
      },
    },
    {
      name: `enter key ${width}`, seed: 14, width,
      run: async (p, rec) => {
        await focusId(p, 'words');
        await p.key('Enter'); await idle(p);
        await rec('Enter in the words field generates');
        await focusId(p, 'type');
        await p.key('Enter'); await idle(p);
        await rec('Enter on the format list generates');
        await focusId(p, 'generateBtn');
        await p.key('Enter'); await idle(p);
        await rec('Enter on Generate generates once');
        await focusId(p, 'copyBtn');
        await p.key('Enter');
        await p.until(5000, () => document.getElementById('copyBtn')!.style.color !== '');
        await p.until(5000, () => document.getElementById('copyBtn')!.style.color === '');
        await idle(p);
        await rec('Enter on Copy copies and does not generate');
        await focusId(p, 'maxEntropyBtn');
        await p.key('Enter'); await idle(p);
        await rec('Enter on Max entropy applies it once');
        await blurFocused(p);
        await p.key('Enter'); await idle(p);
        await rec('Enter with nothing focused generates');
        await p.key('Space'); await idle(p);
        await rec('Space with nothing focused does nothing');
      },
    },
    {
      name: `language hint ${width}`, seed: 15, width,
      run: async (p, rec) => {
        const box = await p.run(() => { const b = document.querySelector('.hint')!.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
        await p.s('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
        await hintSettled(p, 1);
        await rec('pointer over the hint');
        await parkMouse(p);
        await hintSettled(p, 0);
        await rec('pointer away');
        await p.run(() => { (document.querySelector('.hint') as HTMLElement).focus(); });
        await hintSettled(p, 1);
        await rec('hint focused');
        await blurFocused(p);
        await hintSettled(p, 0);
        await rec('hint blurred');
      },
    },
    {
      name: `carousel pause ${width}`, seed: 16, width,
      run: async (p, rec) => {
        await rec('before');
        await press(p, 'label.switcher-pause-label');
        await rec('paused');
        await press(p, 'label.switcher-pause-label');
        await rec('running again');
      },
    },
  ];
  const w = 1280;
  out.push({ name: 'first load 1280', seed: 1, width: w, run: async (_p, rec) => { await rec('page as loaded'); } });
  out.push({ name: 'first load 390', seed: 2, width: 390, run: async (_p, rec) => { await rec('page as loaded'); } });
  out.push({
    name: 'narrow 320', seed: 3, width: 320,
    run: async (p, rec) => {
      await rec('page as loaded');
      await press(p, '#maxEntropyBtn');
      await rec('max entropy');
    },
  });
  out.push(...family(1280, true), ...family(390, false));
  out.push({
    name: 'combinations 1280', seed: 21, width: w,
    run: async (p, rec) => {
      let i = 0;
      for (const c of combinations(sizes.combos, 2026)) {
        await apply(p, c);
        await generate(p);
        await rec(`combination ${++i} ${J(c)}`);
      }
    },
  });
  out.push({
    name: 'repeated generation 1280', seed: 22, width: w,
    run: async (p, rec) => {
      let i = 0;
      for (const c of combinations(sizes.repeatCombos, 7)) {
        await apply(p, c);
        const names: string[] = [];
        for (let r = 0; r < sizes.repeats; r++) names.push(await generate(p));
        await rec(`combination ${++i} ${J(c)}, ${sizes.repeats} generations`, { generations: names.join(' ') });
      }
    },
  });
  out.push({
    name: 'word lists unavailable 1280', seed: 31, width: w, refuse: ['/data/[a-z]{2}_(nouns|adjectives|verbs)\\.txt'],
    run: async (p, rec) => {
      await rec('page as loaded');
      for (const lang of ['en', 'mix', 'random']) {
        await setControl(p, 'lang', lang);
        await generate(p);
        await rec(`language ${lang}`);
      }
    },
  });
  out.push({
    name: 'entropy model unavailable 1280', seed: 32, width: w, refuse: ['/data/entropy-model\\.tsv'],
    run: async (p, rec) => {
      await rec('page as loaded');
      for (const lang of ['en', 'mix', 'random']) {
        await setControl(p, 'lang', lang);
        await generate(p);
        await rec(`language ${lang}`);
      }
      await press(p, '#maxEntropyBtn');
      await rec('max entropy');
    },
  });
  out.push({
    name: 'nothing from data unavailable 1280', seed: 33, width: w, refuse: ['/data/'],
    run: async (p, rec) => {
      await rec('page as loaded');
      await generate(p);
      await rec('generated');
    },
  });
  return out;
}

/**
 * Runs every scenario in a fresh page of base and returns the recorded vectors, in order. Up to
 * parallel scenarios run at once, each in a browser context of its own.
 */
export async function runScenarios(browser: Browser, base: string, { only = null, after = null, sizes = SMALL, parallel = 4 }: {
  only?: RegExp | null;
  /** Called with each scenario's page before it closes, to check what it logged. */
  after?: ((p: Page, scenario: string) => void) | null;
  sizes?: Sizes;
  parallel?: number;
} = {}): Promise<Vector[]> {
  const scenarios = buildScenarios(sizes).filter((sc) => !only || only.test(sc.name));
  const results: Vector[][] = scenarios.map(() => []);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let i = next++; i < scenarios.length; i = next++) {
      const sc = scenarios[i];
      if (!sc) continue;
      const p = await openPage(browser, base, { width: sc.width, timezone: 'Europe/Oslo', init: initScript(sc.seed), refuse: sc.refuse ?? [] });
      try {
        await parkMouse(p);
        const into = results[i];
        if (!into) continue;
        await sc.run(p, async (step, extra) => { into.push({ name: `${sc.name} / ${step}`, snap: await snapshot(p, extra) }); });
        if (after) after(p, sc.name);
      } finally {
        await p.close();
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, scenarios.length) }, worker));
  return results.flat();
}
