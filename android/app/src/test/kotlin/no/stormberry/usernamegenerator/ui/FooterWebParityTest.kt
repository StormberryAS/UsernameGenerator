package no.stormberry.usernamegenerator.ui

import java.io.File
import no.stormberry.usernamegenerator.ui.components.FooterText
import no.stormberry.usernamegenerator.ui.components.plainText
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The website footer and the app footer carry the same texts, word for word, except two lines that
 * say something different on a web page. Marcos, 2026-10-24: "keep web versions and APKs
 * consistent"; 2026-10-25 (option B): the permission line and the privacy line get a true web
 * version, because a web page has no permissions to list and cannot ask a visitor to disconnect.
 * The app wording is the approved one, so this reads the footer of index.html and fails the moment
 * either side is edited alone. Layout may differ; the texts may not. The tagline and the credit
 * sentence are compared as people read them, so the lead-in, the project names, the licence label
 * and the closing words all have to match. The two web lines are pinned to their approved wording,
 * and the app's two lines stay pinned in FooterLinksTest.
 */
class FooterWebParityTest {

    private fun indexHtml(): File? =
        generateSequence(File("").absoluteFile) { it.parentFile }
            .map { File(it, "index.html") }
            .firstOrNull { it.exists() }

    /** The words a reader sees in [html]: tags dropped, the few entities the footer uses decoded. */
    private fun visible(html: String): String = html
        .replace(Regex("""<[^>]+>"""), "")
        .replace("&nbsp;", "\u00a0")
        .replace("&copy;", "©")
        .replace("&middot;", "·")
        .replace("&amp;", "&")
        .replace(Regex("""[ \t\r\n]+"""), " ")
        .trim()

    private fun footer(): String {
        val html = indexHtml()
        assertTrue("index.html not found above the working directory", html != null)
        val match = Regex("""<footer class="site-footer">(.*?)</footer>""", RegexOption.DOT_MATCHES_ALL)
            .find(html!!.readText())
        assertTrue("no site footer in index.html", match != null)
        return match!!.groupValues[1]
    }

    /** The visible text of the first element with [cls], whatever its tag. */
    private fun byClass(cls: String): String {
        val match = Regex("""<(p|div)[^>]*class="$cls"[^>]*>(.*?)</\1>""", RegexOption.DOT_MATCHES_ALL)
            .find(footer())
        assertTrue("no .$cls in the footer of index.html", match != null)
        return visible(match!!.groupValues[2])
    }

    @Test fun theTaglineIsTheAppsWordForWord() {
        assertEquals(FooterText.TAGLINE, byClass("footer-tagline"))
    }

    @Test fun theCreditSentenceIsTheAppsWordForWord() {
        assertEquals(plainText(FooterText.CREDITS), byClass("footer-powered"))
    }

    @Test fun thePrivacyLineIsTheApprovedWebVersion() {
        // Approved by Marcos, 2026-10-25 (option B). The app keeps FooterText.OFFLINE.
        assertEquals("Your usernames and settings never leave this browser.", byClass("footer-offline"))
        assertNotEquals(FooterText.OFFLINE, byClass("footer-offline"))
    }

    @Test fun thePermissionLineIsTheApprovedWebVersion() {
        // Approved by Marcos, 2026-10-25 (option B). The app keeps FooterText.PERMISSIONS.
        assertEquals(
            "No cookies. No tracking. Every username is generated in your browser.",
            byClass("footer-permissions"),
        )
        assertNotEquals(FooterText.PERMISSIONS, byClass("footer-permissions"))
    }

    @Test fun thePrivacyFirstLineIsTheAppsWordForWord() {
        assertEquals(FooterText.PRIVACY_FIRST, byClass("footer-privacy"))
    }

    @Test fun theWordListDateLineIsTheAppsWordForWord() {
        assertEquals(FooterText.WORD_LISTS_DATED, byClass("footer-dated"))
    }

    @Test fun theSovereignAiLineIsTheAppsWordForWord() {
        assertEquals(FooterText.AI, byClass("footer-ai"))
    }

    @Test fun theCompanyLineIsTheAppsWordForWord() {
        // The page puts the company line in the one <p> that starts with the copyright sign.
        val line = Regex("""<p>(&copy;.*?)</p>""", RegexOption.DOT_MATCHES_ALL).find(footer())
        assertTrue("no company line in the footer of index.html", line != null)
        assertEquals(plainText(FooterText.SMALL_PRINT), visible(line!!.groupValues[1]))
    }
}
