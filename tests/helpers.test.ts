// The page's own helpers, called in Node through tests/load.ts: the transliteration, the random
// integer, the plan and the joining of the words, the digit and word-count clamps, the rounding and
// the wording of the strength readout, and the first screen the page writes. Added on 24 October
// 2026 with the TypeScript move. Every expected value below was also produced by the 12ddca5
// script.js (the hand-written JavaScript the TypeScript replaced: UG_PAGE_ROOT pointed at that
// tree, see tests/load.ts), so these vectors pin the behaviour across the move.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPage } from './load.ts';
import { defined } from './helpers.ts';

const page = await loadPage();
const ch = (...codes: number[]): string => String.fromCharCode(...codes);

test('sanitize: the nine letters NFD cannot split, then accents removed', () => {
  const sanitize = page.fn('sanitize');
  const cases: Array<[string, string]> = [
    [ch(0xf8), 'o'], [ch(0x142), 'l'], [ch(0xdf), 'ss'], [ch(0xe6), 'ae'], [ch(0x153), 'oe'],
    [ch(0x111), 'd'], [ch(0xf0), 'd'], [ch(0xfe), 'th'], [ch(0x131), 'i'],
    [`dr${ch(0xf8)}mmer`, 'drommer'], [`sok${ch(0xf3)}${ch(0x142)}`, 'sokol'], [`m${ch(0xe5)}le`, 'male'],
    [`dragon`, 'dragon'], [`drag${ch(0xf3)}n`, 'dragon'], ['nascer-do-sol', 'nascer-do-sol'], ['', ''],
    [`${ch(0xe7)}${ch(0x103)}${ch(0x15b)}`, 'cas'],
  ];
  for (const [input, want] of cases) assert.equal(sanitize(input), want, JSON.stringify(input));
});

test('sanitize: every non-ASCII character in the word lists comes out as ASCII', () => {
  const sanitize = page.fn('sanitize');
  const chars = new Set<string>();
  const dir = new URL('../data/', import.meta.url);
  for (const lang of ['en', 'no', 'pt', 'es', 'de', 'fr', 'it', 'nl', 'pl', 'ro', 'la']) {
    for (const cat of ['nouns', 'adjectives', 'verbs']) {
      for (const c of readFileSync(new URL(`${lang}_${cat}.txt`, dir), 'utf8')) if (c.charCodeAt(0) > 127 && c !== '\n') chars.add(c);
    }
  }
  assert.equal(chars.size, 38, 'the lists hold 38 distinct non-ASCII characters');
  for (const c of chars) assert.match(sanitize(c), /^[\x00-\x7f]*$/, `U+${c.charCodeAt(0).toString(16)} sanitises to ASCII`);
});

test('randomInt: uniform draw by rejection sampling, bounds and rejection', () => {
  const randomInt = page.fn('randomInt');
  const draws: number[] = [];
  const feed = (...values: number[]): void => {
    draws.length = 0;
    const queue = [...values];
    page.randomFrom((array) => { const v = defined(queue.shift(), 'an unplanned draw'); draws.push(v); array[0] = v; });
  };
  // 0xFFFFFFFF is a multiple of 3, so it is at or above the limit and is redrawn.
  feed(0xFFFFFFFF, 7);
  assert.equal(randomInt(3), 1);
  assert.equal(draws.length, 2, 'one rejected draw');
  // 4294967290 is the limit for 10 (floor(0xFFFFFFFF / 10) * 10): rejected; the next value below it is accepted.
  feed(4294967290, 4294967289);
  assert.equal(randomInt(10), 9);
  assert.equal(draws.length, 2);
  feed(0xFFFFFFFF, 123456);
  assert.equal(randomInt(1), 0, 'a bound of 1 always gives 0');
  feed(0);
  assert.equal(randomInt(5), 0);
  feed(4);
  assert.equal(randomInt(5), 4);
  page.randomFrom((array) => { globalThis.crypto.getRandomValues(array); });
  for (let i = 0; i < 200; i++) { const v = randomInt(7); assert.ok(Number.isInteger(v) && v >= 0 && v < 7); }
});

test('categoryPlan: the mixed format, and a single type repeated', () => {
  const plan = page.fn('categoryPlan');
  const rows: Array<[number, string, string[]]> = [
    [1, 'mixed', ['noun']], [2, 'mixed', ['adjective', 'noun']], [3, 'mixed', ['verb', 'adjective', 'noun']],
    [5, 'mixed', ['verb', 'adjective', 'noun', 'noun', 'noun']], [3, 'verb', ['verb', 'verb', 'verb']], [1, 'adjective', ['adjective']],
  ];
  for (const [n, type, want] of rows) assert.deepEqual(JSON.parse(JSON.stringify(plan(n, type))), want, `${n} ${type}`);
});

