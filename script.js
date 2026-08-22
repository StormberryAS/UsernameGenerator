const outputBox = document.getElementById('output');
const generateBtn = document.getElementById('generateBtn');
const copyBtn = document.getElementById('copyBtn');

// Controls
const wordsInput = document.getElementById('words');
const typeInput = document.getElementById('type');
const langInput = document.getElementById('lang');
const separatorInput = document.getElementById('separator');
const digitsInput = document.getElementById('digits');
const digitPositionInput = document.getElementById('digitPosition');
const digitCountInput = document.getElementById('digitCount');
const strengthBitsBox = document.getElementById('strengthBits');
const strengthDetailBox = document.getElementById('strengthDetail');
const maxHintBox = document.getElementById('maxHint');
const maxEntropyBtn = document.getElementById('maxEntropyBtn');

// The controls that only mean anything while digits are switched on. Collected by
// class rather than listed by id, so the sync helper below does not need editing
// every time a control joins or leaves that group.
const digitOptionGroups = document.querySelectorAll('.digit-option');

// Cache for dictionaries
const dictCache = {};

async function fetchDict(lang, type) {
    const key = `${lang}_${type}s`;
    if (dictCache[key]) return dictCache[key];

    try {
        const response = await fetch(`data/${key}.txt`);
        if (!response.ok) throw new Error('Dict not found');
        const text = await response.text();
        const words = text.split('\n').map(w => w.trim()).filter(w => w.length > 0);
        dictCache[key] = sanitiseDistinct(words);
        return dictCache[key];
    } catch (e) {
        console.error(`Failed to load ${key}`, e);
        return ['error'];
    }
}

// NFD decomposition plus combining-mark removal handles a-ring, c-cedilla, a-breve,
// s-acute and the rest. It does NOT touch letters that have no decomposition at all:
// they are single codepoints, not base plus accent. Without this map "drommer" keeps
// its o-slash and "sokol" keeps its l-stroke, which defeats the whole point of
// producing platform-agnostic usernames. Keep this table in sync with the identical
// ones in username.py and android/.../UsernameEngine.kt.
const TRANSLITERATE = {
    '\u00f8': 'o',   // o with stroke, Norwegian/Danish
    '\u0142': 'l',   // l with stroke, Polish
    '\u00df': 'ss',  // sharp s, German
    '\u00e6': 'ae',  // ae ligature, Norwegian/Danish
    '\u0153': 'oe',  // oe ligature, French
    '\u0111': 'd',   // d with stroke
    '\u00f0': 'd',   // eth
    '\u00fe': 'th',  // thorn
    '\u0131': 'i'    // dotless i
};

