#!/usr/bin/env node
/**
 * Generates the strength golden corpus from script.js.
 *
 * The functions are LIFTED out of script.js rather than restated here, so this
 * generator cannot drift from the implementation it is meant to pin: if the web
 * app's maths changes, the corpus changes with it and the Kotlin test fails,
 * which is exactly the alarm that is wanted.
 *
 * Note the single eval. `const` declared inside eval() does NOT leak to the
 * calling scope the way `var` does, so lifting the constants and the functions
 * separately leaves the functions unable to see the constants they close over.
 * They must be evaluated together.
 *
 * Usage: node tools/gen-strength-golden.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');

function lift(name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('script.js no longer defines ' + name);
    let depth = 0;
    for (let k = src.indexOf('{', i); k < src.length; k++) {
        if (src[k] === '{') depth++;
        else if (src[k] === '}' && --depth === 0) return src.slice(i, k + 1);
    }
    throw new Error('unterminated ' + name);
}

const WANTED = ['LOG2_10', 'LOG10_2', 'LOG10_BIRTHDAY', 'SCALE_NAMES', 'ROUND_EPS',
                'LANGUAGE_RANDOM', 'LANGUAGE_MIX', 'REAL_LANGUAGES',
                'MIN_WORD_COUNT', 'MAX_WORD_COUNT', 'WORD_TYPES', 'MAX_DIGIT_COUNT',
                'SEPARATOR_RANDOM', 'SEPARATOR_MIX', 'SEPARATOR_VALUES'];
const consts = WANTED.map(name => {
    const m = src.match(new RegExp('^const ' + name + '\\s*=[\\s\\S]*?;$', 'm'));
    if (!m) throw new Error('script.js no longer defines const ' + name);
    return m[0];
});

const api = new Function(`
${consts.join('\n')}
const TRANSLITERATE = ${src.match(/const TRANSLITERATE\s*=\s*(\{[^;]*?\});/s)[1]};
${lift('sanitize')}
${lift('sanitiseDistinct')}
${lift('categoryPlan')}
${lift('roundHalfUp')}
${lift('tenthsText')}
${lift('round1')}
${lift('humanFromLog10')}
${lift('describeStrength')}
${lift('maxEntropyOptions')}
${lift('isRealLanguage')}
return { categoryPlan, describeStrength, sanitiseDistinct, maxEntropyOptions, isRealLanguage,
         REAL_LANGUAGES, WORD_TYPES, MAX_WORD_COUNT, LANGUAGE_RANDOM, LANGUAGE_MIX,
         SEPARATOR_RANDOM, SEPARATOR_MIX };
`)();

// Real dictionary sizes, so the corpus tracks the audited word lists rather than
// a number typed in here that would rot the moment a language loses an entry.
const sizes = {};
for (const f of fs.readdirSync(path.join(ROOT, 'data'))) {
    if (!f.endsWith('.txt')) continue;
    const [lang, cat] = f.slice(0, -4).split('_');
    // Counted the way the app counts: entries that would DISPLAY identically are
    // one word, so "male" and "måle" contribute 1, not 2.
    const entries = fs.readFileSync(path.join(ROOT, 'data', f), 'utf8')
        .split('\n').map(l => l.trim()).filter(l => l.length > 0);
    (sizes[lang] ||= {})[cat] = api.sanitiseDistinct(entries).length;
}

// The precomputed exact entropy of the two random-language modes, parsed exactly
// as the browser parses it so the corpus reflects the shipped table.
const model = {};
for (const line of fs.readFileSync(path.join(ROOT, 'data/entropy-model.tsv'), 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const [language, type, words, hmin, h2] = line.split('\t');
    ((model[language] ||= {})[type] ||= {})[parseInt(words, 10)] =
        { hmin: parseFloat(hmin), h2: parseFloat(h2) };
}

const PLURAL = { noun: 'nouns', adjective: 'adjectives', verb: 'verbs' };
const LANGUAGES = [api.LANGUAGE_RANDOM, api.LANGUAGE_MIX, ...api.REAL_LANGUAGES];

const rows = [];
const seenScale = new Set();
// A language of "-" means: look nothing up, fall back to the dictionary sizes.
// That path only runs when data/entropy-model.tsv is missing, so without these
// rows it would ship completely untested.
// Each configuration is emitted twice: with a FIXED separator, which contributes
// nothing because it is a choice rather than a draw, and with a RANDOM one, which
// contributes log2(4) per gap. Emitting only one would leave half the arithmetic
// unpinned.
function emit(label, lang, type, plan, list, addDigits, digitCount, separator) {
    const s = api.describeStrength(
        lang === '-' ? null : model, plan, lang, type, list, addDigits, digitCount, separator);
    seenScale.add(s.combinations.includes('10^') ? 'sci'
        : /^\d+$/.test(s.combinations) ? 'plain' : s.combinations.split(' ')[1]);
    rows.push([label, lang, type, plan.length, list.join(' '), addDigits ? 1 : 0, digitCount,
               separator === api.SEPARATOR_MIX ? 'mix'
                   : separator === api.SEPARATOR_RANDOM ? 'random' : 'fixed',
               s.hmin.toFixed(9), s.h2.toFixed(9),
               s.bitsText, s.combinations, s.collisionAt].join('\t'));
}

for (const lang of LANGUAGES)
    for (const type of api.WORD_TYPES)
        for (let words = 1; words <= api.MAX_WORD_COUNT; words++) {
            const plan = api.categoryPlan(words, type);
            // Sizes matter only for a fixed language; the two random modes read the
            // model, and passing sizes there would hide a lookup failure behind a
            // plausible-looking uniform number.
            const list = api.isRealLanguage(lang) ? plan.map(c => sizes[lang][PLURAL[c]]) : [];
            for (const sep of ['-', api.SEPARATOR_RANDOM, api.SEPARATOR_MIX]) {
                emit(`${lang}/${type}/${words}`, lang, type, plan, list, false, 1, sep);
                for (let d = 1; d <= 5; d++)
                    emit(`${lang}/${type}/${words}`, lang, type, plan, list, true, d, sep);
            }
        }

// Synthetic sizes for the branches real dictionaries cannot reach: the carry where
// 999.6 thousand must render as "1.0 million", and the degenerate lists.
for (const [name, list] of [['carry', [999600]], ['empty', []], ['singleton', [1, 1]], ['zero', [0, 300]]])
    emit(`synthetic/${name}`, '-', 'noun', list.length ? Array(list.length).fill('noun') : ['noun'],
         list, false, 1, '-');

// A corpus that silently stops covering a branch is worse than no corpus, because
// it still passes. Fail here rather than ship one.
for (const need of ['plain', 'thousand', 'million', 'trillion', 'sci'])
    if (!seenScale.has(need)) throw new Error('corpus never exercises scale: ' + need);
const carry = api.describeStrength(null, ['noun'], '-', 'noun', [999600], false, 1, '-');
if (carry.combinations !== '1.0 million')
    throw new Error('the 999.6-thousand carry no longer normalises to 1.0 million');
// Under the two random modes the two measures MUST differ, or the model is not
// being consulted and every figure here is silently the uniform fallback.
// Random is the one genuinely non-uniform mode, so it is the one whose two
// measures must differ. If they match, the table was not consulted and every
// figure here is silently the uniform fallback.
const rnd = api.describeStrength(model, ['noun', 'noun'], api.LANGUAGE_RANDOM, 'noun', [], false, 1, '-');
if (Math.abs(rnd.hmin - rnd.h2) < 0.5)
    throw new Error('random mode shows equal min- and collision-entropy; the model was not read');
// Pooled mix must beat every fixed language, or pooling is not happening.
const mixBits = api.describeStrength(model, ['noun'], api.LANGUAGE_MIX, 'noun', [], false, 1, '-').hmin;
for (const lang of api.REAL_LANGUAGES) {
    const one = api.describeStrength(model, ['noun'], lang, 'noun', [sizes[lang].nouns], false, 1, '-').hmin;
    if (mixBits <= one) throw new Error(`pooled mix (${mixBits}) does not beat ${lang} (${one})`);
}

const best = api.maxEntropyOptions(model);
const out = path.join(ROOT, 'android/app/src/test/resources/strength-golden.tsv');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out,
    '# generated by tools/gen-strength-golden.js from script.js -- do not edit\n' +
    `# max-entropy options: ${best.language}/${best.type}/${best.words}/${best.digitCount}/${best.separator} = ${best.strength.bitsText} bits\n` +
    '# case\tlanguage\ttype\tslots\tsizes\taddDigits\tdigitCount\tseparator\thmin\th2\tbitsText\tcombinations\tcollisionAt\n' +
    rows.join('\n') + '\n');
console.log(`${rows.length} rows -> ${path.relative(ROOT, out)}`);
console.log(`scales covered: ${[...seenScale].sort().join(', ')}`);
console.log(`max entropy: ${best.language} + ${best.type} + ${best.words} words + ${best.digitCount} digits + ${best.separator} separators = ${best.strength.bitsText} bits`);
