"use strict";
/*! UsernameGenerator page script. Compiled from ts/script.ts by tools/build-ts.sh; edit the TypeScript, not this file. */
const outputBox = (document.getElementById('output'));
const generateBtn = (document.getElementById('generateBtn'));
const copyBtn = (document.getElementById('copyBtn'));
const wordsInput = (document.getElementById('words'));
const typeInput = (document.getElementById('type'));
const langInput = (document.getElementById('lang'));
const separatorInput = (document.getElementById('separator'));
const digitsInput = (document.getElementById('digits'));
const digitPositionInput = (document.getElementById('digitPosition'));
const digitCountInput = (document.getElementById('digitCount'));
const strengthBitsBox = document.getElementById('strengthBits');
const strengthDetailBox = (document.getElementById('strengthDetail'));
const maxHintBox = document.getElementById('maxHint');
const maxEntropyBtn = (document.getElementById('maxEntropyBtn'));
const digitOptionGroups = document.querySelectorAll('.digit-option');
const dictCache = {};
async function fetchDict(lang, type) {
    const key = `${lang}_${type}s`;
    if (dictCache[key])
        return dictCache[key];
    try {
        const response = await fetch(`data/${key}.txt`);
        if (!response.ok)
            throw new Error('Dict not found');
        const text = await response.text();
        const words = text.split('\n').map(w => w.trim()).filter(w => w.length > 0);
        dictCache[key] = sanitiseDistinct(words);
        return dictCache[key];
    }
    catch (e) {
        console.error(`Failed to load ${key}`, e);
        return ['error'];
    }
}
const TRANSLITERATE = {
    '\u00f8': 'o',
    '\u0142': 'l',
    '\u00df': 'ss',
    '\u00e6': 'ae',
    '\u0153': 'oe',
    '\u0111': 'd',
    '\u00f0': 'd',
    '\u00fe': 'th',
    '\u0131': 'i'
};
function sanitize(value) {
    const mapped = Array.from(value).map(c => TRANSLITERATE[c] !== undefined ? TRANSLITERATE[c] : c).join('');
    return mapped.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function randomInt(max) {
    const limit = Math.floor(0xFFFFFFFF / max) * max;
    const buf = new Uint32Array(1);
    let v;
    do {
        crypto.getRandomValues(buf);
        v = buf[0];
    } while (v >= limit);
    return v % max;
}
function getRandomWord(list) {
    return list[randomInt(list.length)];
}
function randomDigit() {
    return randomInt(10);
}
const DIGIT_POSITION_BEFORE = 'before';
const DIGIT_POSITION_AFTER = 'after';
const SEPARATOR_RANDOM = 'random';
const SEPARATOR_MIX = 'mix';
const SEPARATOR_VALUES = ['', '-', '_', '.'];
function resolveSeparators(gapCount, separator, pickSeparator) {
    if (separator === SEPARATOR_MIX) {
        return Array.from({ length: gapCount }, () => SEPARATOR_VALUES[pickSeparator()]);
    }
    if (separator === SEPARATOR_RANDOM) {
        const one = SEPARATOR_VALUES[pickSeparator()];
        return Array(gapCount).fill(one);
    }
    return Array(gapCount).fill(separator);
}
function randomSeparatorIndex() {
    return randomInt(SEPARATOR_VALUES.length);
}
const MIN_DIGIT_COUNT = 1;
const MAX_DIGIT_COUNT = 5;
function assemble(parts, separator, addDigits, digitPosition, digitCount, digit) {
    return assembleWith(parts, Array(Math.max(parts.length - 1, 0)).fill(separator), addDigits, digitPosition, digitCount, digit);
}
function joinParts(parts, separators) {
    let out = '';
    for (let i = 0; i < parts.length; i++) {
        if (i > 0)
            out += separators[i - 1];
        out += parts[i];
    }
    return out;
}
function assembleWith(parts, separators, addDigits, digitPosition, digitCount, digit) {
    if (!addDigits)
        return sanitize(joinParts(parts, separators));
    const decorated = parts.map(word => {
        const clean = sanitize(word);
        let run = '';
        for (let i = 0; i < digitCount; i++)
            run += digit();
        return digitPosition === DIGIT_POSITION_BEFORE ? run + clean : clean + run;
    });
    return joinParts(decorated, separators);
}
function readDigitCount() {
    const parsed = parseInt(digitCountInput ? digitCountInput.value : '', 10);
    if (Number.isNaN(parsed))
        return MIN_DIGIT_COUNT;
    return Math.min(MAX_DIGIT_COUNT, Math.max(MIN_DIGIT_COUNT, parsed));
}
function readWordCount() {
    const parsed = parseInt(wordsInput.value) || 2;
    return Math.min(MAX_WORD_COUNT, Math.max(MIN_WORD_COUNT, parsed));
}
function readDigitPosition() {
    return digitPositionInput && digitPositionInput.value === DIGIT_POSITION_BEFORE
        ? DIGIT_POSITION_BEFORE
        : DIGIT_POSITION_AFTER;
}
function syncDigitControls() {
    const enabled = digitsInput ? digitsInput.checked : true;
    if (digitPositionInput)
        digitPositionInput.disabled = !enabled;
    if (digitCountInput)
        digitCountInput.disabled = !enabled;
    digitOptionGroups.forEach(group => group.classList.toggle('is-disabled', !enabled));
}
const LANGUAGE_RANDOM = 'random';
const LANGUAGE_MIX = 'mix';
const REAL_LANGUAGES = ['en', 'no', 'pt', 'es', 'de', 'fr', 'it', 'nl', 'pl', 'ro', 'la'];
const MIN_WORD_COUNT = 1;
const MAX_WORD_COUNT = 5;
const WORD_TYPES = ['mixed', 'noun', 'adjective', 'verb'];
function resolveSlotLanguages(plan, language, pickLanguage) {
    if (language === LANGUAGE_RANDOM) {
        const one = REAL_LANGUAGES[pickLanguage()];
        return plan.map(() => one);
    }
    return plan.map(() => language);
}
function randomLanguageIndex() {
    return randomInt(REAL_LANGUAGES.length);
}
const LOG2_10 = 3.321928094887362;
const LOG10_2 = 0.3010299956639812;
const LOG10_BIRTHDAY = 0.0709277283545598;
const SCALE_NAMES = ['', 'thousand', 'million', 'billion', 'trillion',
    'quadrillion', 'quintillion'];
function categoryPlan(wordCount, type) {
    if (type !== 'mixed')
        return Array(wordCount).fill(type);
    if (wordCount <= 1)
        return ['noun'];
    if (wordCount === 2)
        return ['adjective', 'noun'];
    const plan = ['verb', 'adjective'];
    while (plan.length < wordCount)
        plan.push('noun');
    return plan;
}
const poolCache = {};
async function fetchPool(category) {
    if (poolCache[category])
        return poolCache[category];
    const lists = await Promise.all(REAL_LANGUAGES.map(lang => fetchDict(lang, category)));
    poolCache[category] = sanitiseDistinct(([]).concat(...lists));
    return poolCache[category];
}
function sanitiseDistinct(words) {
    const seen = new Map();
    for (const word of words) {
        const key = sanitize(word);
        if (!seen.has(key))
            seen.set(key, word);
    }
    return [...seen.values()];
}
async function resolveSources(plan, language, pickLanguage) {
    if (language === LANGUAGE_MIX) {
        return Promise.all(plan.map(category => fetchPool(category)));
    }
    const slotLanguages = resolveSlotLanguages(plan, language, pickLanguage);
    return Promise.all(plan.map((category, i) => fetchDict(slotLanguages[i], category)));
}
const MAX_DRAW_ATTEMPTS = 64;
function drawDistinct(sources, pick) {
    for (let attempt = 0; attempt < MAX_DRAW_ATTEMPTS; attempt++) {
        const words = sources.map(pick);
        if (new Set(words).size === words.length)
            return words;
    }
    return sources.map(pick);
}
let entropyModelCache = null;
async function fetchEntropyModel() {
    if (entropyModelCache)
        return entropyModelCache;
    try {
        const response = await fetch('data/entropy-model.tsv');
        if (!response.ok)
            throw new Error('entropy model not found');
        const model = {};
        for (const line of (await response.text()).split('\n')) {
            if (!line || line.startsWith('#'))
                continue;
            const [language, type, words, hmin, h2] = line.split('\t');
            if (!model[language])
                model[language] = {};
            if (!model[language][type])
                model[language][type] = {};
            model[language][type][parseInt(words, 10)] =
                { hmin: parseFloat(hmin), h2: parseFloat(h2) };
        }
        entropyModelCache = model;
        return model;
    }
    catch (e) {
        console.error('entropy model unavailable, falling back to uniform figures', e);
        return null;
    }
}
const ROUND_EPS = 1e-9;
function roundHalfUp(value) {
    return Math.floor(value + 0.5 + ROUND_EPS);
}
function tenthsText(tenths) {
    return Math.floor(tenths / 10) + '.' + (tenths % 10);
}
function round1(value) {
    return tenthsText(roundHalfUp(value * 10));
}
function humanFromLog10(log10v) {
    if (log10v < 3.5) {
        const n = roundHalfUp(Math.pow(10, log10v));
        if (n < 1000)
            return String(n);
    }
    let scaleIdx = Math.floor(log10v / 3);
    let value = Math.pow(10, log10v - 3 * scaleIdx);
    if (roundHalfUp(value) >= 1000) {
        value = value / 1000;
        scaleIdx += 1;
    }
    if (scaleIdx < SCALE_NAMES.length) {
        const tenths = roundHalfUp(value * 10);
        const text = tenths < 100 ? tenthsText(tenths) : String(roundHalfUp(value));
        const name = SCALE_NAMES[scaleIdx];
        return name ? text + ' ' + name : text;
    }
    let exp = Math.floor(log10v);
    let mantissa = Math.pow(10, log10v - exp);
    if (roundHalfUp(mantissa * 10) >= 100) {
        exp += 1;
        mantissa = mantissa / 10;
    }
    return round1(mantissa) + ' × 10^' + exp;
}
function describeStrength(model, plan, language, wordType, sizes, addDigits, digitCount, separator) {
    let hmin = 0;
    let h2 = 0;
    const row = model && model[language] && model[language][wordType]
        && model[language][wordType][plan.length];
    if (row) {
        hmin = row.hmin;
        h2 = row.h2;
    }
    else {
        for (const size of sizes)
            if (size > 1)
                hmin += Math.log2(size);
        h2 = hmin;
    }
    const digits = addDigits ? plan.length * digitCount * LOG2_10 : 0;
    hmin += digits;
    h2 += digits;
    const gapCount = Math.max(plan.length - 1, 0);
    const perDraw = Math.log2(SEPARATOR_VALUES.length);
    let separatorBits = 0;
    if (separator === SEPARATOR_MIX)
        separatorBits = gapCount * perDraw;
    else if (separator === SEPARATOR_RANDOM && gapCount > 0)
        separatorBits = perDraw;
    hmin += separatorBits;
    h2 += separatorBits;
    return {
        hmin: hmin,
        h2: h2,
        bitsText: round1(hmin),
        combinations: humanFromLog10(hmin * LOG10_2),
        collisionAt: humanFromLog10(LOG10_BIRTHDAY + h2 * 0.5 * LOG10_2),
    };
}
function maxEntropyOptions(model) {
    let best = null;
    for (const language of [LANGUAGE_MIX, LANGUAGE_RANDOM, ...REAL_LANGUAGES]) {
        for (const type of WORD_TYPES) {
            const plan = categoryPlan(MAX_WORD_COUNT, type);
            const strength = describeStrength(model, plan, language, type, [], true, MAX_DIGIT_COUNT, SEPARATOR_MIX);
            if (!best || strength.hmin > best.strength.hmin)
                best = { language, type, strength };
        }
    }
    const found = (best);
    return {
        language: found.language,
        type: found.type,
        words: MAX_WORD_COUNT,
        addDigits: true,
        digitCount: MAX_DIGIT_COUNT,
        separator: SEPARATOR_MIX,
        strength: found.strength,
    };
}
let strengthCalls = 0;
async function updateStrength() {
    if (!strengthBitsBox)
        return;
    const call = ++strengthCalls;
    const numWords = readWordCount();
    const wordType = typeInput.value;
    const language = langInput.value;
    const plan = categoryPlan(numWords, wordType);
    const model = await fetchEntropyModel();
    const sizes = isRealLanguage(language)
        ? (await Promise.all(plan.map(cat => fetchDict(language, cat)))).map(list => list.length)
        : [];
    const strength = describeStrength(model, plan, language, wordType, sizes, digitsInput ? digitsInput.checked : true, readDigitCount(), separatorInput ? separatorInput.value : '');
    if (call !== strengthCalls)
        return;
    strengthBitsBox.textContent = strength.bitsText + ' bits of entropy';
    strengthDetailBox.textContent =
        '1 in ' + strength.combinations + ' combinations · even odds of a repeat after '
            + strength.collisionAt + ' names';
    if (maxHintBox) {
        const max = maxEntropyOptions(model);
        const atMax = language === max.language && wordType === max.type
            && numWords === max.words
            && (digitsInput ? digitsInput.checked : true)
            && readDigitCount() === max.digitCount
            && (separatorInput ? separatorInput.value === max.separator : true);
        const langLabel = max.language === LANGUAGE_MIX ? 'mix languages'
            : max.language === LANGUAGE_RANDOM ? 'random language' : max.language;
        maxHintBox.textContent = atMax
            ? 'This is the strongest combination available.'
            : `Strongest available: ${langLabel}, ${max.words} ${max.type === 'mixed' ? 'mixed words' : max.type + 's'}, `
                + `${max.digitCount} digits each, mixed separators (${max.strength.bitsText} bits).`;
        maxHintBox.classList.toggle('is-max', atMax);
    }
}
function isRealLanguage(value) {
    return REAL_LANGUAGES.indexOf(value) >= 0;
}
async function generateUsername() {
    outputBox.classList.add('loading');
    outputBox.textContent = 'Generating...';
    generateBtn.style.pointerEvents = 'none';
    const numWords = readWordCount();
    const type = typeInput.value;
    const lang = langInput.value;
    const separator = separatorInput.value;
    const addDigits = digitsInput ? digitsInput.checked : true;
    const digitPosition = readDigitPosition();
    const digitCount = readDigitCount();
    const plan = categoryPlan(numWords, type);
    const sources = await resolveSources(plan, lang, randomLanguageIndex);
    const result = drawDistinct(sources, getRandomWord);
    const separators = resolveSeparators(Math.max(result.length - 1, 0), separator, randomSeparatorIndex);
    const finalUsername = assembleWith(result, separators, addDigits, digitPosition, digitCount, randomDigit);
    setTimeout(() => {
        outputBox.classList.remove('loading');
        outputBox.textContent = finalUsername;
        generateBtn.style.pointerEvents = 'auto';
        outputBox.style.transform = 'scale(1.02)';
        setTimeout(() => outputBox.style.transform = 'scale(1)', 150);
    }, 300);
}
copyBtn.addEventListener('click', () => {
    if (outputBox.classList.contains('loading'))
        return;
    const text = outputBox.textContent;
    navigator.clipboard.writeText(text).then(() => {
        const originalColor = copyBtn.style.color;
        copyBtn.style.color = '#10b981';
        setTimeout(() => {
            copyBtn.style.color = originalColor;
        }, 1500);
    });
});
generateBtn.addEventListener('click', generateUsername);
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter')
        return;
    if (e.target instanceof Element && e.target.closest('button, a'))
        return;
    generateUsername();
});
if (digitsInput)
    digitsInput.addEventListener('change', syncDigitControls);
if (maxEntropyBtn) {
    maxEntropyBtn.addEventListener('click', async () => {
        const max = maxEntropyOptions(await fetchEntropyModel());
        langInput.value = max.language;
        separatorInput.value = max.separator;
        typeInput.value = max.type;
        wordsInput.value = String(max.words);
        if (digitsInput)
            digitsInput.checked = max.addDigits;
        if (digitCountInput)
            digitCountInput.value = String(max.digitCount);
        syncDigitControls();
        await updateStrength();
        generateUsername();
    });
}
[wordsInput, typeInput, langInput, digitsInput, digitCountInput, separatorInput].forEach(el => {
    if (!el)
        return;
    el.addEventListener('change', updateStrength);
    el.addEventListener('input', updateStrength);
});
window.addEventListener('DOMContentLoaded', () => {
    syncDigitControls();
    updateStrength();
    generateUsername();
});
