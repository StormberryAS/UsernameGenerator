package no.stormberry.usernamegenerator

import android.content.res.AssetManager
import java.security.SecureRandom
import java.text.Normalizer

/**
 * The generation engine, ported from the web app's script.js and the username.py CLI
 * so all three produce the same shapes from the same word lists.
 *
 * All three implementations now draw from a CSPRNG: [SecureRandom] here, crypto
 * .getRandomValues in the web app and `secrets` in the Python CLI. People generate
 * usernames to separate identities, and a
 * predictable PRNG undermines that even though nothing here is a secret.
 */
object UsernameEngine {

    private val random = SecureRandom()

    /** Combining diacritical marks, stripped after NFD decomposition. */
    private val combiningMarks = Regex("\\p{Mn}+")

    /**
     * Letters that NFD cannot help with, because they are single codepoints rather
     * than a base plus a combining accent. Without this map "drommer" keeps its
     * o-slash and "sokol" keeps its l-stroke, which defeats the point of producing
     * usernames that any platform will accept. Keep in sync with the identical
     * tables in username.py and script.js.
     */
    private val transliterate = mapOf(
        '\u00f8' to "o",   // o with stroke, Norwegian/Danish
        '\u0142' to "l",   // l with stroke, Polish
        '\u00df' to "ss",  // sharp s, German
        '\u00e6' to "ae",  // ae ligature, Norwegian/Danish
        '\u0153' to "oe",  // oe ligature, French
        '\u0111' to "d",   // d with stroke
        '\u00f0' to "d",   // eth
        '\u00fe' to "th",  // thorn
        '\u0131' to "i",   // dotless i
    )

    /**
     * @param addDigits when true, every word carries its own independently drawn run
     *   of [digitCount] digits, placed on the side [digitPosition] names. On by
     *   default, which is a change from v1.0.1: see `Settings.addDigits` for how
     *   someone who already chose otherwise keeps their choice.
     *
     *   Digits are the cheapest entropy available. At 300-word dictionaries a
     *   three-word name carries 24.7 bits; one digit per word takes it to 34.7, which
     *   is more than tripling the dictionaries to 1,000 words would buy (29.9). In
     *   collision terms that moves a coin-flip repeat from roughly 5,200 users to
     *   roughly 164,000, and each further digit adds another 3.3 bits per word.
     *
     *   It also has a quiet second benefit: with [Separator.NONE] the digits act as
     *   word boundaries, so `bright4river7` stays readable where `brightriver` does not.
     * @param digitPosition which side of each word its digits go on. AFTER gives
     *   `bright4-river7`, BEFORE gives `4bright-7river`.
     * @param digitCount how many digits each word gets, one to five. The run is drawn
     *   per word, so three digits over two words is six independent draws, not one run
     *   repeated.
     */
    fun generate(
        dictionaries: Dictionaries,
        wordCount: Int,
        type: WordType,
        language: Language,
        separator: Separator,
        addDigits: Boolean = true,
        digitPosition: DigitPosition = DigitPosition.AFTER,
        digitCount: Int = 1,
    ): String {
        val plan = categoryPlan(wordCount, type)
        val sources = resolveSources(dictionaries, plan, language) {
            random.nextInt(Language.real.size)
        }
        val parts = drawDistinct(sources) { it[random.nextInt(it.size)] }
        val separators = resolveSeparators(maxOf(parts.size - 1, 0), separator) {
            random.nextInt(Separator.real.size)
        }
        return assembleWith(parts, separators, addDigits, digitPosition, digitCount) { random.nextInt(10) }
    }

    /**
     * Joins the chosen words into the final username.
     *
     * Separated from [generate] and left internal purely so it can be tested. The
     * production path needs a [Dictionaries], which needs an `AssetManager`, which
     * needs a device, and that is why [generate] had no test at all before this. The
     * word CHOICE is untestable without a device; everything after it is not, so this
     * is where the line goes.
     *
     * [digit] is injected for the same reason: production passes the SecureRandom, a
     * test passes a counter, and the result becomes deterministic without weakening
     * anything real. It is called once per digit, in word order, so a two-word name
     * with three digits each draws six times. **Never pass a seeded or predictable
     * source in production.**
     */
    internal fun assemble(
        parts: List<String>,
        separator: Separator,
        addDigits: Boolean = true,
        digitPosition: DigitPosition = DigitPosition.AFTER,
        digitCount: Int = 1,
        digit: () -> Int,
    ): String = assembleWith(
        parts,
        List(maxOf(parts.size - 1, 0)) { separator.value },
        addDigits, digitPosition, digitCount, digit,
    )

