// Loads the page's script into a Node vm context the way a browser does: as one classic script,
// the compiled script.js. Used by the Node tests (tests/*.test.ts) to call the page's own
// functions with no change to the page code. Not a test file itself. Written on 24 October 2026
// for UsernameGenerator's TypeScript move, on the pattern of MoonApp's and SunApp's tests/load.ts
// (a stub document, the page's functions typed by hand, a check of each one's parameter count),
// reduced to one script.
//
// The document is a stub, just enough for script.js: getElementById hands out one inert element
// per id (the form controls start at the values index.html gives them), the document and the
// window record their listeners and fire them only when a test asks (dom.fire), setTimeout keeps
// its callbacks until a test flushes them (the page waits 300 ms before it shows a new username),
// crypto is Node's, with getRandomValues replaceable by a test, and fetch reads data/ from disk.
//
// Two traps, written down so nobody has to find them again:
//  * Everything the page code creates (an array, an object, a promise) belongs to the context's
//    realm, so `instanceof Array` in this realm is false for a page array and deepStrictEqual
//    refuses to equate it with a host array. Tests compare primitives and JSON only. To call a
//    page function, take it with fn('name'), typed by PageFunctions below, and call it from
//    TypeScript: code inside a string passed to run() is JavaScript the strict check never reads,
//    so run() is for reading a value.
//  * Top-level const and let of a classic script are not properties of the global object.
//    run('REAL_LANGUAGES.length') reaches them, because the code runs as a script in that same
//    global scope; ctx.REAL_LANGUAGES does not.

import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const REPO = new URL('../', import.meta.url);
/**
 * The checkout whose page the tests load: this one, unless UG_PAGE_ROOT names another (an absolute
 * directory). The build used that once, to run the helper tests against the 12ddca5 tree and show
 * their expected values are what the hand-written script.js gave.
 */
const PAGE_ROOT = process.env.UG_PAGE_ROOT ? new URL(`file://${process.env.UG_PAGE_ROOT.replace(/\/?$/, '/')}`) : REPO;

type Listener = (e: unknown) => unknown;

/** A stand-in for one DOM element: the properties and methods script.js touches. */
export class FakeElement {
  readonly id: string;
  value = '';
  checked = false;
  disabled = false;
  textContent: string | null = '';
  readonly style: Record<string, string> = {};
  readonly listeners = new Map<string, Listener[]>();
  readonly classList = {
    set: new Set<string>(),
    toggle(name: string, on?: boolean): boolean {
      const want = on ?? !this.set.has(name);
      if (want) this.set.add(name); else this.set.delete(name);
      return want;
    },
    contains(name: string): boolean { return this.set.has(name); },
    add(name: string): void { this.set.add(name); },
    remove(name: string): void { this.set.delete(name); },
  };

  constructor(id: string) { this.id = id; }

  addEventListener(type: string, fn: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }
  /** Fires this element's listeners of that type, as the browser would. */
  fire(type: string): void { for (const fn of this.listeners.get(type) ?? []) fn({ type, target: this }); }
  /** What Element.closest answers for the keydown guard: the element has no button or link around it. */
  closest(): null { return null; }
}

/** The values index.html gives the form controls. */
const INITIAL: Record<string, Partial<Pick<FakeElement, 'value' | 'checked'>>> = {
  words: { value: '2' },
  type: { value: 'mixed' },
  lang: { value: 'random' },
  separator: { value: 'random' },
  digits: { checked: true },
  digitPosition: { value: 'after' },
  digitCount: { value: '1' },
};

/** The stub document, and what the page did with it. */
export class FakeDom {
  readonly elements = new Map<string, FakeElement>();
  readonly listeners = new Map<string, Listener[]>();
  /** The two controls that carry the .digit-option class in index.html, in page order. */
  readonly digitOptions: FakeElement[];

  constructor() {
    this.digitOptions = [this.getElementById('digitPosition'), this.getElementById('digitCount')];
  }

