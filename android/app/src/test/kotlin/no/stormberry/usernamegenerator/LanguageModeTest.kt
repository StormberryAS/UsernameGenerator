package no.stormberry.usernamegenerator

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The two random-language modes, pinned at the seam where they differ.
 *
 * RANDOM and MIX differ in exactly one way: how many times the language is drawn.
 * That is one line of code and is invisible in any single generated username, so
 * it is asserted directly with a counting picker rather than inferred from output.
 */
class LanguageModeTest {

    /** Hands back 0, 1, 2, ... so every draw is identifiable in the result. */
    private class CountingPicker : () -> Int {
        var calls = 0
            private set

        override fun invoke(): Int = (calls++) % Language.real.size
    }

    private fun plan(n: Int) = List(n) { Category.NOUN }

    @Test
    fun `random draws the language once and uses it for every word`() {
        val picker = CountingPicker()
        val languages = UsernameEngine.resolveSlotLanguages(plan(5), Language.RANDOM, picker)
        assertEquals("the language must be drawn exactly once", 1, picker.calls)
        assertEquals(5, languages.size)
        assertEquals(
            "every word must share the one drawn language",
            1,
            languages.distinct().size,
        )
        assertEquals(Language.real[0], languages.first())
    }

    @Test
    fun `mix draws no language at all, because it draws from the pool`() {
        val picker = CountingPicker()
        // Pooling replaced "pick a language, then a word". Mix now picks a word from
        // the combined vocabulary, so it consumes no language draw whatsoever; the
        // resolver treats it like any other non-random mode.
        val languages = UsernameEngine.resolveSlotLanguages(plan(5), Language.MIX, picker)
        assertEquals("mix must not consume a language draw", 0, picker.calls)
        assertEquals(5, languages.size)
    }

    /**
     * No word may appear twice in one username, which is what stops
     * "ninja1-ninja2-samurai3". Asserted over every draw of a deliberately tiny
     * source, where a repeat would otherwise be near-certain.
     */
    @Test
    fun `a name never repeats a word`() {
        val source = listOf("alpha", "beta", "gamma")
        // Scripted so the first triple contains a repeat and the second does not.
        // Asserting the result is the SECOND triple proves the whole tuple was
        // discarded and redrawn, rather than just the clashing slot: a per-slot
        // redraw would have kept "beta" from the first attempt and returned
        // alpha/beta/gamma out of a different sequence.
        val script = listOf("alpha", "alpha", "beta", "alpha", "beta", "gamma")
        var i = 0
        val words = UsernameEngine.drawDistinct(List(3) { source }) { script[i++] }
        assertEquals(listOf("alpha", "beta", "gamma"), words)
        assertEquals("the whole first tuple must be discarded", 6, i)
    }

    @Test
    fun `a fixed language draws nothing at all`() {
        val picker = CountingPicker()
        val languages = UsernameEngine.resolveSlotLanguages(plan(3), Language.NO, picker)
        assertEquals("a chosen language must not consume a draw", 0, picker.calls)
        assertEquals(listOf(Language.NO, Language.NO, Language.NO), languages)
    }

    /**
     * The index a picker returns must mean the same language in all three
     * implementations, so this pins the order rather than trusting it.
     */
    @Test
    fun `the real languages are the eleven, in the shared order`() {
        assertEquals(
            listOf("en", "no", "pt", "es", "de", "fr", "it", "nl", "pl", "ro", "la"),
            Language.real.map { it.code },
        )
        assertEquals("RANDOM and MIX must not count as languages", 11, Language.real.size)
        assertEquals(13, Language.entries.size)
        assertFalse(Language.RANDOM.isReal)
        assertFalse(Language.MIX.isReal)
        assertTrue(Language.entries.filter { it.isReal }.all { it.code.length == 2 })
    }

    /**
     * Reading a word list for a drawing mode means a caller skipped the resolver.
     * Failing loudly beats reading "data/mix_nouns.txt", missing it, and quietly
     * serving the fallback word for every slot, which looks like a working app.
     */
    @Test
    fun `a drawing mode cannot be used as a dictionary key`() {
        for (mode in listOf(Language.RANDOM, Language.MIX)) {
            val error = assertThrows(IllegalArgumentException::class.java) {
                Dictionaries.assetKey(mode, Category.NOUN)
            }
            assertTrue(
                "the message should name the mode, was: ${error.message}",
                error.message.orEmpty().contains(mode.name),
            )
        }
        // And the eleven real ones still resolve to the files that exist.
        assertEquals("en_nouns", Dictionaries.assetKey(Language.EN, Category.NOUN))
        assertEquals("la_verbs", Dictionaries.assetKey(Language.LA, Category.VERB))
    }
}
