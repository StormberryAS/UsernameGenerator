package no.stormberry.usernamegenerator.ui.components

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.core.net.toUri

/**
 * Opens [url] in whatever app handles it: an ACTION_VIEW intent, nothing more.
 *
 * Not [androidx.compose.ui.platform.LocalUriHandler]: that throws when nothing can open the
 * address, and the footer has two links a phone may well have no app for, a `nostr:` link
 * without a Nostr client and a `.onion` address without Tor Browser. Here that is a short
 * message, not a crash.
 *
 * The app has no INTERNET permission and must never gain one (the manifest removes it, and
 * FooterLinksTest guards that line). It does not need one: the other app does the fetching.
 */
fun openLink(context: Context, url: String): Boolean {
    val intent = Intent(Intent.ACTION_VIEW, url.toUri()).addCategory(Intent.CATEGORY_BROWSABLE)
    return try {
        context.startActivity(intent)
        true
    } catch (_: ActivityNotFoundException) {
        Toast.makeText(context, "No app on this phone can open that link.", Toast.LENGTH_SHORT)
            .show()
        false
    }
}
