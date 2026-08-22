package no.stormberry.usernamegenerator

import kotlin.math.floor
import kotlin.math.log2
import kotlin.math.pow

/**
 * What the current options are worth, as finished display strings.
 *
 * [hmin] and [h2] are kept alongside the text because the golden corpus compares
 * them at full precision; the UI only ever shows the strings.
 */
data class StrengthReadout(
    val hmin: Double,
    val h2: Double,
    val bitsText: String,
    val combinations: String,
    val collisionAt: String,
)

/**
 * Entropy of the generator, ported from script.js and mirrored in username.py.
 *
 * Two figures, because they answer two different questions that people reliably
 * conflate, and one number cannot honestly serve both once a language is drawn at
 * random:
 *
 *  - [StrengthReadout.combinations] is how many names the options can produce, so
 *    "1 in N" is the chance one blind guess lands on yours. It uses MIN-ENTROPY,
 *    the worst case, because a security figure must never be optimistic.
 *  - [StrengthReadout.collisionAt] is how many names must exist before two match,
 *    at even odds. That is the birthday bound, and the birthday bound is governed
 *    by COLLISION ENTROPY (Renyi-2), not by min-entropy. Using a single number for
 *    both would be wrong for exactly the modes this feature adds.
 *
 * With one fixed language the distribution is uniform and the two coincide, so
 * nothing about the previous behaviour changes. Under [Language.RANDOM] and
 * [Language.MIX] they diverge sharply, and by different amounts: mixing buys about
 * +3.0 bits per word against collisions but only +0.27 for a noun against
 * guessing, because "ninja" is in nine of the eleven noun lists.
 *
 * For a FIXED language the language itself is still deliberately not counted. An
 * attacker not knowing which of the eleven was chosen must search all of them,
 * worth +3.33 bits once, but the CSPRNG did not choose it, the user did, and
 * predictably. Under RANDOM and MIX the CSPRNG does choose it, so there it is
 * counted, via [EntropyModel] measuring what it is genuinely worth rather than
 * assuming log2(11).
 */
object Strength {

    /** Bits per decimal digit, and its reciprocal. */
    private const val LOG2_10 = 3.321928094887362
    private const val LOG10_2 = 0.3010299956639812

    /**
     * log10(sqrt(2 * ln 2)). Everything is carried in log10 rather than as a
     * count, because five words with five digits each is 2^133 and overflows a
     * Double's integer range long before it troubles its exponent.
     */
    private const val LOG10_BIRTHDAY = 0.0709277283545598

    /**
     * Half-up rounding with a boundary tolerance.
     *
     * Every figure arrives through log and pow, which carry roughly 1e-15 of
     * relative error, and exact halfway cases are COMMON rather than exotic: any
     * dictionary size times a power of ten produces one, and 275 words with one
     * digit lands on exactly 2.75 thousand. Without this the JVM and V8 round it
     * in opposite directions and the two apps disagree in public, which is
     * precisely what the golden corpus caught.
     */
    private const val ROUND_EPS = 1e-9

    /** Short scale, British usage. Past this the readout switches to 10^n. */
    private val SCALE_NAMES = listOf(
        "", "thousand", "million", "billion", "trillion",
        "quadrillion", "quintillion",
    )

    /**
     * The figures the readout shows.
     *
     * [sizes] is consulted only for a fixed language, where the distribution is
     * uniform and the dictionary sizes are the whole story. The two random modes
     * read [model] instead, because their distribution is not uniform and cannot
     * be recovered from sizes alone. A null [model] falls back to the uniform
     * calculation rather than failing.
     */
    fun describe(
        model: EntropyModel?,
        plan: List<Category>,
        language: Language,
        wordType: WordType,
        sizes: List<Int>,
        addDigits: Boolean,
        digitCount: Int,
        separator: Separator,
    ): StrengthReadout {
        var hmin = 0.0
        var h2 = 0.0
        // The word part is looked up rather than computed, because no-repeat drawing
        // makes the space ordered tuples of DISTINCT words rather than a product of
        // sizes, and counting those needs inclusion-exclusion over the categories.
        val row = model?.lookup(language, wordType, plan.size)
        if (row != null) {
            hmin = row.hmin
            h2 = row.h2
        } else {
            // Fallback for a missing table. Ignores the no-repeat correction, which
            // is worth about 0.05 bits, and beats showing nothing. A size of 1
            // contributes log2(1) = 0; a size of 0 would be -Infinity, and a missing
            // dictionary should read as "buys nothing" rather than poison the total.
            for (size in sizes) if (size > 1) hmin += log2(size.toDouble())
            h2 = hmin
        }

        // Digits are uniform and independent, so they add the same to both.
        val digits = if (addDigits) plan.size * digitCount * LOG2_10 else 0.0
        hmin += digits
        h2 += digits

        // Separators: log2(4) once for RANDOM, log2(4) per gap for MIX, nothing for
        // a fixed choice or for a one-word name, which has no gap to put one in. The
        // 0.0002 bits lost to two word splits colliding under an empty separator is
        // below the displayed precision and is documented rather than modelled.
        val gapCount = maxOf(plan.size - 1, 0)
        val perDraw = log2(Separator.real.size.toDouble())
        val separatorBits = when {
            separator == Separator.MIX -> gapCount * perDraw
            separator == Separator.RANDOM && gapCount > 0 -> perDraw
            else -> 0.0
        }
        hmin += separatorBits
        h2 += separatorBits

        return StrengthReadout(
            hmin = hmin,
            h2 = h2,
            bitsText = round1(hmin),
            combinations = humanFromLog10(hmin * LOG10_2),
            collisionAt = humanFromLog10(LOG10_BIRTHDAY + h2 * 0.5 * LOG10_2),
        )
    }

