#!/usr/bin/env python3
import sys
import math
import secrets

# Word choice uses `secrets`, not `random`. The Android app has always used
# SecureRandom and says so publicly; this CLI used Mersenne Twister, which is
# predictable from a handful of outputs. People generate usernames to keep
# identities apart, and that only works if the next one is not guessable from
# the last, so the three implementations now agree on this too.
import os
import json
import unicodedata

SCRIPT_DIR = os.path.dirname(os.path.realpath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "data")
CONFIG_PATH = os.path.expanduser("~/.config/username_generator.json")

# NFD decomposition plus combining-mark removal handles a-ring, c-cedilla, a-breve,
# s-acute and the rest. It does NOT touch letters that have no decomposition at all:
# they are single codepoints, not base plus accent. Without this map "drommer" keeps
# its o-slash and "sokol" keeps its l-stroke, which defeats the whole point of
# producing platform-agnostic usernames. Keep this table in sync with the identical
# ones in script.js and android/.../UsernameEngine.kt.
TRANSLITERATE = {
    "\u00f8": "o",   # o with stroke, Norwegian/Danish
    "\u0142": "l",   # l with stroke, Polish
    "\u00df": "ss",  # sharp s, German
    "\u00e6": "ae",  # ae ligature, Norwegian/Danish
    "\u0153": "oe",  # oe ligature, French
    "\u0111": "d",   # d with stroke
    "\u00f0": "d",   # eth
    "\u00fe": "th",  # thorn
    "\u0131": "i",   # dotless i
}


def sanitize(value):
    """Reduce a generated username to plain ASCII."""
    value = ''.join(TRANSLITERATE.get(c, c) for c in value)
    return ''.join(c for c in unicodedata.normalize('NFD', value)
                   if unicodedata.category(c) != 'Mn')


# Where the per-word digits go. Stored in the config as plain strings rather than as
# an index, so a hand-edited config file stays readable and a third position could be
# added later without renumbering anyone's saved settings.
DIGIT_BEFORE = "before"
DIGIT_AFTER = "after"
DIGIT_POSITIONS = (DIGIT_BEFORE, DIGIT_AFTER)

# The Android settings screen offers one to five digits per word and the web app
# matches it, so the CLI accepts the same range and no more. Five digits per word is
# already 16.6 bits per word, far past the point where the words carry the name.
MIN_DIGIT_COUNT = 1
MAX_DIGIT_COUNT = 5


def random_digit():
    """One uniform digit 0 to 9 from the CSPRNG.

    The counterpart of randomDigit() in script.js and of the SecureRandom lambda in
    UsernameEngine.kt. `secrets.randbelow` rejection samples internally, so there is
    no modulo bias to correct for the way the web app has to correct for it.
    """
    return secrets.randbelow(10)


# ---------------------------------------------------------------------------
# Language modes
#
# Two pseudo-languages sit above the eleven real ones. They are not languages;
# they are instructions about how to CHOOSE one:
#
#   random  one language is drawn for the WHOLE username, so every word matches.
#   mix     each word is drawn from the eleven vocabularies POOLED, so words can
#           disagree with each other. Not "a language per word": see word_pool for
#           why that scheme was replaced.
#
# "mix" is the only mode that can put words from different languages in one name,
# and is the reason for the warning in the README and DISCLAIMER.md: the word
# lists were each reviewed by a native speaker of their own language and nobody
# else, so mixing is the first mode that puts them side by side.
# ---------------------------------------------------------------------------

LANGUAGE_RANDOM = "random"
LANGUAGE_MIX = "mix"

# The eleven real languages, in the order tools/gen-entropy-model.py used and that
# REAL_LANGUAGES in script.js and Language.real in Kotlin also use. The order is
# load-bearing for tests only: a stubbed picker returns an index, and this list
# decides which language that index means.
REAL_LANGUAGES = ["en", "no", "pt", "es", "de", "fr", "it", "nl", "pl", "ro", "la"]

WORD_TYPES = ["mixed", "noun", "adjective", "verb"]
MIN_WORD_COUNT = 1
MAX_WORD_COUNT = 5


def is_real_language(value):
    return value in REAL_LANGUAGES


def random_language_index():
    return secrets.randbelow(len(REAL_LANGUAGES))