test('joinParts, assemble and assembleWith: separators, digits before and after, no digits', () => {
  const join = page.fn('joinParts'), assemble = page.fn('assemble'), assembleWith = page.fn('assembleWith');
  let n = 0;
  const counter = (): number => (n++) % 10;
  assert.equal(join(['a', 'b', 'c'], ['-', '_']), 'a-b_c');
  assert.equal(join(['a'], []), 'a');
  assert.equal(assemble([`dr${ch(0xf8)}m`, 'sol'], '-', false, 'after', 3, counter), 'drom-sol', 'no digits: joined, then sanitised');
  n = 0;
  assert.equal(assemble(['aa', 'bb'], '.', true, 'after', 2, counter), 'aa01.bb23');
  n = 0;
  assert.equal(assemble(['aa', 'bb'], '', true, 'before', 1, counter), '0aa1bb');
  n = 0;
  assert.equal(assembleWith(['aa', 'bb', 'cc'], ['-', '_'], true, 'after', 1, counter), 'aa0-bb1_cc2');
  assert.equal(assemble(['solo'], '-', false, 'after', 1, counter), 'solo');
  n = 0;
  assert.equal(assemble([`${ch(0xe6)}t`], '-', true, 'after', 2, counter), 'aet01', 'digits go on after sanitising');
});

test('resolveSeparators: fixed, random (one draw) and mix (one draw per gap)', () => {
  const resolve = page.fn('resolveSeparators');
  let calls = 0;
  const pick = (): number => (calls++) % 4;
  const j = (v: string[]): string[] => JSON.parse(JSON.stringify(v));
  assert.deepEqual(j(resolve(3, '-', pick)), ['-', '-', '-']);
  assert.equal(calls, 0, 'a fixed separator draws nothing');
  calls = 1;
  assert.deepEqual(j(resolve(3, 'random', pick)), ['-', '-', '-']);
  assert.equal(calls, 2, 'random draws once');
  calls = 0;
  assert.deepEqual(j(resolve(4, 'mix', pick)), ['', '-', '_', '.']);
  assert.equal(calls, 4, 'mix draws once per gap');
  assert.deepEqual(j(resolve(0, 'mix', pick)), []);
});

test('resolveSlotLanguages and isRealLanguage', () => {
  const slots = page.fn('resolveSlotLanguages'), real = page.fn('isRealLanguage');
  const j = (v: string[]): string[] => JSON.parse(JSON.stringify(v));
  let calls = 0;
  const pick = (): number => { calls++; return 2; };
  assert.deepEqual(j(slots(['noun', 'verb'], 'random', pick)), ['pt', 'pt']);
  assert.equal(calls, 1, 'random draws one language for the whole name');
  assert.deepEqual(j(slots(['noun', 'verb'], 'de', pick)), ['de', 'de']);
  assert.equal(calls, 1);
  for (const l of ['en', 'no', 'pt', 'es', 'de', 'fr', 'it', 'nl', 'pl', 'ro', 'la']) assert.equal(real(l), true, l);
  for (const l of ['random', 'mix', 'xx', '', 'EN']) assert.equal(real(l), false, JSON.stringify(l));
});

test('sanitiseDistinct and drawDistinct: no two entries display alike, no word twice in a name', () => {
  const distinct = page.fn('sanitiseDistinct'), draw = page.fn('drawDistinct');
  assert.deepEqual(JSON.parse(JSON.stringify(distinct(['male', `m${ch(0xe5)}le`, 'dragon', `drag${ch(0xf3)}n`, 'titan']))), ['male', 'dragon', 'titan']);
  let calls = 0;
  // The first attempt gives x, x, y (a repeat), the second x, y, z.
  const words = ['x', 'x', 'y', 'x', 'y', 'z'];
  const got = draw([['a'], ['a'], ['b']], () => defined(words[calls++], 'a word'));
  assert.deepEqual(JSON.parse(JSON.stringify(got)), ['x', 'y', 'z']);
  assert.equal(calls, 6, 'redrawn as a whole, until distinct');
  // A list too small to ever give distinct words still returns, after 64 attempts, with a repeat.
  let tries = 0;
  const forced = draw([['a'], ['a']], () => { tries++; return 'a'; });
  assert.equal(JSON.parse(JSON.stringify(forced)).join(), 'a,a');
  assert.equal(tries, 64 * 2 + 2, 'the 64 attempts and one last draw');
});