  getElementById(id: string): FakeElement {
    let el = this.elements.get(id);
    if (!el) {
      el = new FakeElement(id);
      Object.assign(el, INITIAL[id] ?? {});
      this.elements.set(id, el);
    }
    return el;
  }
  /** The one selector script.js asks the document for. */
  querySelectorAll(selector: string): FakeElement[] {
    if (selector !== '.digit-option') throw new Error(`the stub document does not answer ${selector}`);
    return this.digitOptions;
  }
  addEventListener(type: string, fn: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }
}

/** The page functions the tests call directly, typed as ts/script.ts declares them. */
export interface PageFunctions {
  sanitize(value: string): string;
  randomInt(max: number): number;
  getRandomWord(list: string[]): string;
  randomDigit(): number;
  resolveSeparators(gapCount: number, separator: string, pickSeparator: () => number): string[];
  joinParts(parts: string[], separators: string[]): string;
  assemble(parts: string[], separator: string, addDigits: boolean, digitPosition: string, digitCount: number, digit: () => number): string;
  assembleWith(parts: string[], separators: string[], addDigits: boolean, digitPosition: string, digitCount: number, digit: () => number): string;
  readDigitCount(): number;
  readWordCount(): number;
  readDigitPosition(): string;
  syncDigitControls(): void;
  resolveSlotLanguages(plan: string[], language: string, pickLanguage: () => number): string[];
  categoryPlan(wordCount: number, type: string): string[];
  sanitiseDistinct(words: string[]): string[];
  drawDistinct(sources: string[][], pick: (list: string[]) => string): string[];
  roundHalfUp(value: number): number;
  tenthsText(tenths: number): string;
  round1(value: number): string;
  humanFromLog10(log10v: number): string;
  describeStrength(model: unknown, plan: string[], language: string, wordType: string, sizes: number[], addDigits: boolean, digitCount: number, separator: string): { hmin: number; h2: number; bitsText: string; combinations: string; collisionAt: string };
  maxEntropyOptions(model: unknown): { language: string; type: string; words: number; addDigits: boolean; digitCount: number; separator: string; strength: { hmin: number; h2: number; bitsText: string; combinations: string; collisionAt: string } };
  isRealLanguage(value: string): boolean;
  fetchDict(lang: string, type: string): Promise<string[]>;
  fetchEntropyModel(): Promise<unknown>;
  updateStrength(): Promise<void>;
  generateUsername(): Promise<void>;
}

/** Each page function's declared parameter count (Function.length), checked by fn(). */
const PAGE_ARITY: { readonly [K in keyof PageFunctions]: number } = {
  sanitize: 1, randomInt: 1, getRandomWord: 1, randomDigit: 0, resolveSeparators: 3, joinParts: 2, assemble: 6,
  assembleWith: 6, readDigitCount: 0, readWordCount: 0, readDigitPosition: 0, syncDigitControls: 0,
  resolveSlotLanguages: 3, categoryPlan: 2, sanitiseDistinct: 1, drawDistinct: 2, roundHalfUp: 1, tenthsText: 1,
  round1: 1, humanFromLog10: 1, describeStrength: 8, maxEntropyOptions: 1, isRealLanguage: 1, fetchDict: 2,
  fetchEntropyModel: 0, updateStrength: 0, generateUsername: 0,
};

/** A loaded page: run code in its global scope, and reach its stub document. */
export interface LoadedPage {
  /** A page function by name, typed by PageFunctions; it throws if the page has no such function
      or its parameter count is not the one PageFunctions declares. */
  fn<K extends keyof PageFunctions>(name: K): PageFunctions[K];
  /** Runs code as a script in the page's global scope and returns its value (from the page's realm). */
  run<T = unknown>(code: string): T;
  /** Puts a value on the page's global object under name, for run() to use. */
  set(name: string, value: unknown): void;
  /** Fires every document and window listener of this type, as the browser would. */
  fire(type: string): void;
  /** Runs the callbacks the page gave setTimeout (and any they add) in order, and waits for the promises they leave. */
  flush(): Promise<void>;
  /** Replaces what crypto.getRandomValues fills in: fill gets the typed array. */
  randomFrom(fill: (array: Uint32Array<ArrayBuffer>) => void): void;
  /** Addresses (as the page asks for them, for example data/en_nouns.txt) that fetch answers with a 404. */
  missing: Set<string>;
  /**
   * Holds back the answer to every fetch whose address starts with this prefix, until the returned
   * function is called. For races: a slow request for an older setting, finishing after a newer one.
   */
  hold(prefix: string): () => void;
  /** Every address the page fetched, in order. */
  readonly fetched: string[];
  /** Every text the page copied. */
  readonly copied: string[];
  /** Every console.error the page wrote. */
  readonly errors: string[];
  readonly dom: FakeDom;
}