def resolve_slot_languages(plan, language, pick_language=random_language_index):
    """Which language each word slot draws from, for the modes that have one.

    LANGUAGE_MIX is absent on purpose: pooling means it does not choose a language
    at all, it chooses a word from the combined vocabulary. See resolve_sources.

    pick_language returns an index into REAL_LANGUAGES and is injected so a test can
    pass a counter where production passes the CSPRNG. Called ONCE for "random" and
    not at all for a fixed language. Never pass a predictable source in production.
    """
    if language == LANGUAGE_RANDOM:
        one = REAL_LANGUAGES[pick_language()]
        return [one for _ in plan]
    return [language for _ in plan]


_POOL_CACHE = {}


def _sanitise_distinct(words):
    """Drops entries that would DISPLAY identically to an earlier one.

    "male" and "måle" are both in no_verbs and both render as "male"; across the
    pooled vocabulary 116 pairs collide this way ("dragon"/"dragón",
    "titan"/"titán", "angel"/"ángel"). Two consequences, both bad:

    1. The no-repeat rule compared RAW words, so "dragon-dragon" was reachable and
       the guarantee in the README was false.
    2. A displayed word backed by two entries was twice as likely as one backed by
       one, so the distribution over what the user actually sees was not uniform
       and every min-entropy figure was slightly optimistic.

    Removing the duplicate at the source fixes both at once and keeps raw and
    displayed forms one-to-one, which is what makes the entropy model exact rather
    than an upper bound. The first occurrence wins, so the result is deterministic.
    """
    seen = {}
    for word in words:
        seen.setdefault(sanitize(word), word)
    return list(seen.values())


def word_pool(category):
    """The combined vocabulary for one category across all eleven languages.

    Built by walking the languages in the shared order and keeping first
    occurrences rather than by sorting, so every implementation builds the same
    list without depending on how a platform collates strings.

    This is what makes "mix" honest. Choosing a language and then a word made
    "ninja" about nine times likelier than a word unique to one language, because
    it sits in 9 of the 11 noun lists, costing up to 3.06 bits per word. Drawing
    from the pool makes every word equally likely and deletes nothing.
    """
    if category in _POOL_CACHE:
        return _POOL_CACHE[category]
    combined = []
    for lang in REAL_LANGUAGES:
        combined.extend(load_words(lang, category))
    _POOL_CACHE[category] = _sanitise_distinct(combined)
    return _POOL_CACHE[category]


def resolve_sources(plan, language, pick_language=random_language_index):
    """Where each slot's words come from: pooled under mix, a dictionary otherwise."""
    if language == LANGUAGE_MIX:
        return [word_pool(c) for c in plan]
    slot_languages = resolve_slot_languages(plan, language, pick_language)
    return [load_words(slot_languages[i], c) for i, c in enumerate(plan)]


SEPARATOR_RANDOM = "random"
SEPARATOR_MIX = "mix"
# Order is load-bearing: it must match SEPARATOR_VALUES in script.js and
# Separator.real in Kotlin, because a separator index means the same character
# in all three.
SEPARATOR_VALUES = ["", "-", "_", "."]


def random_separator_index():
    return secrets.randbelow(len(SEPARATOR_VALUES))


def resolve_separators(gap_count, separator, pick_separator=random_separator_index):
    """Which separator sits in each gap.

    Drawn PER GAP rather than once per name: four options over four gaps is 8 bits
    on a five-word name where one draw would be 2. A one-word name has no gaps and
    gains nothing, which the entropy figures reflect.

    "none" stays in the pool. It lets two different word splits produce the same
    string, but measurably rarely: 0.0002 bits on a two-word name across the pooled
    vocabulary, against the 0.42 bits per gap that dropping it would cost.
    """
    if separator == SEPARATOR_MIX:
        return [SEPARATOR_VALUES[pick_separator()] for _ in range(gap_count)]
    if separator == SEPARATOR_RANDOM:
        # One draw, used in every gap, which is what makes it look deliberate.
        one = SEPARATOR_VALUES[pick_separator()]
        return [one] * gap_count
    return [separator] * gap_count


MAX_DRAW_ATTEMPTS = 64


