#!/usr/bin/env node
/**
 * Generates the strength golden corpus from script.js.
 *
 * The functions are the page's own: the compiled script.js is loaded into a vm context
 * (tests/load.ts, the loader the tests use) and its describeStrength, categoryPlan, sanitiseDistinct,
 * maxEntropyOptions and isRealLanguage are called, and its constants are read, so this generator
 * cannot drift from the implementation it is meant to pin: if the web app's maths changes, the
 * corpus changes with it and the Kotlin test fails, which is exactly the alarm that is wanted. The
 * entropy model is parsed by the page's own fetchEntropyModel from data/entropy-model.tsv.
 *
 * Usage, from anywhere (Node 24 runs the TypeScript directly):
 *   node tools/gen-strength-golden.ts           write the TSV
 *   node tools/gen-strength-golden.ts --check   write nothing; exit 1 unless the committed TSV is
 *                                               byte for byte what this script writes
 * tests/golden.test.ts and tools/build-ts.sh --check run the --check mode.
 *
 * TYPESCRIPT (24 October 2026, part 2 of the TypeScript move). This was tools/gen-strength-golden.js,
 * which lifted the constants and functions out of the text of script.js with regular expressions and
 * evaluated them together with new Function (a const declared inside eval does not leak to the
 * caller, so the pieces had to be evaluated as one). Loading the page makes all of that unnecessary.
 * The data rows are byte for byte what the JavaScript wrote; the only change to the TSV is its
 * first line, which names this generator.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { loadPage } from '../tests/load.ts';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'android/app/src/test/resources/strength-golden.tsv');

const page = await loadPage({ root: new URL(`file://${ROOT}/`) });
const categoryPlan = page.fn('categoryPlan');
const describeStrength = page.fn('describeStrength');
const sanitiseDistinct = page.fn('sanitiseDistinct');
const maxEntropyOptions = page.fn('maxEntropyOptions');
const isRealLanguage = page.fn('isRealLanguage');

// The page's constants. They are top-level const of a classic script, so only run() reaches them.
const LANGUAGE_RANDOM = page.run<string>('LANGUAGE_RANDOM');
const LANGUAGE_MIX = page.run<string>('LANGUAGE_MIX');
const REAL_LANGUAGES = Array.from(page.run<string[]>('REAL_LANGUAGES'));
const WORD_TYPES = Array.from(page.run<string[]>('WORD_TYPES'));
const MAX_WORD_COUNT = page.run<number>('MAX_WORD_COUNT');
const SEPARATOR_RANDOM = page.run<string>('SEPARATOR_RANDOM');
const SEPARATOR_MIX = page.run<string>('SEPARATOR_MIX');

// Real dictionary sizes, so the corpus tracks the audited word lists rather than a number typed in
// here that would rot the moment a language loses an entry.
const sizes = new Map<string, Map<string, number>>();
for (const f of readdirSync(join(ROOT, 'data'))) {
  if (!f.endsWith('.txt')) continue;
  const [lang, cat] = f.slice(0, -4).split('_') as [string, string];
  // Counted the way the app counts: entries that would DISPLAY identically are one word, so
  // "male" and "måle" contribute 1, not 2.
  const entries = readFileSync(join(ROOT, 'data', f), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (!sizes.has(lang)) sizes.set(lang, new Map());
  sizes.get(lang)!.set(cat, sanitiseDistinct(entries).length);
}
const sizeOf = (lang: string, category: string): number => {
  const n = sizes.get(lang)?.get(category);
  if (n === undefined) throw new Error(`no dictionary for ${lang}/${category}`);
  return n;
};

// The precomputed exact entropy of the two random-language modes, parsed by the page itself, so the
// corpus reflects the shipped table read the way the browser reads it.
const model = await page.fn('fetchEntropyModel')();
if (!model) throw new Error('the page could not read data/entropy-model.tsv');

const PLURAL: Record<string, string> = { noun: 'nouns', adjective: 'adjectives', verb: 'verbs' };
const LANGUAGES = [LANGUAGE_RANDOM, LANGUAGE_MIX, ...REAL_LANGUAGES];

const rows: string[] = [];
const seenScale = new Set<string>();
// A language of "-" means: look nothing up, fall back to the dictionary sizes. That path only runs
// when data/entropy-model.tsv is missing, so without these rows it would ship completely untested.
// Each configuration is emitted twice: with a FIXED separator, which contributes nothing because it
// is a choice rather than a draw, and with a RANDOM one, which contributes log2(4) per gap. Emitting
// only one would leave half the arithmetic unpinned.
function emit(label: string, lang: string, type: string, plan: string[], list: number[],
              addDigits: boolean, digitCount: number, separator: string): void {
  const s = describeStrength(lang === '-' ? null : model, plan, lang, type, list, addDigits, digitCount, separator);
  seenScale.add(s.combinations.includes('10^') ? 'sci'
    : /^\d+$/.test(s.combinations) ? 'plain' : (s.combinations.split(' ')[1] ?? ''));
  rows.push([label, lang, type, plan.length, list.join(' '), addDigits ? 1 : 0, digitCount,
             separator === SEPARATOR_MIX ? 'mix'
               : separator === SEPARATOR_RANDOM ? 'random' : 'fixed',
             s.hmin.toFixed(9), s.h2.toFixed(9),
             s.bitsText, s.combinations, s.collisionAt].join('\t'));
}

for (const lang of LANGUAGES) {
  for (const type of WORD_TYPES) {
    for (let words = 1; words <= MAX_WORD_COUNT; words++) {
      const plan = Array.from(categoryPlan(words, type));
      // Sizes matter only for a fixed language; the two random modes read the model, and passing
      // sizes there would hide a lookup failure behind a plausible-looking uniform number.
      const list = isRealLanguage(lang) ? plan.map((c) => sizeOf(lang, PLURAL[c] ?? c)) : [];
      for (const sep of ['-', SEPARATOR_RANDOM, SEPARATOR_MIX]) {
        emit(`${lang}/${type}/${words}`, lang, type, plan, list, false, 1, sep);
        for (let d = 1; d <= 5; d++) {
          emit(`${lang}/${type}/${words}`, lang, type, plan, list, true, d, sep);
        }
      }
    }
  }
}

// Synthetic sizes for the branches real dictionaries cannot reach: the carry where 999.6 thousand
// must render as "1.0 million", and the degenerate lists.
const synthetic: Array<[string, number[]]> = [['carry', [999600]], ['empty', []], ['singleton', [1, 1]], ['zero', [0, 300]]];
for (const [name, list] of synthetic) {
  emit(`synthetic/${name}`, '-', 'noun', list.length ? Array<string>(list.length).fill('noun') : ['noun'],
       list, false, 1, '-');
}

// A corpus that silently stops covering a branch is worse than no corpus, because it still passes.
// Fail here rather than ship one.
for (const need of ['plain', 'thousand', 'million', 'trillion', 'sci']) {
  if (!seenScale.has(need)) throw new Error('corpus never exercises scale: ' + need);
}
const carry = describeStrength(null, ['noun'], '-', 'noun', [999600], false, 1, '-');
if (carry.combinations !== '1.0 million') {
  throw new Error('the 999.6-thousand carry no longer normalises to 1.0 million');
}
// Random is the one genuinely non-uniform mode, so it is the one whose two measures must differ. If
// they match, the table was not consulted and every figure here is silently the uniform fallback.
const rnd = describeStrength(model, ['noun', 'noun'], LANGUAGE_RANDOM, 'noun', [], false, 1, '-');
if (Math.abs(rnd.hmin - rnd.h2) < 0.5) {
  throw new Error('random mode shows equal min- and collision-entropy; the model was not read');
}
// Pooled mix must beat every fixed language, or pooling is not happening.
const mixBits = describeStrength(model, ['noun'], LANGUAGE_MIX, 'noun', [], false, 1, '-').hmin;
for (const lang of REAL_LANGUAGES) {
  const one = describeStrength(model, ['noun'], lang, 'noun', [sizeOf(lang, 'nouns')], false, 1, '-').hmin;
  if (mixBits <= one) throw new Error(`pooled mix (${mixBits}) does not beat ${lang} (${one})`);
}

const best = maxEntropyOptions(model);
const tsv =
  '# generated by tools/gen-strength-golden.ts from script.js; do not edit\n' +
  `# max-entropy options: ${best.language}/${best.type}/${best.words}/${best.digitCount}/${best.separator} = ${best.strength.bitsText} bits\n` +
  '# case\tlanguage\ttype\tslots\tsizes\taddDigits\tdigitCount\tseparator\thmin\th2\tbitsText\tcombinations\tcollisionAt\n' +
  rows.join('\n') + '\n';

if (process.argv.includes('--check')) {
  let committed = '';
  try { committed = readFileSync(OUT, 'utf8'); } catch { committed = ''; }
  if (committed !== tsv) {
    process.stderr.write(`${OUT} is NOT what tools/gen-strength-golden.ts writes: run it and review the diff\n`);
    process.exit(1);
  }
  process.stdout.write(`strength golden check OK: ${OUT} matches, ${rows.length} rows\n`);
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, tsv);
  console.log(`${rows.length} rows -> ${relative(ROOT, OUT)}`);
  console.log(`scales covered: ${[...seenScale].sort().join(', ')}`);
  console.log(`max entropy: ${best.language} + ${best.type} + ${best.words} words + ${best.digitCount} digits + ${best.separator} separators = ${best.strength.bitsText} bits`);
}
