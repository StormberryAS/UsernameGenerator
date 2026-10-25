package no.stormberry.usernamegenerator.ui

import java.io.File
import no.stormberry.usernamegenerator.ui.components.FooterLinks
import no.stormberry.usernamegenerator.ui.components.FooterPart
import no.stormberry.usernamegenerator.ui.components.FooterText
import no.stormberry.usernamegenerator.ui.components.HERO_TAGLINE
import no.stormberry.usernamegenerator.ui.components.WORD_LISTS_DATE
import no.stormberry.usernamegenerator.ui.components.plainText
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The footer's links and sentences, pinned. A footer is the part of an app nobody tests by hand
 * twice, and a wrong address in it is a wrong address in front of every user.
 */
class FooterLinksTest {

    @Test fun theIconRowIsCheckLinksAddressForAddress() {
        assertEquals("https://stormberry.as", FooterLinks.SITE)
        assertEquals("https://linkedin.com/company/StormberryAS", FooterLinks.LINKEDIN)
        assertEquals("https://github.com/StormberryAS", FooterLinks.GITHUB)
        assertEquals(
            "nostr:npub1zz9w77p2jkn95t0st9tcuea8zdn2vknf0ctrwyd4g46w3kswdccqesr0pa",
            FooterLinks.NOSTR,
        )
        assertEquals(
            "http://stormberryr7fz5xdopi7f265d7id27bgizc6uxeliaepzstompcfpyd.onion",
            FooterLinks.ONION,
        )
        assertEquals(
            "https://virksomhet.brreg.no/nb/oppslag/enheter/937751249",
            FooterLinks.ORG_NR,
        )
    }

    @Test fun theDisclaimerIsThisAppsPageOnTheWeb() {
        assertEquals("https://username.stormberry.as/disclaimer.html", FooterLinks.DISCLAIMER)
    }

    @Test fun everyLinkOpensInAnotherApp() {
        // The app has no INTERNET permission, so a link must leave through an intent, which
        // means a scheme another app can take: https, plain http for the onion, or nostr.
        val allowed = setOf("https", "http", "nostr")
        for (url in FooterLinks.ALL) {
            val scheme = url.substringBefore(':')
            assertTrue("$url has an unexpected scheme", scheme in allowed)
            assertFalse("$url must not contain a space", url.contains(' '))
        }
        // Plain http only for the onion address, which has no TLS certificate to speak of.
        val plainHttp = FooterLinks.ALL.filter { it.startsWith("http://") }
        assertEquals(listOf(FooterLinks.ONION), plainHttp)
        assertTrue(FooterLinks.ONION.endsWith(".onion"))
    }

    @Test fun theNostrAddressIsAnNpubOfTheRightLength() {
        val id = FooterLinks.NOSTR.removePrefix("nostr:")
        assertTrue(id.startsWith("npub1"))
        assertEquals(63, id.length)
    }

    @Test fun orgNumberReadsAsOneUnbreakableRun() {
        assertFalse(FooterText.ORG_NR.contains(' '))
        assertEquals("Org.nr. NO 937 751 249", FooterText.ORG_NR.replace(' ', ' '))
    }

    @Test fun wordListDateIsAnIsoDate() {
        assertTrue(Regex("""\d{4}-\d{2}-\d{2}""").matches(WORD_LISTS_DATE))
        assertEquals("Word lists dated $WORD_LISTS_DATE", FooterText.WORD_LISTS_DATED)
    }

    @Test fun copyHasNoEmDashAndNoDoubleHyphen() {
        // Every sentence the footer draws, the credit sentence and the company line included:
        // those two are read from the same lists the footer draws.
        val copy = listOf(
            HERO_TAGLINE, FooterText.TAGLINE, FooterText.OFFLINE, FooterText.PERMISSIONS,
            FooterText.PRIVACY_FIRST, FooterText.AI, FooterText.WORD_LISTS_DATED,
            plainText(FooterText.CREDITS), plainText(FooterText.SMALL_PRINT),
        )
        for (c in copy) {
            assertFalse(c, c.contains('—'))
            assertFalse(c, c.contains("--"))
        }
    }

    @Test fun theOfflineLineAndThePermissionsLineAreVerbatim() {
        assertEquals(
            "Your usernames and settings never leave this device. Disconnect and try it.",
            FooterText.OFFLINE,
        )
        assertEquals("No permissions. No network. No tracking.", FooterText.PERMISSIONS)
    }

    @Test fun theStormberryLinesAreCheckLinksVerbatim() {
        assertEquals("Smarter sales. Global culture. AI-driven strategy.", FooterText.TAGLINE)
        assertEquals(
            "Privacy First: We do not collect cookies or personal data.",
            FooterText.PRIVACY_FIRST,
        )
        assertEquals("Proudly powered by sovereign AI agents.", FooterText.AI)
    }