    /** Joins parts with a possibly different separator in each gap. */
    private fun joinParts(parts: List<String>, separators: List<String>): String =
        buildString {
            parts.forEachIndexed { index, part ->
                if (index > 0) append(separators[index - 1])
                append(part)
            }
        }

    /**
     * Joins the chosen words into the final username, one separator per gap.
     *
     * [digit] is injected so production passes the SecureRandom and a test passes a
     * counter, making the result deterministic without weakening anything real. It
     * is called once per digit in word order. **Never pass a seeded or predictable
     * source in production.**
     */
    internal fun assembleWith(
        parts: List<String>,
        separators: List<String>,
        addDigits: Boolean = true,
        digitPosition: DigitPosition = DigitPosition.AFTER,
        digitCount: Int = 1,
        digit: () -> Int,
    ): String {
        // The no-digits branch joins first and sanitises once. Sanitising per word
        // would be equivalent for every dictionary entry we ship, but "equivalent as
        // far as I can tell" is not a good enough reason to change the code path
        // that produced every username already in the wild.
        if (!addDigits) return sanitise(joinParts(parts, separators))

        // Floor of one, because digits-on yielding no digits would be a third shape
        // that is neither branch.
        val perWord = digitCount.coerceAtLeast(1)

        // Digits go on AFTER sanitising, so normalisation can never mangle one, and
        // the run is drawn inside the loop so each word gets its own.
        val decorated = parts.map { word ->
            val digits = buildString(perWord) { repeat(perWord) { append(digit()) } }
            val clean = sanitise(word)
            if (digitPosition == DigitPosition.AFTER) clean + digits else digits + clean
        }
        return joinParts(decorated, separators)
    }

    /**
     * Which language each word slot draws from, for the modes that have one.
     *
     * [Language.MIX] is absent on purpose: pooling means it does not choose a
     * language at all, it chooses a word from the combined vocabulary. See
     * [resolveSources].
     *
     * [pickLanguage] returns an index into [Language.real] and is injected so a
     * test can pass a counter where production passes the SecureRandom. Called
     * ONCE for [Language.RANDOM] and not at all for a fixed language.
     * **Never pass a seeded or predictable source in production.**
     */
    internal fun resolveSlotLanguages(
        plan: List<Category>,
        language: Language,
        pickLanguage: () -> Int,
    ): List<Language> = if (language == Language.RANDOM) {
        val one = Language.real[pickLanguage()]
        plan.map { one }
    } else {
        plan.map { language }
    }

    /**
     * Which separator sits in each gap.
     *
     * [Separator.RANDOM] and [Separator.MIX] mirror [Language.RANDOM] and
     * [Language.MIX] deliberately: random draws ONCE and uses it everywhere so the
     * name looks consistent, mix draws per gap so a name can hyphenate here and run
     * together there. Same distinction, same two words, in both controls.
     *
     * [Separator.NONE] stays in the pool. It lets two different word splits produce
     * the same string, but measurably rarely: 0.0002 bits on a two-word name across
     * the pooled vocabulary, against the 0.42 bits per gap that dropping it costs.
     */
    internal fun resolveSeparators(
        gapCount: Int,
        separator: Separator,
        pickSeparator: () -> Int,
    ): List<String> = when (separator) {
        Separator.MIX -> List(gapCount) { Separator.real[pickSeparator()].value }
        Separator.RANDOM -> {
            val one = Separator.real[pickSeparator()].value
            List(gapCount) { one }
        }
        else -> List(gapCount) { separator.value }
    }

    /** Where each slot's words come from: pooled under MIX, a dictionary otherwise. */
    internal fun resolveSources(
        dictionaries: Dictionaries,
        plan: List<Category>,
        language: Language,
        pickLanguage: () -> Int,
    ): List<List<String>> {
        if (language == Language.MIX) return plan.map { dictionaries.pool(it) }
        val slotLanguages = resolveSlotLanguages(plan, language, pickLanguage)
        return plan.mapIndexed { index, category ->
            dictionaries.words(slotLanguages[index], category)
        }
    }

