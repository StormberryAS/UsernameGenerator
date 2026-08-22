package no.stormberry.usernamegenerator

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Integrity of the 33 dictionary files that all three implementations share.
 *
 * These files are the app. A truncated one silently shrinks the space a username is
 * drawn from, which weakens the unpredictability the README sells, and nothing else
 * in the build would notice. So they get asserted rather than assumed.
 *
 * Deliberately reads the source of truth at `data/` rather than the copy the Gradle
 * task puts in assets, for two reasons: the test then means something before a build
 * has run, and a mismatch between the two is a separate concern belonging to
 * `tools/check-dict-parity.py` in CI.
 */
class DictionaryTest {

    /** Named explicitly rather than globbed, so a language going missing FAILS the suite instead of quietly shrinking it. */
    private val languages = listOf("de", "en", "es", "fr", "it", "la", "nl", "no", "pl", "pt", "ro")
    private val kinds = listOf("adjectives", "nouns", "verbs")

    private val dataDir: File by lazy {
        // Walk up from the working directory rather than hardcoding a depth. Gradle
        // does not promise which directory unit tests run in, and it differs between
        // an IDE run and a command-line one, so a fixed "../data" breaks in one of
        // them. Anchoring on a known file makes it insensitive to both.
        var dir: File? = File(".").canonicalFile
        while (dir != null) {
            val candidate = File(dir, "data")
            if (File(candidate, "en_nouns.txt").isFile) return@lazy candidate
            dir = dir.parentFile
        }
        throw AssertionError(
            "Could not locate data/ containing en_nouns.txt by walking up from " +
                File(".").canonicalPath
        )
    }

    private fun entries(file: File): List<String> =
        file.readText(Charsets.UTF_8).trimEnd('\n').split("\n")

    private fun eachFile(block: (name: String, file: File, entries: List<String>) -> Unit) {
        for (lang in languages) for (kind in kinds) {
            val name = "${lang}_$kind.txt"
            val f = File(dataDir, name)
            assertTrue("Missing dictionary: $name", f.isFile)
            block(name, f, entries(f))
        }
    }

    @Test
    fun `all 33 dictionaries exist, 11 languages by 3 word types`() {
        assertEquals(33, languages.size * kinds.size)
        eachFile { _, _, _ -> }
        val stray = dataDir.listFiles { f -> f.extension == "txt" }.orEmpty()
            .map { it.name }
            .filterNot { name -> languages.any { l -> kinds.any { k -> name == "${l}_$k.txt" } } }
        assertTrue("Unexpected dictionary files present: $stray", stray.isEmpty())
    }

    @Test
    fun `every dictionary is well formed`() {
        val problems = mutableListOf<String>()
        eachFile { name, file, list ->
            if (file.readText().contains('\r')) problems += "$name: CRLF line endings"
            list.forEachIndexed { i, e ->
                if (e.isBlank()) problems += "$name:${i + 1}: blank entry"
                if (e != e.trim()) problems += "$name:${i + 1}: surrounding whitespace in '$e'"
                if (e.contains(' ')) problems += "$name:${i + 1}: space inside '$e'"
            }
            val dupes = list.groupBy { it }.filterValues { it.size > 1 }.keys
            if (dupes.isNotEmpty()) problems += "$name: duplicates $dupes"
        }
        assertTrue(problems.joinToString("\n"), problems.isEmpty())
    }

    @Test
    fun `no dictionary has been truncated`() {
        eachFile { name, _, list ->
            // A FLOOR, not an exact count, and that is deliberate.
            //
            // The files were expanded to 300 on 2026-08-22, but a native-language
            // review is allowed to delete an entry for one language without the others
            // having to change, and without anyone padding the gap with a worse word to
            // hit a round number. Quality beats symmetry: an unequal but clean set of
            // lists is better than equal ones carrying a mistranslation.
            //
            // The floor still catches the failure that matters, which is a file being
            // truncated or a regeneration half-completing.
            assertTrue(
                "$name has only ${list.size} entries, which is below the floor",
                list.size >= 250,
            )
        }
    }

    @Test
    fun `entropy stays above the level the documentation claims`() {
        // The README and store copy quote entropy figures computed at 300 words per
        // list. Small deletions are fine; a slide far enough to make those numbers
        // wrong is not, and would otherwise go unnoticed.
        eachFile { name, _, list ->
            val bits = kotlin.math.ln(list.size.toDouble()) / kotlin.math.ln(2.0)
            assertTrue(
                "$name gives only %.2f bits per word, documentation assumes about 8.2".format(bits),
                bits >= 7.9,
            )
        }
    }

    /**
     * The README, Zapstore listing and F-Droid description all say the result is
     * "accepted everywhere". That is only true if every entry survives sanitise as
     * non-empty ASCII, so it is checked against all 3,300 entries rather than the
     * handful the golden corpus samples.
     */
    @Test
    fun `every entry sanitises to non-empty ASCII`() {
        val bad = mutableListOf<String>()
        eachFile { name, _, list ->
            for (e in list) {
                val s = UsernameEngine.sanitise(e)
                if (s.isEmpty()) bad += "$name: '$e' sanitises to empty"
                else s.firstOrNull { it.code > 127 }?.let { ch ->
                    bad += "$name: '$e' -> '$s' keeps U+%04X".format(ch.code)
                }
            }
        }
        assertTrue(bad.joinToString("\n"), bad.isEmpty())
    }

    /**
     * No entry may contain a hyphen.
     *
     * 38 did until 2026-08-22, because multi-word concepts were joined that way:
     * `nascer-do-sol`, `wschod-slonca`, `via-lactea`. They were removed because they
     * broke the "none" separator, which still emitted hyphens, and made the hyphen
     * separator ambiguous about where one word ended and the next began.
     *
     * This asserts zero rather than pinning a count, because zero is now the intended
     * state and any reappearance is a regression rather than a change to note.
     */
    @Test
    fun `no entry contains a hyphen`() {
        val offenders = mutableListOf<String>()
        eachFile { name, _, list ->
            list.filter { '-' in it }.forEach { offenders += "$name: $it" }
        }
        assertTrue(
            "Hyphenated entries break the none separator:\n" + offenders.joinToString("\n"),
            offenders.isEmpty(),
        )
    }

}