    @Test fun theFooterCreditsOnlyTheProjectTheGeneratorIsBuiltOnWithItsSourceAndLicence() {
        // Marcos, 2026-10-24: the footer credits the third-party project the generator's function is
        // built on, as the other apps credit suncalc, and nothing else. That is Deep-Translator, which
        // made the word lists and ships the Apache License 2.0 (not MIT, as its PyPI page says). The
        // Inter font, the Lucide and Material icons, Kotlin and Jetpack are credited in NOTICE and the
        // README only. The sentence is looked up as the footer draws it (FooterText.CREDITS).
        val links = FooterText.CREDITS.filterIsInstance<FooterPart.Link>()
        assertEquals(
            listOf(
                FooterPart.Link("Deep-Translator", FooterLinks.DEEP_TRANSLATOR),
                FooterPart.Link(FooterText.APACHE_LABEL, FooterLinks.DEEP_TRANSLATOR_LICENCE),
            ),
            links,
        )

        val sentence = plainText(FooterText.CREDITS)
        assertEquals(
            "Runs entirely on your device: our own code and word lists built with " +
                "Deep-Translator (Apache\u00A02.0) and reviewed by native speakers. Nothing is sent.",
            sentence,
        )
        assertFalse("Deep-Translator is not MIT", sentence.contains("MIT"))
        for (left in listOf("Inter", "OFL", "Lucide", "Jetpack", "Kotlin", "Material", "LinkedIn", "GitHub")) {
            assertFalse("the footer must not credit $left (NOTICE and the README do)", sentence.contains(left))
        }
    }

    @Test fun theLicenceLabelNeverBreaksOverTwoLines() {
        assertFalse(FooterText.APACHE_LABEL.contains(' '))
        assertEquals("Apache 2.0", FooterText.APACHE_LABEL.replace('\u00A0', ' '))
        for (part in FooterText.CREDITS.filterIsInstance<FooterPart.Link>()) {
            if (part.url == FooterLinks.DEEP_TRANSLATOR_LICENCE) assertFalse(part.label.contains(' '))
        }
    }

    @Test fun theCompanyLineLinksTheRegisterAndTheDisclaimerAndKeepsPrivacyInTheApp() {
        assertEquals(
            "© 2026 Stormberry AS · ${FooterText.ORG_NR} · Askøy, Norway · Privacy · Disclaimer",
            plainText(FooterText.SMALL_PRINT),
        )
        val parts = FooterText.SMALL_PRINT
        assertTrue(FooterPart.Link(FooterText.ORG_NR, FooterLinks.ORG_NR) in parts)
        assertTrue(FooterPart.Link("Disclaimer", FooterLinks.DISCLAIMER) in parts)
        assertEquals(listOf(FooterPart.InApp("Privacy")), parts.filterIsInstance<FooterPart.InApp>())
    }

    @Test fun everyLinkTheFooterDrawsIsInTheListThatIsTested() {
        // The credit sentence, the company line, the wordmark and the icon row between them use
        // exactly FooterLinks.ALL: nothing is drawn that the scheme test above never saw.
        val drawn = (FooterText.CREDITS + FooterText.SMALL_PRINT)
            .filterIsInstance<FooterPart.Link>().map { it.url }.toSet() +
            setOf(
                FooterLinks.SITE, FooterLinks.LINKEDIN, FooterLinks.GITHUB, FooterLinks.NOSTR,
                FooterLinks.ONION,
            )
        assertEquals(FooterLinks.ALL.toSet(), drawn)
    }

    @Test fun theFooterNeverAsksForTheInternetPermission() {
        // Links open in another app and need nothing. Guard the line that would break the
        // claim: the manifest must keep removing INTERNET from whatever the dependencies merge in,
        // and must not request it itself.
        val manifest = generateSequence(File("").absoluteFile) { it.parentFile }
            .flatMap {
                sequenceOf(
                    File(it, "src/main/AndroidManifest.xml"),
                    File(it, "app/src/main/AndroidManifest.xml"),
                )
            }
            .firstOrNull { it.exists() }
        assertTrue("AndroidManifest.xml not found above the working directory", manifest != null)
        val text = manifest!!.readText()
        val internet = Regex("""<uses-permission\s+[^>]*android\.permission\.INTERNET[^>]*/>""")
            .findAll(text).toList()
        assertEquals("exactly one INTERNET line", 1, internet.size)
        assertTrue(
            "the INTERNET line must carry tools:node=\"remove\"",
            internet[0].value.contains("""tools:node="remove""""),
        )
    }
}