/** Loads the compiled script.js from root (the repository unless given) into a fresh context. With init the DOMContentLoaded handler has run, as in a browser. */
export async function loadPage({ root = PAGE_ROOT, init = false }: { root?: URL; init?: boolean } = {}): Promise<LoadedPage> {
  const dom = new FakeDom();
  const windowListeners = new Map<string, Listener[]>();
  const timers: Array<() => void> = [];
  const fetched: string[] = [];
  const copied: string[] = [];
  const errors: string[] = [];
  const missing = new Set<string>();
  const held: Array<{ prefix: string; gate: Promise<void> }> = [];
  let fill: (array: Uint32Array<ArrayBuffer>) => void = (array) => { globalThis.crypto.getRandomValues(array); };
  const sandbox: Record<string, unknown> = {
    document: dom,
    window: {
      addEventListener: (type: string, fn: Listener): void => { windowListeners.set(type, [...(windowListeners.get(type) ?? []), fn]); },
    },
    Element: FakeElement,
    navigator: { clipboard: { writeText: (text: string): Promise<void> => { copied.push(text); return Promise.resolve(); } } },
    console: { error: (...args: unknown[]): void => { errors.push(args.map(String).join(' ')); }, log: console.log },
    crypto: { getRandomValues: (array: Uint32Array<ArrayBuffer>): Uint32Array<ArrayBuffer> => { fill(array); return array; } },
    setTimeout: (fn: () => void): number => timers.push(fn),
    fetch: async (url: string): Promise<{ ok: boolean; text(): Promise<string> }> => {
      fetched.push(url);
      for (const h of held) if (url.startsWith(h.prefix)) await h.gate;
      let text: string | null = null;
      if (!missing.has(url)) {
        try { text = readFileSync(new URL(url, root), 'utf8'); } catch { text = null; }
      }
      return { ok: text !== null, text: () => Promise.resolve(text ?? '') };
    },
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL('script.js', root), 'utf8'), ctx, { filename: 'script.js' });
  const fire = (type: string): void => {
    for (const fn of dom.listeners.get(type) ?? []) fn({ type });
    for (const fn of windowListeners.get(type) ?? []) fn({ type });
  };
  const tick = (): Promise<void> => new Promise((r) => setImmediate(r));
  const page: LoadedPage = {
    fn: <K extends keyof PageFunctions>(name: K): PageFunctions[K] => {
      const f: unknown = vm.runInContext(`typeof ${name} === 'function' ? ${name} : undefined`, ctx);
      if (typeof f !== 'function') throw new Error(`the page has no function ${name}`);
      if (f.length !== PAGE_ARITY[name]) throw new Error(`${name} takes ${f.length} parameters in the page, ${PAGE_ARITY[name]} in PageFunctions`);
      return f as PageFunctions[K];
    },
    run: <T>(code: string): T => vm.runInContext(code, ctx) as T,
    set: (name, value) => { (ctx as Record<string, unknown>)[name] = value; },
    fire,
    flush: async () => {
      for (let round = 0; round < 50; round++) {
        await tick();
        if (timers.length === 0) { await tick(); if (timers.length === 0) return; }
        const due = timers.splice(0);
        for (const t of due) t();
      }
      throw new Error('the page keeps scheduling timers');
    },
    randomFrom: (f) => { fill = f; },
    hold: (prefix) => {
      let release = (): void => {};
      held.push({ prefix, gate: new Promise<void>((r) => { release = r; }) });
      return release;
    },
    missing,
    fetched,
    copied,
    errors,
    dom,
  };
  if (init) { fire('DOMContentLoaded'); await page.flush(); }
  return page;
}
