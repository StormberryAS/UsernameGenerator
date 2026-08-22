package no.stormberry.usernamegenerator

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.SecureRandom

/**
 * The per-word digit options, added 2026-08-22 and generalised the same day from a
 * single on/off toggle into three: on or off, before or after the word, and one to
 * five digits per word.
 *
 * Three things are being protected here. That the options do what they say. That
 * turning them OFF leaves output byte for byte as it was before they existed, because
 * v1.0.1 is already published and a silent change to generated shapes would be the
 * worst possible regression. And that the seam's defaults stay exactly what the shared
 * contract says, because the web app and the CLI carry the same defaults and all three
 * must produce identical output from identical draws.
 *
 * The worked examples pinned below are the contract's own, quoted verbatim from it, so
 * a disagreement between the three implementations fails here rather than in a user's
 * hands.
 */
class DigitOptionTest {

    /**
     * Deterministic stand-in for the SecureRandom draw, so assertions can be exact.
     * Cycles, which lets a single value stand in for "every digit is a 7" without
     * spelling the run out.
     */
    private fun counter(vararg values: Int): () -> Int {
        var i = 0
        return { values[i++ % values.size] }
    }

    /** The contract's own example words. */
    private val brightRiver = listOf("bright", "river")

    private val words = listOf("bright", "river", "calm")

    @Test
    fun `with digits off the output is exactly the old behaviour`() {
        for (sep in Separator.entries) {
            assertEquals(
                "Separator ${sep.label} changed shape with digits off",
                UsernameEngine.sanitise(words.joinToString(sep.value)),
                UsernameEngine.assemble(words, sep, addDigits = false) { 7 },
            )
        }
    }

    /**
     * Position and count are meaningless while digits are off, and the contract says
     * so explicitly. This pins that they are genuinely inert rather than merely
     * unlikely to matter: every combination of the two must still return the old path
     * byte for byte, and the digit source must never be reached at all.
     */
    @Test
    fun `digit count and position are ignored while digits are off`() {
        for (position in DigitPosition.entries) {
            for (n in 1..5) {
                val out = UsernameEngine.assemble(brightRiver, Separator.HYPHEN, false, position, n) {
                    throw AssertionError("The digit source must not be drawn from with digits off")
                }
                assertEquals("$position with $n digit(s) changed the off path", "bright-river", out)
            }
        }
    }

    /**
     * The contract's worked examples, one assertion each and in its order. Digit draws
     * are 4 then 7 for the single-digit cases, and 4,8,2 then 3,1,5 for the three-digit
     * ones, which is what fixes the expected strings.
     */
    @Test
    fun `the worked examples from the shared contract`() {
        assertEquals(
            "bright-river",
            UsernameEngine.assemble(brightRiver, Separator.HYPHEN, addDigits = false) { 4 },
        )
        assertEquals(
            "bright4-river7",
            UsernameEngine.assemble(
                brightRiver, Separator.HYPHEN, true, DigitPosition.AFTER, 1, counter(4, 7),
            ),
        )
        assertEquals(
            "4bright-7river",
            UsernameEngine.assemble(
                brightRiver, Separator.HYPHEN, true, DigitPosition.BEFORE, 1, counter(4, 7),
            ),
        )
        assertEquals(
            "bright4river7",
            UsernameEngine.assemble(
                brightRiver, Separator.NONE, true, DigitPosition.AFTER, 1, counter(4, 7),
            ),
        )
        assertEquals(
            "4bright7river",
            UsernameEngine.assemble(
                brightRiver, Separator.NONE, true, DigitPosition.BEFORE, 1, counter(4, 7),
            ),
        )
        assertEquals(
            "bright482-river315",
            UsernameEngine.assemble(
                brightRiver, Separator.HYPHEN, true, DigitPosition.AFTER, 3, counter(4, 8, 2, 3, 1, 5),
            ),
        )
        assertEquals(
            "482bright-315river",
            UsernameEngine.assemble(
                brightRiver, Separator.HYPHEN, true, DigitPosition.BEFORE, 3, counter(4, 8, 2, 3, 1, 5),
            ),
        )
    }

    /**
     * The defaults are part of the contract, not an implementation detail: the web app
     * and the CLI carry the same three, and a caller that passes none of them must get
     * digits on, one per word, after the word. Changing any of these here without
     * changing the other two implementations is exactly the drift this pins.
     */
    @Test
    fun `the seam defaults match the shared contract`() {
        assertEquals(
            "bright4-river4",
            UsernameEngine.assemble(brightRiver, Separator.HYPHEN) { 4 },
        )
    }

    @Test
    fun `digits work with every separator`() {
        val expected = mapOf(
            Separator.NONE to "bright1river2calm3",
            Separator.HYPHEN to "bright1-river2-calm3",
            Separator.UNDERSCORE to "bright1_river2_calm3",
            Separator.DOT to "bright1.river2.calm3",
        )
        for ((sep, want) in expected) {
            assertEquals(
                want,
                UsernameEngine.assemble(words, sep, true, DigitPosition.AFTER, 1, counter(1, 2, 3)),
            )
        }
    }

    /**
     * The stated second benefit of the option: with no separator the digits mark the
     * word boundaries, so the result stays readable where it otherwise would not. True
     * of either position, since a boundary is a boundary from both sides.
     */
    @Test
    fun `digits restore readability when there is no separator`() {
        assertEquals(
            "brightrivercalm",
            UsernameEngine.assemble(words, Separator.NONE, addDigits = false) { 0 },
        )
        assertEquals(
            "bright4river5calm6",
            UsernameEngine.assemble(words, Separator.NONE, true, DigitPosition.AFTER, 1, counter(4, 5, 6)),
        )
        assertEquals(
            "4bright5river6calm",
            UsernameEngine.assemble(words, Separator.NONE, true, DigitPosition.BEFORE, 1, counter(4, 5, 6)),
        )
    }