def draw_distinct(sources, pick=secrets.choice):
    """Rejection sampling on the WHOLE tuple, so no word appears twice in one name.

    Redrawing only the clashing slot would be cheaper and WRONG: it would bias the
    result towards words that happen to sit in fewer of the other slots' lists, and
    every figure in the readout assumes a uniform draw over distinct-word names.
    Redrawing the lot keeps it exactly uniform, which is the distribution
    tools/gen-entropy-model.py counts.

    A five-word name is accepted about 97% of the time, so this rarely loops. The
    bound exists only so a pathologically small list cannot hang the tool.
    """
    for _ in range(MAX_DRAW_ATTEMPTS):
        words = [pick(source) for source in sources]
        if len(set(words)) == len(words):
            return words
    return [pick(source) for source in sources]


_ENTROPY_MODEL = None


def load_entropy_model():
    """The exact entropy of every language option, keyed language/type/words.

    Returns None if unreadable; callers then fall back to the size-based figure. A
    packaging fault should cost the readout its last decimal, never break it.
    """
    global _ENTROPY_MODEL
    if _ENTROPY_MODEL is not None:
        return _ENTROPY_MODEL
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        "data", "entropy-model.tsv")
    try:
        model = {}
        with open(path, encoding="utf-8") as f:
            for line in f:
                if not line.strip() or line.startswith("#"):
                    continue
                language, word_type, words, hmin, h2 = line.rstrip("\n").split("\t")
                model.setdefault(language, {}).setdefault(word_type, {})[int(words)] = \
                    {"hmin": float(hmin), "h2": float(h2)}
        _ENTROPY_MODEL = model
        return model
    except (OSError, ValueError):
        return None


FALLBACK_CONFIG = {
    "num_words": 2,
    "word_type": "mixed",
    # Defaults to "random" from this version, where earlier releases defaulted to
    # English. A stored config keeps whatever it stored, so this reaches only people
    # who never chose a language.
    "lang": LANGUAGE_RANDOM,
    "separator": "-",
    # Digits are ON by default from this version on. That changes the output for
    # v1.0.1 users who never touched the option, which is the owner's deliberate
    # call: the digits are the cheapest entropy the generator has (3.3 bits per
    # word, taking a three-word name from 24.7 bits to 34.7 at 300-word
    # dictionaries), and most people never open the options at all.
    #
    # The key stays "digits" rather than becoming "add_digits". A v1.0.1 config that
    # holds "digits": false was a deliberate choice by that user, and load_config
    # lets any stored value win over these fallbacks, so renaming the key would
    # silently hand exactly those users the opposite of what they picked.
    "digits": True,
    "digit_position": DIGIT_AFTER,
    "digit_count": 1
}

def clamp_digit_count(value):
    """Coerce anything to a digit count inside the supported range."""
    try:
        count = int(value)
    except (TypeError, ValueError):
        return FALLBACK_CONFIG["digit_count"]
    return max(MIN_DIGIT_COUNT, min(MAX_DIGIT_COUNT, count))

def normalise_config(config):
    """Force the stored digit settings into the shapes the generator expects.

    The config is plain JSON in the user's home directory and people do edit it by
    hand. A typo in `digit_position`, or a `digit_count` of 40, should quietly fall
    back to something sane rather than raise a traceback at the one moment somebody
    wanted a username.
    """
    config["digits"] = bool(config.get("digits", FALLBACK_CONFIG["digits"]))
    position = str(config.get("digit_position", DIGIT_AFTER)).lower()
    config["digit_position"] = position if position in DIGIT_POSITIONS else DIGIT_AFTER
    config["digit_count"] = clamp_digit_count(config.get("digit_count", FALLBACK_CONFIG["digit_count"]))
    return config

def load_config():
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, 'r') as f:
                config = json.load(f)
                # Stored keys win over the fallbacks, which is what keeps a previously
                # chosen setting from being reset by a new default. Only keys the user
                # has never saved pick up the values above.
                return normalise_config({**FALLBACK_CONFIG, **config})
        except Exception:
            pass
    return normalise_config(FALLBACK_CONFIG.copy())

def save_config(config):
    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
    with open(CONFIG_PATH, 'w') as f:
        json.dump(config, f, indent=4)

def load_words(lang, word_type):
    filename = f"{lang}_{word_type}s.txt"
    filepath = os.path.join(DATA_DIR, filename)
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            words = [line.strip().lower() for line in f if line.strip()]
        return _sanitise_distinct(words)
    except FileNotFoundError:
        print(f"Error: Could not find dictionary file '{filename}' in {DATA_DIR}")
        sys.exit(1)

