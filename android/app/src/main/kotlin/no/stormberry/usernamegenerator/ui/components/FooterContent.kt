package no.stormberry.usernamegenerator.ui.components

/**
 * Where each footer link goes, in one place with no Android in it, so a plain JUnit test can
 * pin every target (FooterLinksTest).
 *
 * The icon row and the Stormberry links are CheckLink's, address for address, copied from the
 * footer of CheckLink/index.html (and MoonApp's FooterLinks). Privacy is not here: it opens
 * the policy inside the app, because the app has no INTERNET permission and Play wants the
 * policy reachable from within it.
 */
object FooterLinks {
    const val SITE = "https://stormberry.as"
    const val LINKEDIN = "https://linkedin.com/company/StormberryAS"
    const val GITHUB = "https://github.com/StormberryAS"
    const val NOSTR = "nostr:npub1zz9w77p2jkn95t0st9tcuea8zdn2vknf0ctrwyd4g46w3kswdccqesr0pa"
    const val ONION = "http://stormberryr7fz5xdopi7f265d7id27bgizc6uxeliaepzstompcfpyd.onion"
    const val ORG_NR = "https://virksomhet.brreg.no/nb/oppslag/enheter/937751249"
    const val DISCLAIMER = "https://username.stormberry.as/disclaimer.html"

    // Credits: only the third-party project the generator's function is built on, which is the
    // source of the word lists. The fonts, icons and platform libraries are credited in NOTICE and
    // the README, not here. The licence texts that need reproducing sit in NOTICE.
    const val DEEP_TRANSLATOR = "https://github.com/nidhaloff/deep-translator"

    // Deep-Translator ships the Apache License 2.0: its LICENSE file on the default branch (master),
    // the LICENSE inside the deep_translator 1.11.4 wheel the word lists were built with and the
    // GitHub licence field all say so. Only its PyPI metadata says MIT, which is wrong. The label
    // in the credit sentence names the licence this link opens.
    const val DEEP_TRANSLATOR_LICENCE =
        "https://github.com/nidhaloff/deep-translator/blob/master/LICENSE"

    /** Every link the footer can open, for the test. */
    val ALL = listOf(
        SITE, LINKEDIN, GITHUB, NOSTR, ONION, ORG_NR, DISCLAIMER,
        DEEP_TRANSLATOR, DEEP_TRANSLATOR_LICENCE,
    )
}

/** The date of the bundled word lists, as CheckLink dates its rules and its domain list. */
const val WORD_LISTS_DATE = "2026-08-22"

/**
 * The tagline of the username.stormberry.as hero, word for word: the first `<p>` inside the
 * `<header>` of index.html. Marcos, 2026-10-23: keep the short tagline, consistent with the
 * web; where the app and the page differ, the page wins. HeroTaglineTest reads index.html and
 * fails if the two drift apart. (1.1.3 said "Memorable identities, generated on your device";
 * it is not used any more.)
 */
const val HERO_TAGLINE = "Secure, inspiring, and dynamic usernames."

/**
 * One piece of a footer sentence: plain text, a link out, or the one entry that opens something
 * inside the app. The sentences that carry links are lists of these, so the footer draws exactly
 * what FooterLinksTest reads, with no Android in between.
 */
sealed interface FooterPart {
    /** Text that is not a link. */
    data class Text(val text: String) : FooterPart

    /** A link that leaves the app through an ACTION_VIEW intent. */
    data class Link(val label: String, val url: String) : FooterPart

    /** An entry that runs code in the app instead of leaving it (Privacy). */
    data class InApp(val label: String) : FooterPart
}

/** The words a sentence made of [parts] shows, as a person reads them. */
fun plainText(parts: List<FooterPart>): String = parts.joinToString("") {
    when (it) {
        is FooterPart.Text -> it.text
        is FooterPart.Link -> it.label
        is FooterPart.InApp -> it.label
    }
}

/** The footer's sentences. */
object FooterText {
    /** CheckLink's, verbatim. */
    const val TAGLINE = "Smarter sales. Global culture. AI-driven strategy."

    /** CheckLink's, verbatim. */
    const val PRIVACY_FIRST = "Privacy First: We do not collect cookies or personal data."

    /** CheckLink's, verbatim. */
    const val AI = "Proudly powered by sovereign AI agents."

    /** CheckLink's, with no-break spaces so the number never breaks inside itself. */
    const val ORG_NR = "Org.nr. NO 937 751 249"

    /** The licence label in the credit sentence, with a no-break space so "Apache" and "2.0" never part. */
    const val APACHE_LABEL = "Apache 2.0"

    /**
     * Approved by Marcos, 2026-10-24. CheckLink's line is "Your links and pictures never leave this device.
     * Disconnect and try it." This is the same sentence for what this app keeps: the usernames
     * it makes and the settings a person chooses. True as built: settings live in private
     * preferences with backup off, and generated names are held in memory for the session only.
     * The test is real: the APK has no INTERNET permission, so it works the same with the radio off.
     */
    const val OFFLINE = "Your usernames and settings never leave this device. Disconnect and try it."

    /**
     * DRAFT for Marcos, and the credit: what runs on the device, and the one third-party project
     * the generator's function is built on (the word lists), as a link to its source and its
     * licence. Marcos, 2026-10-24: credit the projects the app is built on, as the other apps
     * credit suncalc; the icons, the language and the platform libraries go in NOTICE and the
     * README only. The footer draws this list and FooterLinksTest reads it, so the sentence people
     * see is the sentence that is tested. The licence label uses no-break spaces so it stays on
     * one line.
     */
    val CREDITS: List<FooterPart> = listOf(
        FooterPart.Text("Runs entirely on your device: our own code and word lists built with "),
        FooterPart.Link("Deep-Translator", FooterLinks.DEEP_TRANSLATOR),
        FooterPart.Text(" ("),
        FooterPart.Link(APACHE_LABEL, FooterLinks.DEEP_TRANSLATOR_LICENCE),
        FooterPart.Text(") and reviewed by native speakers. Nothing is sent."),
    )

    /** CheckLink's company line, with this app's Privacy and Disclaimer entries. */
    val SMALL_PRINT: List<FooterPart> = listOf(
        FooterPart.Text("© 2026 Stormberry AS · "),
        FooterPart.Link(ORG_NR, FooterLinks.ORG_NR),
        FooterPart.Text(" · Askøy, Norway · "),
        FooterPart.InApp("Privacy"),
        FooterPart.Text(" · "),
        FooterPart.Link("Disclaimer", FooterLinks.DISCLAIMER),
    )

    /** The line the footer carried before 1.1.4, kept verbatim. The alarm apps' line does not apply. */
    const val PERMISSIONS = "No permissions. No network. No tracking."

    /**
     * DRAFT for Marcos. The word lists carry no date of their own, so this is the date
     * the word lists in `data/` and `data/entropy-model.tsv` were last committed (commit f346bfe). Move
     * [WORD_LISTS_DATE] when the lists are regenerated.
     */
    const val WORD_LISTS_DATED = "Word lists dated $WORD_LISTS_DATE"
}