    /**
     * Rejection sampling on the WHOLE tuple, so no word appears twice in one name.
     *
     * Redrawing only the clashing slot would be cheaper and WRONG: it would bias
     * the result towards words that happen to sit in fewer of the other slots'
     * lists, and every figure in the readout assumes a uniform draw over
     * distinct-word names. Redrawing the lot keeps it exactly uniform, which is the
     * distribution tools/gen-entropy-model.py counts.
     *
     * A five-word name is accepted about 97% of the time, so this rarely loops. The
     * bound exists only so a pathologically small word list cannot hang the app;
     * returning a name with a repeat beats never returning one.
     */
    internal fun drawDistinct(sources: List<List<String>>, pick: (List<String>) -> String): List<String> {
        repeat(MAX_DRAW_ATTEMPTS) {
            val words = sources.map(pick)
            if (words.toSet().size == words.size) return words
        }
        return sources.map(pick)
    }

    private const val MAX_DRAW_ATTEMPTS = 64

    /**
     * Which category each word slot draws from.
     *
     * The single source of truth for BOTH generation and the strength readout.
     * The mixed-format rule used to be stated in [generate] and again wherever
     * anything else needed to know the shape, which meant a change to one could
     * leave the other describing a scheme the app no longer produced: the
     * readout would quote bits for words nobody was generating, silently, with
     * no test positioned to notice. Mirrored by categoryPlan in script.js and
     * category_plan in username.py.
     *
     * Mixed follows the web app exactly: one word is a noun, two are adjective
     * plus noun, and three or more open with a verb, then an adjective, then
     * nouns.
     */
    internal fun categoryPlan(wordCount: Int, type: WordType): List<Category> {
        val fixed = type.category
        if (fixed != null) return List(wordCount) { fixed }
        if (wordCount <= 1) return listOf(Category.NOUN)
        if (wordCount == 2) return listOf(Category.ADJECTIVE, Category.NOUN)
        return List(wordCount) { index ->
            when (index) {
                0 -> Category.VERB
                1 -> Category.ADJECTIVE
                else -> Category.NOUN
            }
        }
    }

    /**
     * Strips accents so the result is accepted everywhere: "conducao" not "condução",
     * "drommer" not "drømmer", "sokol" not "sokół". Two steps, because NFD alone
     * cannot reach letters that have no decomposition. Matches username.py and script.js.
     */
    /** Internal rather than private so the JVM parity test can reach it. */
    internal fun sanitise(value: String): String {
        val mapped = buildString(value.length) {
            for (ch in value) append(transliterate[ch] ?: ch.toString())
        }
        return combiningMarks.replace(Normalizer.normalize(mapped, Normalizer.Form.NFD), "")
    }

    private fun List<String>.random(): String = this[random.nextInt(size)]
}

enum class Category(val suffix: String, val singular: String) {
    ADJECTIVE("adjectives", "adjective"),
    NOUN("nouns", "noun"),
    VERB("verbs", "verb"),
}

enum class WordType(val label: String, val key: String, val category: Category?) {
    MIXED("Mixed", "mixed", null),
    ADJECTIVE("Adjectives", "adjective", Category.ADJECTIVE),
    NOUN("Nouns", "noun", Category.NOUN),
    VERB("Verbs", "verb", Category.VERB),
}

/**
 * The four separators, plus the option that draws one at random.
 *
 * The order of the four real entries is load-bearing: it must match
 * SEPARATOR_VALUES in script.js and SEPARATOR_VALUES in username.py, because a
 * separator index means the same character in all three.
 */
enum class Separator(val label: String, val value: String) {
    NONE("none", ""),
    HYPHEN("-", "-"),
    UNDERSCORE("_", "_"),
    DOT(".", "."),
    RANDOM("random", ""),
    MIX("mix", ""),
    ;

    val isReal: Boolean get() = this != RANDOM && this != MIX

    companion object {
        val real: List<Separator> = entries.filter { it.isReal }
    }
}

/**
 * Which side of a word its digits sit on.
 *
 * [label] is both the chip text in the UI and the word the web app and the CLI use
 * for the same choice, so the three implementations stay describable in one sentence
 * rather than three.
 */
enum class DigitPosition(val label: String) {
    BEFORE("before"),
    AFTER("after"),
}

/**
 * The eleven bundled languages, plus the two ways of drawing one at random.
 *
 * [RANDOM] and [MIX] are not languages; they are instructions about how to CHOOSE
 * one. They live in this enum because from the user's point of view the question
 * "which language?" has thirteen answers, and modelling that as two separate
 * controls would describe the same choice worse. [isReal] separates them, and
 * [Dictionaries.words] rejects them outright, so neither can reach a file path.
 *
 * The order of the eleven real entries is load-bearing: it must match
 * REAL_LANGUAGES in script.js and LANGS in tools/gen-entropy-model.py, because a
 * language index means the same language in all three.
 *
 * [code] matches the `data/<code>_<category>.txt` files for the real ones.
 */
