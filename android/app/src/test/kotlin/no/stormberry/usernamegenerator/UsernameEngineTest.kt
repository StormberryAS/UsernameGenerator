package no.stormberry.usernamegenerator

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Parity tests for the sanitiser.
 *
 * The same table is asserted against `username.py` and `script.js`, so if any one of
 * the three drifts, this fails. That matters because a username generated on the web
 * and the same username generated in the app must be spelled identically.
 */
class UsernameEngineTest {

    /**
     * Every pair here has been checked against the Python and JavaScript
     * implementations and all three agree.
     */
    private val cases = listOf(
        // NFD handles these: base letter plus a combining mark.
        "condução" to "conducao",
        "oppnå" to "oppna",
        "encanté" to "encante",
        "świetlisty" to "swietlisty",
        "măreț" to "maret",
        // NFD cannot help with these: single codepoints with no decomposition.
        // This is the case that was broken until the transliteration table landed.
        "drømme" to "dromme",
        "sokół" to "sokol",
        "ołów" to "olow",
        "großartig" to "grossartig",
        "ære" to "aere",
        "cœur" to "coeur",
        // Both mechanisms in one word.
        "fjærblå" to "fjaerbla",
        // Already plain, must pass through untouched.
        "blomstre" to "blomstre",
        "champion" to "champion",
    )

    @Test
    fun `sanitise reduces every known case to the agreed spelling`() {
        for ((input, expected) in cases) {
            assertEquals("sanitise(\"$input\")", expected, UsernameEngine.sanitise(input))
        }
    }

    @Test
    fun `sanitise output is always plain ascii`() {
        for ((input, _) in cases) {
            val out = UsernameEngine.sanitise(input)
            assertTrue(
                "sanitise(\"$input\") produced non-ASCII: \"$out\"",
                out.all { it.code < 128 },
            )
        }
    }

    @Test
    fun `sanitise preserves separators so joined usernames survive`() {
        assertEquals("dromme-sokol.olow_aere", UsernameEngine.sanitise("drømme-sokół.ołów_ære"))
    }

    @Test
    fun `sanitise is idempotent`() {
        for ((input, _) in cases) {
            val once = UsernameEngine.sanitise(input)
            assertEquals("second pass changed \"$once\"", once, UsernameEngine.sanitise(once))
        }
    }
}