def digit_run(digit_count, digit):
    """A freshly drawn run of `digit_count` digits.

    Called once per word, never once per username: every word gets its own run, so
    "bright482-river315" draws six digits and not three reused twice. Each digit is an
    independent draw, so a run carries 3.3 bits each.
    """
    return ''.join(str(digit()) for _ in range(digit_count))

def _join_parts(parts, separators):
    """Joins parts with a possibly different separator in each gap."""
    out = []
    for i, part in enumerate(parts):
        if i:
            out.append(separators[i - 1])
        out.append(part)
    return "".join(out)


def assemble(parts, separator, add_digits=True, digit_position=DIGIT_AFTER,
             digit_count=1, digit=random_digit):
    """Join the chosen words into the final username.

    Split out of generate_username so it can be tested without touching the word
    lists, matching UsernameEngine.assemble in the Kotlin app. `digit` is injected for
    the same reason: production leaves it as the CSPRNG-backed default, a test passes
    a counter and the result becomes deterministic. Never pass a seeded or otherwise
    predictable source in production.

    The no-digits branch joins first and sanitises the whole string once, which is the
    original path and is left exactly as it was. Sanitising per word would be
    equivalent for every dictionary entry we ship, but "equivalent as far as I can
    tell" is not a good enough reason to change the code path that produced every
    username already in the wild.
    """
    if not add_digits:
        return sanitize(_join_parts(parts, [separator] * max(len(parts) - 1, 0)))

    # Digits go on AFTER sanitising, so normalisation can never mangle one, and the
    # runs are drawn word by word from left to right, which is what makes the output
    # reproducible from a stubbed digit source in the tests.
    return separator.join(
        place_digits(sanitize(word), digit_position, digit_count, digit)
        for word in parts
    )

def place_digits(word, digit_position, digit_count, digit):
    """Attach one freshly drawn run of digits to an already sanitised word.

    The run is drawn before it is placed either side, so BEFORE and AFTER consume the
    draws in the same order: given 4 then 7, AFTER gives "bright4-river7" and BEFORE
    gives "4bright-7river", the same two draws either way.
    """
    run = digit_run(digit_count, digit)
    if digit_position == DIGIT_BEFORE:
        return run + word
    return word + run

# ---------------------------------------------------------------------------
# Strength: what the current options are actually worth.
#
# Two figures, because they answer different questions people reliably conflate:
# "combinations" is how many names the options can produce, so 1 in N is the
# chance one blind guess lands on yours; "collision_at" is how many names must
# exist before two match at even odds. The second is the birthday bound, roughly
# 1.1774 * sqrt(N), and it is dramatically smaller: at 16.5 bits it is 353 names,
# not 90,000. The gap between them is the entire reason both are shown.
#
# The language is deliberately NOT counted. An attacker who does not know which
# of the eleven was used must search all of them, worth +3.33 bits, once, for the
# whole username rather than per word. It is excluded because the CSPRNG did not
# choose the language, the user did, and predictably: the words announce their own
# language to anyone who reads them. Entropy counts what was randomly drawn, never
# what an attacker happens not to know yet.
#
# Mirrors Strength.kt and the same functions in script.js, to the last decimal.
# ---------------------------------------------------------------------------

LOG2_10 = 3.321928094887362
LOG10_2 = 0.3010299956639812
# log10(sqrt(2 * ln 2)). Everything is carried in log10 rather than as a count,
# because five words with five digits each is 2**124.
LOG10_BIRTHDAY = 0.0709277283545598

SCALE_NAMES = ["", "thousand", "million", "billion", "trillion",
               "quadrillion", "quintillion"]

# Every figure arrives through log and pow, which carry ~1e-15 of relative error,
# and exact halfway cases are common rather than exotic: any dictionary size times
# a power of ten produces one, and 275 words with one digit lands on exactly 2.75
# thousand. Without this tolerance CPython, the JVM and V8 round it in different
# directions and the three surfaces disagree in public.
ROUND_EPS = 1e-9


def category_plan(word_count, word_type):
    """Which category each word slot draws from.

    The single source of truth for BOTH generation and the strength readout, so a
    change to the mixed-format rule cannot leave one of them describing a scheme
    the tool no longer produces. Mirrors categoryPlan in script.js and
    UsernameEngine.categoryPlan.
    """
    if word_type != "mixed":
        return [word_type] * word_count
    if word_count <= 1:
        return ["noun"]
    if word_count == 2:
        return ["adjective", "noun"]
    return ["verb", "adjective"] + ["noun"] * (word_count - 2)