test('roundHalfUp, tenthsText and round1: half up, within 1e-9 of a boundary counts as on it', () => {
  const half = page.fn('roundHalfUp'), tenths = page.fn('tenthsText'), round1 = page.fn('round1');
  assert.equal(half(0.4999999995), 1);
  assert.equal(half(0.49999), 0);
  assert.equal(half(2.5), 3);
  assert.equal(half(0), 0);
  assert.deepEqual([28, 0, 5, 100, 1234].map(tenths), ['2.8', '0.0', '0.5', '10.0', '123.4']);
  assert.deepEqual([0.05, 2.75, 36.74, 36.75, 148.5, 0].map(round1), ['0.1', '2.8', '36.7', '36.8', '148.5', '0.0']);
});

test('humanFromLog10: every scale, the carry, the 10^n form', () => {
  const human = page.fn('humanFromLog10');
  const rows: Array<[number, string]> = [
    [0, '1'], [1, '10'], [2, '100'], [2.99957, '999'], [3, '1.0 thousand'], [3.4, '2.5 thousand'], [3.5, '3.2 thousand'],
    [5.99999, '1.0 million'], [6, '1.0 million'], [8.5, '316 million'], [9, '1.0 billion'], [12, '1.0 trillion'],
    [20, '100 quintillion'], [21, '1.0 × 10^21'], [21.9, '7.9 × 10^21'], [23.9999, '1.0 × 10^24'], [40, '1.0 × 10^40'],
  ];
  for (const [v, want] of rows) assert.equal(human(v), want, String(v));
});

test('describeStrength: the uniform fallback, the exact model, digits and separators', async () => {
  const describe = page.fn('describeStrength');
  const a = describe(null, ['adjective', 'noun'], 'en', 'mixed', [300, 400], true, 1, '-');
  assert.deepEqual([a.bitsText, a.combinations, a.collisionAt], ['23.5', '12 million', '4.1 thousand']);
  const carry = describe(null, ['noun'], '-', 'noun', [999600], false, 1, '-');
  assert.deepEqual([carry.bitsText, carry.combinations], ['19.9', '1.0 million']);
  const model = await page.fn('fetchEntropyModel')();
  const dflt = describe(model, ['adjective', 'noun'], 'random', 'mixed', [], true, 1, 'random');
  assert.deepEqual([dflt.bitsText, dflt.combinations, dflt.collisionAt], ['25.8', '59 million', '22 thousand'], 'the default settings');
  const max = page.fn('maxEntropyOptions')(model);
  assert.deepEqual([max.language, max.type, max.words, max.digitCount, max.separator, max.strength.bitsText], ['mix', 'verb', 5, 5, 'mix', '148.5']);
  // One word has no gap to put a separator in; random costs log2(4) once, mix once per gap.
  const one = describe(model, ['noun'], 'en', 'noun', [300], false, 1, 'mix');
  const none = describe(model, ['noun'], 'en', 'noun', [300], false, 1, '-');
  assert.equal(one.hmin, none.hmin);
  const two = describe(model, ['verb', 'verb'], 'en', 'verb', [300, 300], false, 1, 'random');
  const twoFixed = describe(model, ['verb', 'verb'], 'en', 'verb', [300, 300], false, 1, '-');
  assert.ok(Math.abs(two.hmin - twoFixed.hmin - 2) < 1e-12);
});

test('readWordCount, readDigitCount and readDigitPosition clamp what the controls hold', () => {
  const words = page.dom.getElementById('words'), count = page.dom.getElementById('digitCount'), pos = page.dom.getElementById('digitPosition');
  const rw = page.fn('readWordCount'), rd = page.fn('readDigitCount'), rp = page.fn('readDigitPosition');
  const wc: Array<[string, number]> = [['2', 2], ['1', 1], ['5', 5], ['7', 5], ['99', 5], ['-3', 1], ['0', 2], ['', 2], ['abc', 2], ['3.9', 3]];
  for (const [v, want] of wc) { words.value = v; assert.equal(rw(), want, `words ${JSON.stringify(v)}`); }
  const dc: Array<[string, number]> = [['1', 1], ['5', 5], ['99', 5], ['0', 1], ['-2', 1], ['', 1], ['x', 1]];
  for (const [v, want] of dc) { count.value = v; assert.equal(rd(), want, `digits ${JSON.stringify(v)}`); }
  pos.value = 'before'; assert.equal(rp(), 'before');
  pos.value = 'after'; assert.equal(rp(), 'after');
  pos.value = 'anything'; assert.equal(rp(), 'after');
  words.value = '2'; count.value = '1'; pos.value = 'after';
});