    /** The production entry point: the plan is the one generation uses. */
    fun describe(
        model: EntropyModel?,
        dictionaries: Dictionaries,
        wordCount: Int,
        type: WordType,
        language: Language,
        addDigits: Boolean,
        digitCount: Int,
        separator: Separator,
    ): StrengthReadout {
        val plan = UsernameEngine.categoryPlan(wordCount, type)
        // Sizes are only meaningful for a fixed language. Reading all eleven
        // languages' lists to count them under MIX would be work whose result is
        // then discarded.
        val sizes = if (language.isReal) plan.map { dictionaries.words(language, it).size } else emptyList()
        return describe(model, plan, language, type, sizes, addDigits, digitCount, separator)
    }

    /**
     * The strongest settings available, COMPUTED rather than assumed.
     *
     * Which word type wins is neither obvious nor stable: it depends on how much
     * the dictionaries overlap between languages, which changes whenever a word
     * list is edited. Verbs currently win because they are the least shared;
     * nouns lose because "ninja", "samurai" and "titan" are in six to nine of the
     * eleven lists, which costs exactly the unpredictability the mode is meant to
     * buy. Hardcoding today's winner would quietly become a lie.
     */
    fun maxEntropyOptions(model: EntropyModel?): MaxEntropyOptions {
        var best: Triple<Language, WordType, StrengthReadout>? = null
        for (language in Language.entries) {
            for (type in WordType.entries) {
                val plan = UsernameEngine.categoryPlan(Settings.MAX_WORDS, type)
                val readout = describe(
                    model, plan, language, type, emptyList(), true, Settings.MAX_DIGITS,
                    Separator.MIX)
                if (best == null || readout.hmin > best!!.third.hmin) {
                    best = Triple(language, type, readout)
                }
            }
        }
        val (language, type, readout) = best!!
        return MaxEntropyOptions(
            language = language,
            wordType = type,
            wordCount = Settings.MAX_WORDS,
            addDigits = true,
            digitCount = Settings.MAX_DIGITS,
            separator = Separator.MIX,
            strength = readout,
        )
    }

    private fun roundHalfUp(value: Double): Long = floor(value + 0.5 + ROUND_EPS).toLong()

    /** Renders tenths as a decimal, so 28 becomes "2.8", without touching format. */
    private fun tenthsText(tenths: Long): String = "${tenths / 10}.${tenths % 10}"

    /**
     * One decimal place, assembled by hand rather than handed to String.format.
     *
     * `%.1f` would emit "6,1" under a Norwegian locale, and JS toFixed, Java
     * HALF_UP and Python's round-half-even disagree on exact halfway cases.
     * Integer arithmetic is the only formulation identical in all three, and is
     * the same reason SunApp's solar code uses floor(x + 0.5) rather than round().
     */
    private fun round1(value: Double): String = tenthsText(roundHalfUp(value * 10))

    /**
     * Renders a magnitude supplied as log10, so nothing need fit in a Long.
     *
     * Every branch decides on a value that has ALREADY been rounded, never on a
     * raw threshold. Deciding on a raw threshold is what makes two implementations
     * disagree: at a count of exactly one million one side lands on 999.9999
     * thousand and the other on 1.0 million, and they print different words for
     * the same number. Rounding first and normalising afterwards makes the
     * boundary a consequence rather than a race.
     */
    private fun humanFromLog10(log10v: Double): String {
        if (log10v < 3.5) {
            val n = roundHalfUp(10.0.pow(log10v))
            if (n < 1000) return n.toString()
        }

        var scaleIdx = floor(log10v / 3).toInt()
        var value = 10.0.pow(log10v - 3 * scaleIdx)
        // 999.96 is a thousand of the next scale up, not "1000 thousand".
        if (roundHalfUp(value) >= 1000) { value /= 1000; scaleIdx += 1 }

        if (scaleIdx < SCALE_NAMES.size) {
            val tenths = roundHalfUp(value * 10)
            // Below ten a decimal is informative; at or above it, noise. Tested on
            // the rounded tenths, so nothing can straddle the cutoff.
            val text = if (tenths < 100) tenthsText(tenths) else roundHalfUp(value).toString()
            val name = SCALE_NAMES[scaleIdx]
            return if (name.isEmpty()) text else "$text $name"
        }

        // Past the names. Same normalise-after-rounding rule, so 9.96e23 becomes
        // 1.0 x 10^24 rather than the implementations splitting on the exponent.
        var exp = floor(log10v).toLong()
        var mantissa = 10.0.pow(log10v - exp)
        if (roundHalfUp(mantissa * 10) >= 100) { exp += 1; mantissa /= 10 }
        return round1(mantissa) + " × 10^" + exp
    }
}

/** The settings the "Max entropy" control applies, and what they are worth. */
data class MaxEntropyOptions(
    val language: Language,
    val wordType: WordType,
    val wordCount: Int,
    val addDigits: Boolean,
    val digitCount: Int,
    val separator: Separator,
    val strength: StrengthReadout,
)