def strength_bits(model, plan, language, word_type, sizes, add_digits, digit_count,
                  separator="-"):
    """Min-entropy and collision entropy in bits.

    The word part is looked up rather than computed, because no-repeat drawing makes
    the space ordered tuples of DISTINCT words rather than a product of sizes, and
    counting those needs inclusion-exclusion over the categories. sizes is only the
    fallback for a missing table.

    The separator contributes nothing and is correctly absent, being a fixed choice
    rather than a draw.
    """
    row = None
    if model:
        row = model.get(language, {}).get(word_type, {}).get(len(plan))
    if row is not None:
        hmin = row["hmin"]
        h2 = row["h2"]
    else:
        hmin = 0.0
        for size in sizes:
            if size > 1:
                hmin += math.log2(size)
        h2 = hmin

    # Digits are uniform and independent, so they add the same amount to both.
    digits = len(plan) * digit_count * LOG2_10 if add_digits else 0.0
    hmin += digits
    h2 += digits

    # Separators: log2(4) once for "random", log2(4) per gap for "mix", nothing for a
    # fixed choice or a one-word name. The 0.0002 bits lost to two word splits
    # colliding under an empty separator is below the displayed precision.
    gap_count = max(len(plan) - 1, 0)
    per_draw = math.log2(len(SEPARATOR_VALUES))
    if separator == SEPARATOR_MIX:
        separator_bits = gap_count * per_draw
    elif separator == SEPARATOR_RANDOM and gap_count > 0:
        separator_bits = per_draw
    else:
        separator_bits = 0.0
    return hmin + separator_bits, h2 + separator_bits


def _round_half_up(value):
    return math.floor(value + 0.5 + ROUND_EPS)


def _tenths_text(tenths):
    """Renders tenths as a decimal, so 28 becomes '2.8'."""
    return f"{tenths // 10}.{tenths % 10}"


def _round1(value):
    """One decimal place by integer arithmetic.

    Python's format spec rounds half to even, Java's %.1f half up and JS toFixed
    differently again; doing it by hand is the only version identical in all three.
    """
    return _tenths_text(_round_half_up(value * 10))


def _human_from_log10(log10v):
    """Renders a magnitude supplied as log10, so nothing need fit in a float.

    Every branch decides on a value that has ALREADY been rounded, never on a raw
    threshold. Deciding on a raw threshold is what makes implementations disagree:
    at exactly one million, one lands on 999.9999 thousand and another on 1.0
    million, and they print different words for the same number.
    """
    if log10v < 3.5:
        n = _round_half_up(10.0 ** log10v)
        if n < 1000:
            return str(n)

    scale_idx = math.floor(log10v / 3)
    value = 10.0 ** (log10v - 3 * scale_idx)
    # 999.96 is a thousand of the next scale up, not "1000 thousand".
    if _round_half_up(value) >= 1000:
        value /= 1000
        scale_idx += 1

    if scale_idx < len(SCALE_NAMES):
        tenths = _round_half_up(value * 10)
        # Below ten a decimal is informative; at or above it, noise. Tested on the
        # rounded tenths, so nothing can straddle the cutoff.
        text = _tenths_text(tenths) if tenths < 100 else str(_round_half_up(value))
        name = SCALE_NAMES[scale_idx]
        return f"{text} {name}" if name else text

    # Past the names, same normalise-after-rounding rule.
    exp = math.floor(log10v)
    mantissa = 10.0 ** (log10v - exp)
    if _round_half_up(mantissa * 10) >= 100:
        exp += 1
        mantissa /= 10
    return f"{_round1(mantissa)} \u00d7 10^{exp}"


def describe_strength(model, plan, language, word_type, sizes, add_digits, digit_count,
                      separator="-"):
    """The figures the readout shows, as finished strings."""
    hmin, h2 = strength_bits(model, plan, language, word_type, sizes, add_digits,
                             digit_count, separator)
    return {
        "hmin": hmin,
        "h2": h2,
        "bits_text": _round1(hmin),
        # Guessing uses MIN-entropy, the worst case; a security figure must never
        # be optimistic. The birthday bound is governed by COLLISION entropy, so
        # the repeat figure uses that instead. For one fixed language the
        # distribution is uniform and the two coincide.
        "combinations": _human_from_log10(hmin * LOG10_2),
        "collision_at": _human_from_log10(LOG10_BIRTHDAY + h2 * 0.5 * LOG10_2),
    }