test('the first screen: a username, the readout and the hint, from the default controls', async () => {
  const p = await loadPage({ init: true });
  const text = (id: string): string => defined(p.dom.getElementById(id).textContent, id);
  assert.match(text('output'), /^[a-z0-9._-]+$/);
  assert.match(text('output'), /[0-9]$/, 'one digit after the last word');
  assert.equal(text('strengthBits'), '25.8 bits of entropy');
  assert.equal(text('strengthDetail'), '1 in 59 million combinations · even odds of a repeat after 22 thousand names');
  assert.equal(text('maxHint'), 'Strongest available: mix languages, 5 verbs, 5 digits each, mixed separators (148.5 bits).');
  assert.equal(p.dom.getElementById('output').classList.contains('loading'), false);
  assert.equal(p.dom.getElementById('generateBtn').style.pointerEvents, 'auto');
  assert.deepEqual(p.errors, []);
  assert.ok(p.fetched.every((u) => /^data\/(entropy-model\.tsv|[a-z]{2}_(nouns|adjectives|verbs)\.txt)$/.test(u)), 'only same-origin data files are fetched');
});

test('generateUsername: the controls decide the shape of the name', async () => {
  const p = await loadPage({ init: true });
  const set = (id: string, v: string): void => { p.dom.getElementById(id).value = v; };
  set('lang', 'en'); set('type', 'noun'); set('words', '3'); set('separator', '-'); set('digitCount', '2'); set('digitPosition', 'before');
  await p.fn('generateUsername')(); await p.flush();
  assert.match(defined(p.dom.getElementById('output').textContent, 'output'), /^\d\d[a-z]+-\d\d[a-z]+-\d\d[a-z]+$/);
  p.dom.getElementById('digits').checked = false;
  p.dom.getElementById('digits').fire('change'); await p.flush();
  assert.equal(p.dom.getElementById('digitPosition').disabled, true, 'digit controls are disabled while digits are off');
  assert.equal(p.dom.getElementById('digitCount').disabled, true);
  assert.deepEqual(p.dom.digitOptions.map((e) => e.classList.contains('is-disabled')), [true, true]);
  await p.fn('generateUsername')(); await p.flush();
  assert.match(defined(p.dom.getElementById('output').textContent, 'output'), /^[a-z]+-[a-z]+-[a-z]+$/);
});

test('without the word lists the page falls back to the word "error"; without the model it keeps a uniform readout', async () => {
  const p = await loadPage();
  for (const l of ['en']) for (const c of ['nouns', 'adjectives', 'verbs']) p.missing.add(`data/${l}_${c}.txt`);
  p.missing.add('data/entropy-model.tsv');
  p.dom.getElementById('lang').value = 'en';
  p.dom.getElementById('separator').value = '-';
  p.fire('DOMContentLoaded'); await p.flush();
  assert.match(defined(p.dom.getElementById('output').textContent, 'output'), /^error\d-error\d$/);
  assert.match(defined(p.dom.getElementById('strengthBits').textContent, 'bits'), / bits of entropy$/);
  assert.equal(p.errors.length > 0, true, 'each failure is reported on the console');
});

test('Copy puts the shown username on the clipboard; Enter generates unless a button or link has focus', async () => {
  const p = await loadPage({ init: true });
  const shown = defined(p.dom.getElementById('output').textContent, 'output');
  p.dom.getElementById('copyBtn').fire('click'); await p.flush();
  assert.deepEqual(p.copied, [shown]);
  const keydown = p.dom.listeners.get('keydown');
  assert.equal(keydown?.length, 1);
  const before = p.fetched.length;
  defined(keydown, 'keydown')[0]?.({ key: 'a', target: p.dom.getElementById('words') });
  await p.flush();
  assert.equal(p.dom.getElementById('output').classList.contains('loading'), false);
  defined(keydown, 'keydown')[0]?.({ key: 'Enter', target: p.dom.getElementById('words') });
  assert.equal(p.dom.getElementById('output').textContent, 'Generating...', 'Enter outside a button generates');
  await p.flush();
  assert.ok(p.fetched.length >= before);
});
