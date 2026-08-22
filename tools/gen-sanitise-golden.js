#!/usr/bin/env node
/**
 * Generate the sanitise parity corpus.
 *
 * The web app is the reference implementation: it shipped first and its output is
 * what existing usernames were built from. The Kotlin port must agree with it
 * exactly, and a comment saying so is not evidence. This emits a corpus the
 * Android test suite asserts row by row.
 *
 * The corpus is drawn from the REAL dictionaries rather than invented strings, so
 * it covers exactly the characters the app can actually encounter, and it grows
 * automatically if a future dictionary introduces a new one.
 *
 *     node tools/gen-sanitise-golden.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
const OUT = path.join(ROOT, 'android/app/src/test/resources/sanitise-golden.csv');

// Lift the real map out of script.js rather than duplicating it here. A copy would
// drift, and drift is the whole failure mode this corpus exists to catch.
const src = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
const m = src.match(/const TRANSLITERATE\s*=\s*(\{[^;]*?\});/s);
if (!m) throw new Error('TRANSLITERATE map not found in script.js');
const TRANSLITERATE = eval('(' + m[1] + ')');

function sanitize(value) {
  const mapped = Array.from(value)
    .map(c => (TRANSLITERATE[c] !== undefined ? TRANSLITERATE[c] : c))
    .join('');
  return mapped.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Every distinct non-ASCII character present anywhere in the dictionaries, plus one
// real word containing each, so a failure names a word rather than a code point.
const files = fs.readdirSync(path.join(ROOT, 'data')).filter(f => f.endsWith('.txt')).sort();
const exemplar = new Map();
for (const f of files) {
  const lang = f.split('_')[0];
  for (const word of fs.readFileSync(path.join(ROOT, 'data', f), 'utf8').split('\n')) {
    if (!word) continue;
    for (const ch of word) {
      if (ch.charCodeAt(0) > 127 && !exemplar.has(ch)) exemplar.set(ch, { word, lang, file: f });
    }
  }
}

const rows = [];
let n = 0;
const add = (desc, input) => {
  if (desc.includes(',')) throw new Error(`description must not contain a comma: ${desc}`);
  rows.push(`S${String(++n).padStart(3, '0')},${desc},${input},${sanitize(input)}`);
};

for (const [ch, info] of [...exemplar.entries()].sort()) {
  const cp = 'U+' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0');
  add(`${cp} in ${info.lang} from ${info.file}`, info.word);
}
// Explicit coverage of the transliterate map, which NFD alone cannot handle.
for (const ch of Object.keys(TRANSLITERATE)) {
  const cp = 'U+' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0');
  add(`transliterate ${cp} alone`, ch);
  add(`transliterate ${cp} in context`, `x${ch}x`);
}
add('empty string', '');
add('plain ascii is unchanged', 'simplecase');
add('hyphenated dictionary entry survives', 'nascer-do-sol');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, 'case_id,description,input,expected\n' + rows.join('\n') + '\n', 'utf8');

const nonAscii = rows.filter(r => /[^\x00-\x7F]/.test(r.split(',')[3]));
console.log(`wrote ${OUT}`);
console.log(`  ${rows.length} rows, ${exemplar.size} distinct non-ASCII characters found in the dictionaries`);
console.log(`  rows whose OUTPUT is still non-ASCII: ${nonAscii.length}` +
            (nonAscii.length ? '  <-- these would break the "accepted everywhere" claim' : ''));
if (nonAscii.length) for (const r of nonAscii.slice(0, 10)) console.log(`    ${r}`);
