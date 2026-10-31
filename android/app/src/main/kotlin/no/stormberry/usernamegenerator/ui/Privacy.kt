package no.stormberry.usernamegenerator.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * The privacy policy, rendered in the app rather than linked from it.
 *
 * Google Play requires a policy at a public URL *and* reachable from inside the app. A
 * link cannot satisfy the second half here: this app declares no INTERNET permission on
 * purpose, so shipping a URL as the only route would mean the one screen that promises
 * the app never touches the network is also the one screen that needs it. The text is
 * therefore compiled in, and the hosted copy at username.stormberry.as/privacy.html is
 * the same words for the Console field and for anyone reading before they install.
 *
 * Strings live in Kotlin because every other string in this app does; a single-locale
 * app gains nothing from routing them through strings.xml, and keeping the policy in one
 * readable block is worth more than the indirection.
 */
private const val PRIVACY_INTRO =
    "UsernameGenerator collects nothing. No account, no analytics, no crash reporting, " +
        "no advertising, no cookies and no identifier of any kind. There is nothing to " +
        "request, correct or erase, because there is nothing."

private val PRIVACY_SECTIONS = listOf(
    "The Android application" to
        "It declares no Android permissions at all. Not \"only the clipboard\": genuinely " +
        "none. The INTERNET permission is stripped from the built package, so the app " +
        "cannot reach the network even if a future dependency tried to add it. Check " +
        "before you install: aapt dump permissions UsernameGenerator-<version>.apk",
    "What stays on your device" to
        "Your settings, meaning the language, the word type, the length, and the digit and " +
        "separator choices, are saved in the app's private storage so they survive a " +
        "restart. Nothing else is written down. Generated names are held in memory and are " +
        "gone when you close the app.",
    "They are not backed up" to
        "The app sets allowBackup=\"false\", so Android's Auto Backup never copies them " +
        "to your Google account, and adb backup gets nothing either. It also asks Android " +
        "to exclude them from device-to-device transfer, which is the one path " +
        "allowBackup does not govern; Google's own documentation says some manufacturers " +
        "do not let an app opt out of that migration, so we ask, and cannot promise. " +
        "Uninstalling removes them.",
    "The clipboard" to
        "Copying a name puts it on the system clipboard, which is shared with the rest " +
        "of your device. On Android 13 and later the app marks the clip sensitive, which " +
        "keeps it out of the clipboard preview. What happens after you paste it is " +
        "between you and the app you pasted into.",
    "Word lists" to
        "The word lists for all eleven languages are compiled into the app. There is no download, no " +
        "update check and no server to ask.",
    "The web version" to
        "Static files. No cookies, no local storage (unless you choose the offline option, " +
        "which keeps a copy of this site on your device so that it opens without a " +
        "network), no analytics and no third-party scripts or frames. The generator, its " +
        "fonts and its word lists are served from this site and nowhere else, and " +
        "everything you generate happens in your browser and stays there.\n\n" +
        "GitHub Pages stores the site and keeps its own logs; Cloudflare delivers it on " +
        "our behalf and keeps short-lived logs.\n\n" +
        "Your data protection rights, and how to complain to Datatilsynet (the Norwegian " +
        "Data Protection Authority), are set out at stormberry.as/privacy.",
    "Where you got the app" to
        "A copy installed from Google Play is delivered by Google, which applies its own " +
        "logging to the download and the install. That is Google's processing, not ours, " +
        "and it happens before the app ever runs.\n\n" +
        "The Play listing is a separate package, no.stormberry.usernamegenerator.play, " +
        "signed under Google's Play App Signing. The copy published on GitHub Releases, " +
        "Obtainium and Zapstore is no.stormberry.usernamegenerator, signed with our own " +
        "key, and is not routed through Google at all. Both can be installed at once, and " +
        "neither can update the other.",
    "Children" to
        "The application has no content directed at children, collects nothing from " +
        "anyone, and never asks anyone's age.",
    "Changes" to
        "If any of this changes, the date below changes with it, and the copy shown inside " +
        "the application changes in the same release.",
    "Who is responsible" to
        "Stormberry AS, org.nr. 937 751 249, Askøy, Norway. Contact: info@stormberry.as\n\n" +
        "The company policy covering the stormberry.as website and its contact form is a " +
        "separate document at stormberry.as/privacy.html.",
)

private const val PRIVACY_UPDATED = "Last updated 25 October 2026."

@Composable
fun PrivacyDialog(onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Stormberry.Surface,
        titleContentColor = Stormberry.TextMain,
        textContentColor = Stormberry.TextMuted,
        title = { Text(text = "Privacy", style = MaterialTheme.typography.titleMedium) },
        text = {
            // AlertDialog caps the height of this slot and does not scroll it for us, so a
            // policy long enough to be honest needs its own scroll or it is clipped on a
            // short screen.
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                Text(text = PRIVACY_INTRO, style = MaterialTheme.typography.bodySmall)
                PRIVACY_SECTIONS.forEach { (heading, body) ->
                    Spacer(Modifier.height(16.dp))
                    Text(
                        text = heading,
                        style = MaterialTheme.typography.labelMedium,
                        color = Stormberry.AccentSky,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(text = body, style = MaterialTheme.typography.bodySmall)
                }
                Spacer(Modifier.height(16.dp))
                Text(text = PRIVACY_UPDATED, style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                // Explicit colour: a TextButton takes its content colour from
                // colorScheme.primary, which is Stormberry.AccentIndigo and lands at 2.97:1
                // on this dialog's surface, under the 4.5:1 floor for normal text.
                Text(
                    text = "Close",
                    style = MaterialTheme.typography.labelMedium,
                    color = Stormberry.TextMain,
                )
            }
        },
    )
}