enum class Language(val code: String, val label: String) {
    RANDOM("random", "Random language"),
    MIX("mix", "Mix languages"),
    EN("en", "English"),
    NO("no", "Norsk"),
    PT("pt", "Português"),
    ES("es", "Español"),
    DE("de", "Deutsch"),
    FR("fr", "Français"),
    IT("it", "Italiano"),
    NL("nl", "Nederlands"),
    PL("pl", "Polski"),
    RO("ro", "Română"),
    LA("la", "Latina"),
    ;

    /** False for [RANDOM] and [MIX], which have no word lists of their own. */
    val isReal: Boolean get() = this != RANDOM && this != MIX

    companion object {
        /** The eleven real languages, in the order every implementation agrees on. */
        val real: List<Language> = entries.filter { it.isReal }
    }
}

/**
 * Lazily reads the bundled word lists out of assets and keeps them in memory.
 * All 33 files together are about 30 kB, so caching every list that gets touched
 * costs nothing and removes any reason to hit the disk twice.
 */
class Dictionaries(private val assets: AssetManager) {

    private val cache = HashMap<String, List<String>>()
    private val poolCache = HashMap<Category, List<String>>()

    fun words(language: Language, category: Category): List<String> {
        val key = assetKey(language, category)
        return cache.getOrPut(key) { read(key) }
    }

    /**
     * The combined vocabulary for one category across all eleven languages.
     *
     * Built by walking the languages in the shared order and keeping first
     * occurrences rather than by sorting, so every implementation builds the same
     * list without depending on how a platform collates strings.
     *
     * This is what makes [Language.MIX] honest. Choosing a language and then a word
     * made "ninja" about nine times likelier than a word unique to one language,
     * because it sits in 9 of the 11 noun lists, costing up to 3.06 bits per word.
     * Drawing from the pool makes every word equally likely and deletes nothing.
     */
    fun pool(category: Category): List<String> = poolCache.getOrPut(category) {
        sanitiseDistinct(Language.real.flatMap { words(it, category) })
    }

    /**
     * Drops entries that would DISPLAY identically to an earlier one.
     *
     * "male" and "måle" are both in no_verbs and both render as "male"; across the
     * pooled vocabulary 116 pairs collide this way (dragon/dragón, titan/titán,
     * angel/ángel). Two consequences, both bad: [UsernameEngine.drawDistinct]
     * compared RAW words, so "dragon-dragon" was reachable and the no-repeat
     * guarantee was false; and a displayed word backed by two entries was twice as
     * likely as one backed by one, so every min-entropy figure was optimistic.
     *
     * Removing the duplicate at the source fixes both and keeps raw and displayed
     * forms one-to-one, which is what makes the entropy model exact rather than an
     * upper bound. First occurrence wins, so the result is deterministic.
     */
    private fun sanitiseDistinct(words: List<String>): List<String> {
        val seen = LinkedHashMap<String, String>()
        for (word in words) seen.putIfAbsent(UsernameEngine.sanitise(word), word)
        return seen.values.toList()
    }

    private fun read(key: String): List<String> =
        runCatching {
            assets.open("data/$key.txt").bufferedReader().useLines { lines ->
                sanitiseDistinct(lines.map(String::trim).filter(String::isNotEmpty).toList())
            }
        }.getOrDefault(emptyList()).ifEmpty { listOf(FALLBACK) }

    companion object {
        /** Only ever surfaces if an asset is missing, which would be a packaging bug. */
        const val FALLBACK = "stormberry"

        /**
         * The asset name for a word list, and the guard against asking for one that
         * cannot exist.
         *
         * A drawing mode reaching here means a caller skipped
         * [UsernameEngine.resolveSlotLanguages]. Failing loudly beats reading
         * "data/mix_nouns.txt", missing it, and quietly serving [FALLBACK] for every
         * slot, which looks like a working app generating "stormberry" forever.
         *
         * Split out of [words] purely so it is testable: AssetManager is final with a
         * package-private constructor, so a JVM unit test cannot construct a
         * Dictionaries at all, and a guard that no test can reach is a guard that
         * silently stops working.
         */
        internal fun assetKey(language: Language, category: Category): String {
            require(language.isReal) { "$language is a drawing mode, not a language" }
            return "${language.code}_${category.suffix}"
        }
    }
}