    /**
     * Position must be a placement decision and nothing else. A single fixed draw makes
     * the two runs comparable character for character, so this asserts both the exact
     * shape and, by construction, that the count did not move with them.
     */
    @Test
    fun `position moves the digits without changing how many there are`() {
        for (n in 1..5) {
            val run = "7".repeat(n)
            val after = UsernameEngine.assemble(
                brightRiver, Separator.HYPHEN, true, DigitPosition.AFTER, n, counter(7),
            )
            val before = UsernameEngine.assemble(
                brightRiver, Separator.HYPHEN, true, DigitPosition.BEFORE, n, counter(7),
            )
            assertEquals("Wrong AFTER shape for $n digit(s)", "bright$run-river$run", after)
            assertEquals("Wrong BEFORE shape for $n digit(s)", "${run}bright-${run}river", before)
            assertEquals(
                "Position changed the digit count at $n",
                after.count { it.isDigit() },
                before.count { it.isDigit() },
            )
        }
    }

    /**
     * Count times word count, across the whole grid rather than one row of it, because
     * the per-word draw makes the two dimensions independent and a bug in either one
     * would hide in a single row. The separator count is asserted alongside so that a
     * digit can never be mistaken for a joiner or the other way round.
     */
    @Test
    fun `every digit count from one to five gives exactly count times word count digits`() {
        for (wordCount in 1..5) {
            for (n in 1..5) {
                val parts = List(wordCount) { "word" }
                for (position in DigitPosition.entries) {
                    val out = UsernameEngine.assemble(
                        parts, Separator.HYPHEN, true, position, n, counter(8),
                    )
                    assertEquals(
                        "Wrong digit count for $wordCount word(s) at $n each, $position: $out",
                        wordCount * n,
                        out.count { it.isDigit() },
                    )
                    assertEquals(
                        "Wrong separator count for $wordCount word(s): $out",
                        wordCount - 1,
                        out.count { it == '-' },
                    )
                }
            }
        }
    }

    /**
     * Each word draws its own run. A shared run would satisfy every count assertion
     * above while adding the entropy once for the whole username instead of once per
     * word, which is most of the point, so it gets its own test: draws go in word
     * order, so bright takes 1 and 2 and river takes 3 and 4. The bug would read
     * "bright12-river12".
     */
    @Test
    fun `each word draws its own run rather than sharing one`() {
        assertEquals(
            "bright12-river34",
            UsernameEngine.assemble(
                brightRiver, Separator.HYPHEN, true, DigitPosition.AFTER, 2, counter(1, 2, 3, 4),
            ),
        )
    }

    /**
     * Digits are applied after sanitising, so normalisation cannot reach them. Asserted
     * from both sides, because a leading digit sits where NFD would otherwise be
     * examining a base character.
     */
    @Test
    fun `digits are applied after sanitising so accents cannot corrupt them`() {
        val accented = listOf("condução", "drømmer", "sokół")
        assertEquals(
            "conducao1-drommer2-sokol3",
            UsernameEngine.assemble(
                accented, Separator.HYPHEN, true, DigitPosition.AFTER, 1, counter(1, 2, 3),
            ),
        )
        assertEquals(
            "1conducao-2drommer-3sokol",
            UsernameEngine.assemble(
                accented, Separator.HYPHEN, true, DigitPosition.BEFORE, 1, counter(1, 2, 3),
            ),
        )
    }

    /**
     * The README, the Zapstore listing and the F-Droid description all claim the result
     * is "accepted everywhere", which is an ASCII claim. It has to hold for every shape
     * the options can produce, not just the default one.
     */
    @Test
    fun `output stays ASCII with digits on`() {
        val accented = listOf("condução", "sokół", "größer")
        for (position in DigitPosition.entries) {
            for (n in 1..5) {
                val out = UsernameEngine.assemble(
                    accented, Separator.HYPHEN, true, position, n, counter(0, 9, 5),
                )
                assertTrue("Output must be ASCII, got '$out'", out.all { it.code <= 127 })
            }
        }
    }

    /**
     * The README, the Zapstore listing and the F-Droid description all claim the
     * randomness is not a predictable PRNG. That is a published security claim, so it
     * is pinned by a test rather than left to a comment someone may later "simplify".
     */
    @Test
    fun `the production randomness source is a CSPRNG`() {
        val field = UsernameEngine::class.java.getDeclaredField("random").apply { isAccessible = true }
        val source = field.get(UsernameEngine)
        assertTrue(
            "Production randomness must be SecureRandom, found ${source?.javaClass?.name}",
            source is SecureRandom,
        )
    }

    @Test
    fun `digits drawn from the real source stay within zero to nine`() {
        val source = SecureRandom()
        // 200 words at five digits each: 1,000 draws, enough that a source escaping the
        // range would have to be very unlucky to hide, and still instant.
        val out = UsernameEngine.assemble(
            List(200) { "w" }, Separator.HYPHEN, true, DigitPosition.AFTER, 5,
        ) { source.nextInt(10) }
        val digits = out.filter { it.isDigit() }
        assertEquals(1000, digits.length)
        assertTrue("A digit outside 0-9 appeared: $digits", digits.all { it in '0'..'9' })
    }
}
