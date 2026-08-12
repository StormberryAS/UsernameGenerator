package no.stormberry.usernamegenerator

import android.content.res.AssetManager
import java.security.SecureRandom
import java.text.Normalizer

/**
 * The generation engine, ported from the web app's script.js and the username.py CLI
 * so all three produce the same shapes from the same word lists.
 *
 * One deliberate difference from the web version: randomness comes from [SecureRandom]
 * rather than Math.random(). People generate usernames to separate identities, and a
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

    fun generate(
        dictionaries: Dictionaries,
        wordCount: Int,
        type: WordType,
        language: Language,
        separator: Separator,
    ): String {
        val parts = when (type) {
            WordType.MIXED -> mixedParts(dictionaries, wordCount, language)
            WordType.ADJECTIVE, WordType.NOUN, WordType.VERB -> {
                val words = dictionaries.words(language, type.category!!)
                List(wordCount) { words.random() }
            }
        }
        return sanitise(parts.joinToString(separator.value))
    }

    /**
     * Mixed follows the web app exactly: one word is a noun, two are adjective plus
     * noun, and three or more open with a verb, then an adjective, then nouns.
     */
    private fun mixedParts(dictionaries: Dictionaries, wordCount: Int, language: Language): List<String> =
        when {
            wordCount <= 1 -> listOf(dictionaries.words(language, Category.NOUN).random())
            wordCount == 2 -> listOf(
                dictionaries.words(language, Category.ADJECTIVE).random(),
                dictionaries.words(language, Category.NOUN).random(),
            )
            else -> {
                val verbs = dictionaries.words(language, Category.VERB)
                val adjectives = dictionaries.words(language, Category.ADJECTIVE)
                val nouns = dictionaries.words(language, Category.NOUN)
                List(wordCount) { index ->
                    when (index) {
                        0 -> verbs.random()
                        1 -> adjectives.random()
                        else -> nouns.random()
                    }
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

enum class Category(val suffix: String) {
    ADJECTIVE("adjectives"),
    NOUN("nouns"),
    VERB("verbs"),
}

enum class WordType(val label: String, val category: Category?) {
    MIXED("Mixed", null),
    ADJECTIVE("Adjectives", Category.ADJECTIVE),
    NOUN("Nouns", Category.NOUN),
    VERB("Verbs", Category.VERB),
}

enum class Separator(val label: String, val value: String) {
    NONE("none", ""),
    HYPHEN("-", "-"),
    UNDERSCORE("_", "_"),
    DOT(".", "."),
}

/** The eleven bundled languages. [code] matches the `data/<code>_<category>.txt` files. */
enum class Language(val code: String, val label: String) {
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
}

/**
 * Lazily reads the bundled word lists out of assets and keeps them in memory.
 * All 33 files together are about 30 kB, so caching every list that gets touched
 * costs nothing and removes any reason to hit the disk twice.
 */
class Dictionaries(private val assets: AssetManager) {

    private val cache = HashMap<String, List<String>>()

    fun words(language: Language, category: Category): List<String> {
        val key = "${language.code}_${category.suffix}"
        return cache.getOrPut(key) { read(key) }
    }

    private fun read(key: String): List<String> =
        runCatching {
            assets.open("data/$key.txt").bufferedReader().useLines { lines ->
                lines.map(String::trim).filter(String::isNotEmpty).toList()
            }
        }.getOrDefault(emptyList()).ifEmpty { listOf(FALLBACK) }

    companion object {
        /** Only ever surfaces if an asset is missing, which would be a packaging bug. */
        const val FALLBACK = "stormberry"
    }
}
