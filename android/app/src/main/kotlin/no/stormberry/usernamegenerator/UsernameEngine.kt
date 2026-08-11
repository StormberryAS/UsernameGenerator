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
     * Strips accents so the result is accepted everywhere: "conducao" not "condução".
     * Matches the web app's NFD normalise plus combining-mark removal.
     */
    private fun sanitise(value: String): String =
        combiningMarks.replace(Normalizer.normalize(value, Normalizer.Form.NFD), "")

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