function sanitize(value) {
    const mapped = Array.from(value).map(c => TRANSLITERATE[c] !== undefined ? TRANSLITERATE[c] : c).join('');
    return mapped.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Uniform random integer in [0, max) from the platform CSPRNG.
 *
 * The built-in Math.random is not cryptographically secure: its internal state is
 * recoverable from a modest number of outputs, so usernames generated in one session
 * are correlated. People generate usernames to keep identities apart, and that only
 * holds if the next one is not predictable from the last.
 *
 * Rejection sampling rather than a modulo, because a plain remainder biases towards
 * the low values whenever max does not divide 2^32 evenly. Small at these list
 * sizes, and free to avoid.
 */
function randomInt(max) {
    const limit = Math.floor(0xFFFFFFFF / max) * max;
    const buf = new Uint32Array(1);
    let v;
    do { crypto.getRandomValues(buf); v = buf[0]; } while (v >= limit);
    return v % max;
}

function getRandomWord(list) {
    return list[randomInt(list.length)];
}

/**
 * One random digit 0 to 9.
 *
 * Returned as a number rather than a string so the shape matches the `digit: () -> Int`
 * seam in UsernameEngine.kt; the caller concatenates it and JavaScript coerces on the
 * way. Kept in step with UsernameEngine.kt and username.py. All three must agree.
 *
 * This is the cheapest entropy the generator has. Every digit is worth 3.32 bits, so
 * at 300-word dictionaries one digit per word takes a three-word name from 24.7 bits
 * to 34.7, more than tripling the dictionaries would buy. Five digits per word, the
 * maximum offered, adds 16.6 bits per word on top of the word itself.
 *
 * Digits also make the "none" separator readable again, because the runs mark where
 * one word ends and the next begins.
 */
function randomDigit() {
    return randomInt(10);
}

/**
 * Where the digit run sits relative to its word. These strings are also the <option>
 * values in index.html, so the two must stay in step.
 *
 * AFTER is the default because a good number of sites still reject usernames that
 * start with a digit, so a leading run is the deliberate choice rather than the one
 * a user falls into without asking for it.
 */
const DIGIT_POSITION_BEFORE = 'before';
const DIGIT_POSITION_AFTER = 'after';

/**
 * The four separators, plus the two ways of drawing one.
 *
 * These mirror the language options exactly, and deliberately so: "random" draws
 * ONCE and uses that everywhere, so the name looks consistent; "mix" draws per gap,
 * so a name can hyphenate here and run together there. Same distinction, same two
 * words, in both controls.
 *
 * Entropy follows from that. Random is worth log2(4) for the whole name however
 * long it is; mix is worth log2(4) per gap, so 8 bits on a five-word name. Neither
 * is worth anything on a one-word name, which has no gaps to put a separator in.
 *
 * "none" stays in the pool. It lets two different word splits produce the same
 * string, which is a real loss, but a measured one: 0.0002 bits on a two-word name
 * across the pooled vocabulary, against the 0.42 bits per gap that dropping it
 * would cost.
 */
const SEPARATOR_RANDOM = 'random';
const SEPARATOR_MIX = 'mix';
const SEPARATOR_VALUES = ['', '-', '_', '.'];

function resolveSeparators(gapCount, separator, pickSeparator) {
    if (separator === SEPARATOR_MIX) {
        return Array.from({ length: gapCount }, () => SEPARATOR_VALUES[pickSeparator()]);
    }
    if (separator === SEPARATOR_RANDOM) {
        // One draw, used in every gap, which is what makes it look deliberate.
        const one = SEPARATOR_VALUES[pickSeparator()];
        return Array(gapCount).fill(one);
    }
    return Array(gapCount).fill(separator);
}

/** A uniform separator index from the CSPRNG. */
function randomSeparatorIndex() {
    return randomInt(SEPARATOR_VALUES.length);
}

const MIN_DIGIT_COUNT = 1;
const MAX_DIGIT_COUNT = 5;

/**
 * Joins the chosen words into the final username.
 *
 * Mirrors UsernameEngine.assemble in the Android app and generate_username in
 * username.py: the same words and the same digit draws must give the same string in
 * all three. Deliberately free of DOM reads and of the CSPRNG, so it can be lifted
 * out and exercised on its own with a stubbed [digit] source. That is the only way
 * to pin the worked examples, because the production source is a CSPRNG and has,
 * correctly, nothing to hold on to. **Never pass a seeded or predictable source in
 * production.**
 *
 * Every word gets its OWN run of [digitCount] independently drawn digits. Not one run
 * shared across the username, and not one run repeated per word, either of which would
 * hand an observer most of the digits for free once they had seen one word.
 */
function assemble(parts, separator, addDigits, digitPosition, digitCount, digit) {
    // Kept so every existing caller and the whole digit contract stay untouched:
    // one separator repeated in every gap is the same thing as the old behaviour.
    return assembleWith(parts, Array(Math.max(parts.length - 1, 0)).fill(separator),
                        addDigits, digitPosition, digitCount, digit);
}

/** Joins parts with a possibly different separator in each gap. */
function joinParts(parts, separators) {
    let out = '';
    for (let i = 0; i < parts.length; i++) {
        if (i > 0) out += separators[i - 1];
        out += parts[i];
    }
    return out;
}

function assembleWith(parts, separators, addDigits, digitPosition, digitCount, digit) {
    // The no-digits branch joins first and sanitises once. Sanitising per word would
    // be equivalent for every dictionary entry we ship, but "equivalent as far as I
    // can tell" is not a good enough reason to change the code path that produced
    // every username already in the wild.
    if (!addDigits) return sanitize(joinParts(parts, separators));

    // Digits go on AFTER sanitising, so normalisation can never mangle one.
    const decorated = parts.map(word => {
        const clean = sanitize(word);
        let run = '';
        for (let i = 0; i < digitCount; i++) run += digit();
        return digitPosition === DIGIT_POSITION_BEFORE ? run + clean : clean + run;
    });
    return joinParts(decorated, separators);
}

/**
 * The count input carries min="1" max="5", but those are advisory: a user can type 99,
 * or empty the field, and the element still hands us whatever is in it. Clamping here
 * keeps the 1 to 5 contract true whatever arrives, rather than trusting the browser.
 */
function readDigitCount() {
    const parsed = parseInt(digitCountInput ? digitCountInput.value : '', 10);
    if (Number.isNaN(parsed)) return MIN_DIGIT_COUNT;
    return Math.min(MAX_DIGIT_COUNT, Math.max(MIN_DIGIT_COUNT, parsed));
}

/** Anything that is not an explicit "before" means after, a missing control included. */
function readDigitPosition() {
    return digitPositionInput && digitPositionInput.value === DIGIT_POSITION_BEFORE
        ? DIGIT_POSITION_BEFORE
        : DIGIT_POSITION_AFTER;
}

/**
 * Position and count say nothing while digits are off, so they are disabled and dimmed
 * rather than removed. Removing them would collapse a cell of the two-column grid and
 * slide every later control under the pointer, which is a worse way of saying "not
 * applicable" than greying out in place.
 */
function syncDigitControls() {
    const enabled = digitsInput ? digitsInput.checked : true;
    if (digitPositionInput) digitPositionInput.disabled = !enabled;
    if (digitCountInput) digitCountInput.disabled = !enabled;
    digitOptionGroups.forEach(group => group.classList.toggle('is-disabled', !enabled));
}

/* ===========================================================================
 * Language modes
 *
 * Two pseudo-languages sit above the eleven real ones. They are not languages;
 * they are instructions about how to CHOOSE one, which is why they live in the
 * same control: from a user's point of view the question "which language?" has
 * thirteen answers, and splitting it into two controls would be a worse model of
 * the same choice.
 *
 *   random  one language is drawn for the WHOLE username, so every word matches.
 *   mix     each word is drawn from the eleven vocabularies POOLED, so words can
 *           disagree with each other. Not "a language per word": see fetchPool.
 *
 * "mix" is the only mode that can produce a username whose words come from
 * different languages, and it is the reason the warning next to the control
 * exists. See DISCLAIMER.md.
 * ======================================================================== */

const LANGUAGE_RANDOM = 'random';
const LANGUAGE_MIX = 'mix';

/**
 * The eleven real languages, in the order tools/gen-entropy-model.py used.
 *
 * The order is load-bearing for tests only: a stubbed language picker returns an
 * index, so this list decides which language that index means. The uniform draw
 * itself does not care about order.
 */
const REAL_LANGUAGES = ['en', 'no', 'pt', 'es', 'de', 'fr', 'it', 'nl', 'pl', 'ro', 'la'];

const MIN_WORD_COUNT = 1;
const MAX_WORD_COUNT = 5;
const WORD_TYPES = ['mixed', 'noun', 'adjective', 'verb'];

/**
 * Which language each word slot draws from, for the modes that have one.
 *
 * [LANGUAGE_MIX] is absent on purpose: pooling means it does not pick a language
 * at all, it picks a word from the combined vocabulary. See [resolveSources].
 *
 * [pickLanguage] returns an index into REAL_LANGUAGES and is injected so a test
 * can pass a counter where production passes the CSPRNG. Called ONCE for
 * [LANGUAGE_RANDOM] and not at all for a fixed language. **Never pass a
 * predictable source in production.**
 */
function resolveSlotLanguages(plan, language, pickLanguage) {
    if (language === LANGUAGE_RANDOM) {
        const one = REAL_LANGUAGES[pickLanguage()];
        return plan.map(() => one);
    }
    return plan.map(() => language);
}

/** A uniform language index from the CSPRNG, matching randomDigit's contract. */
function randomLanguageIndex() {
    return randomInt(REAL_LANGUAGES.length);
}

/* ===========================================================================
 * Strength readout
 *
 * Two figures, because they answer two different questions that people reliably
 * conflate, and one number cannot honestly serve both once a language is drawn
 * at random:
 *
 *   combinations  how many names the options can produce, so "1 in N" is the
 *                 chance one blind guess lands on yours. Uses MIN-ENTROPY, the
 *                 worst case, because a security figure must never be optimistic.
 *   collisionAt   how many names must exist before two match, at even odds. This
 *                 is the birthday bound, and the birthday bound is governed by
 *                 COLLISION ENTROPY (Renyi-2), not by min-entropy. Using one
 *                 number for both would be wrong for exactly the modes this
 *                 feature adds.
 *
 * With a single fixed language the distribution is uniform and the two measures
 * are identical, so nothing about the existing behaviour changes.
 *
 * The moment a language is drawn at random they diverge sharply, because the
 * languages are NOT disjoint: "ninja" is in 9 of the 11 noun lists and is
 * therefore about nine times likelier than a word unique to one language.
 * Assuming disjointness would overstate worst-case entropy by up to 3.06 bits
 * per word. The exact figures need the whole word set, so they are precomputed
 * by tools/gen-entropy-model.py and shipped in data/entropy-model.tsv.
 *
 * What is still deliberately NOT counted, for a FIXED language: the language
 * itself. An attacker not knowing which of the eleven you chose must search all
 * of them, worth +3.33 bits once, but the CSPRNG did not choose it, you did, and
 * predictably. Under "random" and "mix" the CSPRNG DOES choose it, so there it
 * is counted, and the model measures what that is genuinely worth rather than
 * assuming log2(11).
 * ======================================================================== */

/** Bits per decimal digit, and its reciprocal. */
const LOG2_10 = 3.321928094887362;
const LOG10_2 = 0.3010299956639812;

/**
 * log10(sqrt(2 * ln 2)). The birthday bound says a repeat becomes likelier than
 * not after about sqrt(2 * ln 2 * N) draws; working in log10 throughout keeps
 * every figure representable, which matters because five words with five digits
 * each is 2^133 and overflows a double long before it overflows this.
 */
const LOG10_BIRTHDAY = 0.0709277283545598;

/** Short scale, British usage. Beyond this the readout switches to 10^n. */
const SCALE_NAMES = ['', 'thousand', 'million', 'billion', 'trillion',
                     'quadrillion', 'quintillion'];

/**
 * Which category each word slot is drawn from.
 *
 * The single source of truth for BOTH the generator and the strength readout.
 * They previously stated the mixed-format rule separately, which meant a change
 * to one would leave the other quoting bits for a shape the app no longer
 * produced, silently and with no test able to see it. Mirrored by UsernameEngine
 * .categoryPlan and username.py's category_plan.
 */
function categoryPlan(wordCount, type) {
    if (type !== 'mixed') return Array(wordCount).fill(type);
    if (wordCount <= 1) return ['noun'];
    if (wordCount === 2) return ['adjective', 'noun'];
    const plan = ['verb', 'adjective'];
    while (plan.length < wordCount) plan.push('noun');
    return plan;
}

const poolCache = {};

/**
 * The combined vocabulary for one category, across all eleven languages.
 *
 * Built by walking the languages in the shared order and keeping first
 * occurrences rather than by sorting, so every implementation builds the same
 * list without depending on how a language happens to collate strings.
 *
 * This is what makes "mix" honest. Drawing a language and then a word made
 * "ninja" about nine times likelier than a word unique to one language, because
 * it sits in 9 of the 11 noun lists, and that cost up to 3.06 bits per word.
 * Drawing from the pool makes every word equally likely and deletes nothing.
 */
async function fetchPool(category) {
    if (poolCache[category]) return poolCache[category];
    const lists = await Promise.all(REAL_LANGUAGES.map(lang => fetchDict(lang, category)));
    poolCache[category] = sanitiseDistinct([].concat(...lists));
    return poolCache[category];
}

/**
 * Drops entries that would DISPLAY identically to an earlier one.
 *
 * "male" and "måle" are both in no_verbs and both render as "male"; across the
 * pooled vocabulary 116 pairs collide this way (dragon/dragón, titan/titán,
 * angel/ángel). Two consequences, both bad: the no-repeat rule compared RAW words,
 * so "dragon-dragon" was reachable and the guarantee was false; and a displayed
 * word backed by two entries was twice as likely as one backed by one, so every
 * min-entropy figure was slightly optimistic.
 *
 * Removing the duplicate at the source fixes both and keeps raw and displayed forms
 * one-to-one, which is what makes the entropy model exact rather than an upper
 * bound. First occurrence wins, so the result is deterministic.
 */
function sanitiseDistinct(words) {
    const seen = new Map();
    for (const word of words) {
        const key = sanitize(word);
        if (!seen.has(key)) seen.set(key, word);
    }
    return [...seen.values()];
}

/** Where each slot's words come from. Pooled under mix, a dictionary otherwise. */
async function resolveSources(plan, language, pickLanguage) {
    if (language === LANGUAGE_MIX) {
        return Promise.all(plan.map(category => fetchPool(category)));
    }
    const slotLanguages = resolveSlotLanguages(plan, language, pickLanguage);
    return Promise.all(plan.map((category, i) => fetchDict(slotLanguages[i], category)));
}

/**
 * Rejection sampling on the WHOLE tuple, so no word appears twice in one name.
 *
 * Redrawing only the clashing slot would be cheaper and WRONG: it would bias the
 * result towards words that happen to sit in fewer of the other slots' lists, and
 * every figure in the readout assumes a uniform draw over distinct-word names.
 * Redrawing the lot keeps it exactly uniform, which is the distribution
 * tools/gen-entropy-model.py counts.
 *
 * A five-word name is accepted about 97% of the time, so this almost never loops.
 * The bound exists only so a pathologically small word list cannot hang the app;
 * returning a name with a repeat beats never returning one at all.
 */
const MAX_DRAW_ATTEMPTS = 64;

function drawDistinct(sources, pick) {
    for (let attempt = 0; attempt < MAX_DRAW_ATTEMPTS; attempt++) {
        const words = sources.map(pick);
        if (new Set(words).size === words.length) return words;
    }
    return sources.map(pick);
}

let entropyModelCache = null;

/**
 * Loads the precomputed exact entropy of the two random-language modes.
 *
 * Returns null if it cannot be read, and every caller treats null as "fall back
 * to the uniform calculation": a missing model should cost the two new modes
 * their accurate figure, never break the whole readout.
 */
async function fetchEntropyModel() {
    if (entropyModelCache) return entropyModelCache;
    try {
        const response = await fetch('data/entropy-model.tsv');
        if (!response.ok) throw new Error('entropy model not found');
        const model = {};
        for (const line of (await response.text()).split('\n')) {
            if (!line || line.startsWith('#')) continue;
            const [language, type, words, hmin, h2] = line.split('\t');
            if (!model[language]) model[language] = {};
            if (!model[language][type]) model[language][type] = {};
            model[language][type][parseInt(words, 10)] =
                { hmin: parseFloat(hmin), h2: parseFloat(h2) };
        }
        entropyModelCache = model;
        return model;
    } catch (e) {
        console.error('entropy model unavailable, falling back to uniform figures', e);
        return null;
    }
}

/**
 * Half-up rounding with a boundary tolerance.
 *
 * Every figure here arrives through log and pow, which carry roughly 1e-15 of
 * relative error, and exact halfway cases are COMMON rather than exotic: any
 * dictionary size times a power of ten produces one, and 275 words with one
 * digit lands on exactly 2.75 thousand. Without the tolerance, V8 and the JVM
 * round that in opposite directions and the two apps disagree in public.
 *
 * A value within 1e-9 of a boundary is therefore treated as being on it, and
 * resolved upwards, in all three implementations.
 */
const ROUND_EPS = 1e-9;

function roundHalfUp(value) {
    return Math.floor(value + 0.5 + ROUND_EPS);
}

/** Renders tenths as a decimal, so 28 becomes "2.8", without touching toFixed. */
function tenthsText(tenths) {
    return Math.floor(tenths / 10) + '.' + (tenths % 10);
}

/**
 * One decimal place, assembled by hand rather than handed to toFixed.
 *
 * toFixed, Java's %.1f and Python's format spec disagree on halfway cases, and
 * %.1f additionally emits a comma under a Norwegian locale. Integer arithmetic
 * is the only formulation identical in all three, and is the same reason SunApp's
 * solar code uses floor(x + 0.5) rather than round().
 */
function round1(value) {
    return tenthsText(roundHalfUp(value * 10));
}

/**
 * Renders a magnitude supplied as log10, so nothing ever has to fit in a double.
 *
 * Every branch here decides on a value that has ALREADY been rounded, never on a
 * raw threshold. Deciding on a raw threshold is what makes two implementations
 * disagree: at a count of exactly one million, one lands on 999.9999 thousand and
 * the other on 1.0 million, and they then print different words for the same
 * number. Rounding first and normalising afterwards makes the boundary a
 * consequence rather than a race.
 */
function humanFromLog10(log10v) {
    if (log10v < 3.5) {
        const n = roundHalfUp(Math.pow(10, log10v));
        if (n < 1000) return String(n);
    }

    let scaleIdx = Math.floor(log10v / 3);
    let value = Math.pow(10, log10v - 3 * scaleIdx);
    // 999.96 is a thousand of the next scale up, not "1000 thousand".
    if (roundHalfUp(value) >= 1000) { value = value / 1000; scaleIdx += 1; }

    if (scaleIdx < SCALE_NAMES.length) {
        const tenths = roundHalfUp(value * 10);
        // Below ten a decimal is informative; at or above it, it is noise. The
        // test is on the rounded tenths, so nothing can straddle the cutoff.
        const text = tenths < 100 ? tenthsText(tenths) : String(roundHalfUp(value));
        const name = SCALE_NAMES[scaleIdx];
        return name ? text + ' ' + name : text;
    }

    // Past the names. Same normalise-after-rounding rule, so 9.96 x 10^23 becomes
    // 1.0 x 10^24 rather than the two implementations splitting on the exponent.
    let exp = Math.floor(log10v);
    let mantissa = Math.pow(10, log10v - exp);
    if (roundHalfUp(mantissa * 10) >= 100) { exp += 1; mantissa = mantissa / 10; }
    return round1(mantissa) + ' × 10^' + exp;
}

/**
 * The figures the readout shows, as finished strings.
 *
 * The word part is looked up rather than computed, because no-repeat drawing makes
 * the space ordered tuples of DISTINCT words rather than a plain product of sizes,
 * and counting those needs inclusion-exclusion over the categories. The table also
 * carries the pooled figures for mix and the non-uniform ones for random.
 *
 * [sizes] is only the fallback for a missing table: it ignores the no-repeat
 * correction, which is worth about 0.05 bits, and is much better than no readout.
 */
function describeStrength(model, plan, language, wordType, sizes, addDigits, digitCount, separator) {
    let hmin = 0;
    let h2 = 0;
    const row = model && model[language] && model[language][wordType]
        && model[language][wordType][plan.length];
    if (row) {
        hmin = row.hmin;
        h2 = row.h2;
    } else {
        for (const size of sizes) if (size > 1) hmin += Math.log2(size);
        h2 = hmin;
    }

    // Digits are uniform and independent, so they add the same amount to both.
    const digits = addDigits ? plan.length * digitCount * LOG2_10 : 0;
    hmin += digits;
    h2 += digits;

    // Separators: log2(4) once for "random", log2(4) per gap for "mix", nothing for
    // a fixed choice or a one-word name. Two word splits colliding under an empty
    // separator costs 0.0002 bits on average but up to 1 bit of MIN-entropy for the
    // names affected, which is the measure reported. Documented, not modelled.
    const gapCount = Math.max(plan.length - 1, 0);
    const perDraw = Math.log2(SEPARATOR_VALUES.length);
    let separatorBits = 0;
    if (separator === SEPARATOR_MIX) separatorBits = gapCount * perDraw;
    // One draw for the whole name, and none at all when there is no gap to fill.
    else if (separator === SEPARATOR_RANDOM && gapCount > 0) separatorBits = perDraw;
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

/**
 * The strongest settings available, COMPUTED rather than assumed.
 *
 * Which word type wins is not obvious and is not stable: it depends on how much
 * the dictionaries overlap between languages, which changes whenever a word list
 * is edited. Verbs currently win because they are the least shared across
 * languages; nouns lose because "ninja", "samurai" and "titan" appear in six to
 * nine of the eleven lists, which costs exactly the unpredictability the mode is
 * supposed to buy. Hardcoding today's winner would quietly become a lie.
 */
function maxEntropyOptions(model) {
    let best = null;
    for (const language of [LANGUAGE_MIX, LANGUAGE_RANDOM, ...REAL_LANGUAGES]) {
        for (const type of WORD_TYPES) {
            const plan = categoryPlan(MAX_WORD_COUNT, type);
            const strength = describeStrength(
                model, plan, language, type, [], true, MAX_DIGIT_COUNT, SEPARATOR_MIX);
            if (!best || strength.hmin > best.strength.hmin) best = { language, type, strength };
        }
    }
    return {
        language: best.language,
        type: best.type,
        words: MAX_WORD_COUNT,
        addDigits: true,
        digitCount: MAX_DIGIT_COUNT,
        separator: SEPARATOR_MIX,
        strength: best.strength,
    };
}

/**
 * Recomputes the readout from whatever the controls currently say.
 *
 * Reads dictionaries through the same cache the generator uses, so after the
 * first generation in a given language this costs nothing and needs no network.
 */
async function updateStrength() {
    if (!strengthBitsBox) return;
    const numWords = parseInt(wordsInput.value) || 2;
    const wordType = typeInput.value;
    const language = langInput.value;
    const plan = categoryPlan(numWords, wordType);
    const model = await fetchEntropyModel();

    // Sizes are only needed for a fixed language; fetching all eleven languages'
    // lists just to count them would be a pointless round trip under mix.
    const sizes = isRealLanguage(language)
        ? (await Promise.all(plan.map(cat => fetchDict(language, cat)))).map(list => list.length)
        : [];

    const strength = describeStrength(
        model, plan, language, wordType, sizes,
        digitsInput ? digitsInput.checked : true,
        readDigitCount(),
        separatorInput ? separatorInput.value : '',
    );

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

/** True for the eleven real languages, false for the two drawing modes. */
function isRealLanguage(value) {
    return REAL_LANGUAGES.indexOf(value) >= 0;
}

async function generateUsername() {
    outputBox.classList.add('loading');
    outputBox.textContent = 'Generating...';
    generateBtn.style.pointerEvents = 'none';

    const numWords = parseInt(wordsInput.value) || 2;
    const type = typeInput.value;
    const lang = langInput.value;
    const separator = separatorInput.value;
    // Defaults if a control is ever missing from the page match the contract shared
    // with username.py and the Android app: digits on, after the word, one per word.
    const addDigits = digitsInput ? digitsInput.checked : true;
    const digitPosition = readDigitPosition();
    const digitCount = readDigitCount();

    // The plan is the shared one, so the words generated and the bits advertised
    // can never describe different schemes. fetchDict is cached, so repeated
    // categories in the plan cost one fetch, not one per slot.
    const plan = categoryPlan(numWords, type);
    const sources = await resolveSources(plan, lang, randomLanguageIndex);
    const result = drawDistinct(sources, getRandomWord);

    // digitCount is deliberately still passed when digits are off: assemble ignores it
    // on that branch, and reading it unconditionally keeps the call site honest about
    // what the options are rather than hiding the rule in two places.
    const separators = resolveSeparators(
        Math.max(result.length - 1, 0), separator, randomSeparatorIndex);
    const finalUsername = assembleWith(
        result, separators, addDigits, digitPosition, digitCount, randomDigit);
    
    // Simulate slight delay for effect
    setTimeout(() => {
        outputBox.classList.remove('loading');
        outputBox.textContent = finalUsername;
        generateBtn.style.pointerEvents = 'auto';
        
        // Pop animation
        outputBox.style.transform = 'scale(1.02)';
        setTimeout(() => outputBox.style.transform = 'scale(1)', 150);
    }, 300);
}

// Copy to clipboard
copyBtn.addEventListener('click', () => {
    if (outputBox.classList.contains('loading')) return;
    
    const text = outputBox.textContent;
    navigator.clipboard.writeText(text).then(() => {
        const originalColor = copyBtn.style.color;
        copyBtn.style.color = '#10b981'; // Green
        setTimeout(() => {
            copyBtn.style.color = originalColor;
        }, 1500);
    });
});

// Generate on click and enter
generateBtn.addEventListener('click', generateUsername);
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') generateUsername();
});

// Keep position and count in step with the checkbox as soon as it is toggled, not
// only when the next username is generated.
if (digitsInput) digitsInput.addEventListener('change', syncDigitControls);

// Applies the strongest settings in one press. The values are computed from the
// model rather than written here, so this cannot drift from what the hint claims.
if (maxEntropyBtn) {
    maxEntropyBtn.addEventListener('click', async () => {
        const max = maxEntropyOptions(await fetchEntropyModel());
        langInput.value = max.language;
        separatorInput.value = max.separator;
        typeInput.value = max.type;
        wordsInput.value = String(max.words);
        if (digitsInput) digitsInput.checked = max.addDigits;
        if (digitCountInput) digitCountInput.value = String(max.digitCount);
        syncDigitControls();
        await updateStrength();
        generateUsername();
    });
}

// Every control that moves the number, on both events: 'change' alone misses a
// digit typed into the number field until it loses focus, which reads as the
// readout being stuck.
[wordsInput, typeInput, langInput, digitsInput, digitCountInput, separatorInput].forEach(el => {
    if (!el) return;
    el.addEventListener('change', updateStrength);
    el.addEventListener('input', updateStrength);
});

// Initial generation. The sync runs first, so the dependent controls already look
// right before anything appears in the output box.
window.addEventListener('DOMContentLoaded', () => {
    syncDigitControls();
    updateStrength();
    generateUsername();
});