def max_entropy_options(model):
    """The strongest settings available, computed rather than assumed.

    Searches every language option and word type: which combination wins depends on
    how much the dictionaries overlap, which changes whenever a list is edited.
    """
    best = None
    for language in [LANGUAGE_MIX, LANGUAGE_RANDOM] + REAL_LANGUAGES:
        for word_type in WORD_TYPES:
            plan = category_plan(MAX_WORD_COUNT, word_type)
            s = describe_strength(model, plan, language, word_type, [], True, MAX_DIGIT_COUNT,
                                  SEPARATOR_MIX)
            if best is None or s["hmin"] > best[2]["hmin"]:
                best = (language, word_type, s)
    return {"language": best[0], "word_type": best[1], "num_words": MAX_WORD_COUNT,
            "add_digits": True, "digit_count": MAX_DIGIT_COUNT,
            "separator": SEPARATOR_MIX, "strength": best[2]}


def describe_options(num_words, word_type, lang, add_digits, digit_count, separator="-"):
    """Strength of a set of options, reading the real word lists."""
    plan = category_plan(num_words, word_type)
    # Sizes are only meaningful for a fixed language; reading all eleven languages'
    # lists under mix would be work whose result is then discarded.
    sizes = [len(load_words(lang, c)) for c in plan] if is_real_language(lang) else []
    return describe_strength(load_entropy_model(), plan, lang, word_type, sizes,
                             add_digits, digit_count, separator)


def generate_username(num_words, word_type, lang, separator, add_digits=True,
                      digit_position=DIGIT_AFTER, digit_count=1, digit=random_digit):
    # The plan is the shared one, so the words generated and the bits reported
    # can never describe different schemes.
    plan = category_plan(num_words, word_type)
    result = draw_distinct(resolve_sources(plan, lang))
    # Mirrors UsernameEngine.kt and script.js; all three must agree byte for byte.
    separators = resolve_separators(max(len(result) - 1, 0), separator)
    decorated = [place_digits(sanitize(w), digit_position, digit_count, digit) if add_digits
                 else sanitize(w) for w in result]
    if not add_digits:
        return sanitize(_join_parts(result, separators))
    return _join_parts(decorated, separators)

