#!/usr/bin/env node
/**
 * Generates the sanitise parity corpus.
 *
 * The web app is the reference implementation: it shipped first and its output is what existing
 * usernames were built from. The Kotlin port must agree with it exactly, and a comment saying so is
 * not evidence. This emits a corpus the Android test suite asserts row by row.
 *
 * The corpus is drawn from the REAL dictionaries rather than invented strings, so it covers exactly
 * the characters the app can actually encounter, and it grows automatically if a future dictionary
 * introduces a new one.
 *
 * Usage, from anywhere (Node 24 runs the TypeScript directly):
 *   node tools/gen-sanitise-golden.ts           write the CSV
 *   node tools/gen-sanitise-golden.ts --check   write nothing; exit 1 unless the committed CSV is
 *                                               byte for byte what this script writes
 * tests/golden.test.ts and tools/build-ts.sh --check run the --check mode.
 *
 * TYPESCRIPT (24 October 2026, part 2 of the TypeScript move). This was tools/gen-sanitise-golden.js,
 * which lifted the TRANSLITERATE map out of the text of script.js with a regular expression and
 * eval, and kept its own copy of sanitize. It now loads the compiled script.js into a vm context
 * (tests/load.ts, the loader the tests use) and calls the page's own sanitize and reads the page's
 * own TRANSLITERATE, so there is no second copy to drift. The rows are byte for byte what the
 * JavaScript wrote.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { loadPage } from '../tests/load.ts';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'android/app/src/test/resources/sanitise-golden.csv');

const page = await loadPage({ root: new URL(`file://${ROOT}/`) });
const sanitize = page.fn('sanitize');
// The keys of the page's map, in the page's own order (the corpus covers each one alone and in context).
const transliterated = Array.from(page.run<string[]>('Object.keys(TRANSLITERATE)'));

interface Exemplar { word: string; lang: string; file: string }

// Every distinct non-ASCII character present anywhere in the dictionaries, plus one real word
// containing each, so a failure names a word rather than a code point.
const files = readdirSync(join(ROOT, 'data')).filter((f) => f.endsWith('.txt')).sort();
const exemplar = new Map<string, Exemplar>();
for (const file of files) {
  const lang = file.split('_')[0] ?? '';
  for (const word of readFileSync(join(ROOT, 'data', file), 'utf8').split('\n')) {
    if (!word) continue;
    for (const ch of word) {
      if ((ch.codePointAt(0) ?? 0) > 127 && !exemplar.has(ch)) exemplar.set(ch, { word, lang, file });
    }
  }
}

interface Row { line: string; expected: string }
const rows: Row[] = [];
let n = 0;
const add = (desc: string, input: string): void => {
  if (desc.includes(',')) throw new Error(`description must not contain a comma: ${desc}`);
  const expected = sanitize(input);
  rows.push({ line: `S${String(++n).padStart(3, '0')},${desc},${input},${expected}`, expected });
};
const codePoint = (ch: string): string => 'U+' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0');

// The characters are single code units here, so sorting them by code unit is the order the
// JavaScript got from sorting the [character, info] pairs as strings.
for (const [ch, info] of [...exemplar.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
  add(`${codePoint(ch)} in ${info.lang} from ${info.file}`, info.word);
}
// Explicit coverage of the transliterate map, which NFD alone cannot handle.
for (const ch of transliterated) {
  add(`transliterate ${codePoint(ch)} alone`, ch);
  add(`transliterate ${codePoint(ch)} in context`, `x${ch}x`);
}
add('empty string', '');
add('plain ascii is unchanged', 'simplecase');
add('hyphenated dictionary entry survives', 'nascer-do-sol');

const csv = 'case_id,description,input,expected\n' + rows.map((r) => r.line).join('\n') + '\n';
const nonAscii = rows.filter((r) => /[^\x00-\x7F]/.test(r.expected));

if (process.argv.includes('--check')) {
  let committed = '';
  try { committed = readFileSync(OUT, 'utf8'); } catch { committed = ''; }
  if (committed !== csv) {
    process.stderr.write(`${OUT} is NOT what tools/gen-sanitise-golden.ts writes: run it and review the diff\n`);
    process.exit(1);
  }
  if (nonAscii.length) {
    process.stderr.write(`${nonAscii.length} rows whose output is still non-ASCII: these would break the "accepted everywhere" claim\n`);
    process.exit(1);
  }
  process.stdout.write(`sanitise golden check OK: ${OUT} matches, ${rows.length} rows\n`);
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, csv, 'utf8');
  console.log(`wrote ${OUT}`);
  console.log(`  ${rows.length} rows, ${exemplar.size} distinct non-ASCII characters found in the dictionaries`);
  console.log(`  rows whose OUTPUT is still non-ASCII: ${nonAscii.length}` +
              (nonAscii.length ? '  <-- these would break the "accepted everywhere" claim' : ''));
  if (nonAscii.length) for (const r of nonAscii.slice(0, 10)) console.log(`    ${r.line}`);
}