def main():
    config = load_config()
    num_words = config["num_words"]
    word_type = config["word_type"]
    lang = config["lang"]
    separator = config["separator"]
    add_digits = config["digits"]
    digit_position = config["digit_position"]
    quiet = False
    digit_count = config["digit_count"]
    
    save_requested = False
    args = sys.argv[1:]
    
    for arg in args:
        if arg == "save":
            save_requested = True
        elif arg in ("max", "--max", "maxentropy", "--max-entropy"):
            # Applies the strongest settings available, COMPUTED from the entropy
            # model rather than hardcoded. Which word type wins depends on how much
            # the dictionaries overlap between languages, and that changes whenever a
            # word list is edited, so writing today's answer in here would quietly
            # become wrong. Mirrors the "Max entropy" control in the web and Android
            # apps, and reads from the same table, so all three agree on what
            # "maximum" means.
            best = max_entropy_options(load_entropy_model())
            num_words = best["num_words"]
            word_type = best["word_type"]
            lang = best["language"]
            add_digits = best["add_digits"]
            digit_count = best["digit_count"]
            separator = best["separator"]
        elif arg.isdigit():
            num_words = int(arg)
        elif arg in ["noun", "adjective", "verb", "mixed"]:
            word_type = arg
        elif arg in REAL_LANGUAGES or arg in (LANGUAGE_RANDOM, LANGUAGE_MIX):
            lang = arg
        elif arg in ("digits", "--digits"):
            add_digits = True
        elif arg in ("nodigits", "--no-digits"):
            add_digits = False
        elif arg.startswith(("digits:", "--digits:")):
            # The long-flag spellings are accepted because "--digits" and
            # "--no-digits" already were; somebody who learned the flag form of the
            # switch should not hit a wall when they reach for the count.
            value = arg.split("digits:", 1)[1]
            if not value.isdigit():
                print(f"Warning: '{arg}' needs a whole number, ignoring.")
            elif int(value) == 0:
                # Asking for zero digits plainly means none. Clamping up to one would
                # do the exact opposite of what was typed.
                add_digits = False
            else:
                count = int(value)
                if count > MAX_DIGIT_COUNT:
                    print(f"Warning: '{arg}' is above the maximum of {MAX_DIGIT_COUNT}, using {MAX_DIGIT_COUNT}.")
                digit_count = min(count, MAX_DIGIT_COUNT)
                # Naming a digit count is asking for digits, so it turns them on. Same
                # for digitpos below. An explicit "nodigits" later in the line still
                # wins, since arguments are applied in the order they are typed.
                add_digits = True
        elif arg.startswith(("digitpos:", "--digitpos:")):
            value = arg.split("digitpos:", 1)[1].lower()
            if value in DIGIT_POSITIONS:
                digit_position = value
                add_digits = True
            else:
                print(f"Warning: '{arg}' must be '{DIGIT_BEFORE}' or '{DIGIT_AFTER}', ignoring.")
        elif arg in ["quiet", "-q", "--quiet"]:
            # Suppresses the strength line only; the username still prints.
            quiet = True
        elif arg.startswith("separator:"):
            separator = arg.split("separator:", 1)[1]
        elif arg in ["-h", "--help", "help"]:
            print("Username Generator")
            print("Usage: username [options]")
            print("\nOptions can be provided in any order:")
            print("  <number>           Number of words (e.g., '1', '3')")
            print("  quiet              Suppress the entropy line on stderr")
            print("  max                Strongest settings available (computed, not fixed)")
            print("  random             Draw one language at random for the whole name (default)")
            print("  mix                Draw each word from all languages pooled (may read oddly)")
            print("  separator:random   One separator drawn at random, used throughout")
            print("  separator:mix      A separator drawn at random for every gap")
            print("  adjective|noun|verb Type of words to use")
            print("  de|en|es|fr|it|la|nl|no|pl|pt Language code")
            print("  separator:<char>   Character to join words (e.g., 'separator:_')")
            print("  digits             Add random digits to each word (on by default)")
            print("  nodigits           Turn that off again")
            print(f"  digits:<{MIN_DIGIT_COUNT}-{MAX_DIGIT_COUNT}>       Digits per word, drawn separately for each word")
            print("  digitpos:before|after Put the digits before or after each word (default after)")
            print("  save               Save the provided options as the new default")
            print("\nDigits, shown with the words 'bright' and 'river':")
            print("  digits             bright4-river7")
            print("  digitpos:before    4bright-7river")
            print("  digits:3           bright482-river315")
            print("\nExamples:")
            print("  username 3 pt save")
            print("  username noun separator:_")
            print("  username max")
            print("  username 2 digits:2 digitpos:before separator:.")
            sys.exit(0)
        else:
            print(f"Warning: Unknown argument '{arg}', ignoring.")
            
    if save_requested:
        config["num_words"] = num_words
        config["word_type"] = word_type
        config["lang"] = lang
        config["separator"] = separator
        config["digits"] = add_digits
        config["digit_position"] = digit_position
        config["digit_count"] = digit_count
        save_config(config)
        if add_digits:
            plural = "digit" if digit_count == 1 else "digits"
            digit_note = f"{digit_count} {plural} {digit_position} each word"
        else:
            digit_note = "no digits"
        print(f"[Settings saved as default: {num_words} words, {word_type}, {lang}, separator '{separator}', {digit_note}]")
        
    username = generate_username(num_words, word_type, lang, separator, add_digits,
                                 digit_position, digit_count)
    print(username)

    # The readout goes to stderr, never stdout: `username | xclip` must put the
    # name on the clipboard and nothing else. Gated on STDERR being a terminal
    # rather than stdout, so piping the name somewhere still shows the figures to
    # the person who typed the command, while a script redirecting both sees none.
    if not quiet and sys.stderr.isatty():
        s = describe_options(num_words, word_type, lang, add_digits, digit_count, separator)
        print(f"{s['bits_text']} bits of entropy: 1 in {s['combinations']} combinations, "
              f"even odds of a repeat after {s['collision_at']} names",
              file=sys.stderr)

if __name__ == "__main__":
    main()
