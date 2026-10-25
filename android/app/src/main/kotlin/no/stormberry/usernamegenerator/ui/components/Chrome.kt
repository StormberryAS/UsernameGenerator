package no.stormberry.usernamegenerator.ui.components

import androidx.annotation.DrawableRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.stormberry.usernamegenerator.R
import no.stormberry.usernamegenerator.ui.Stormberry

/**
 * The furniture around the generator: the hero at the top and the footer at the bottom.
 *
 * Since 1.1.4 both are CheckLink's, re-built natively and kept in this app's own colours (the
 * same port MoonApp made in 1.0.5). Before that the top was a mark beside a left-aligned name
 * with a subtitle, and the bottom was a two-line note, a Privacy button and the Stormberry
 * lockup. The wording is DRAFT for Marcos: the tagline is the web's, the credit sentence and
 * the privacy line are new.
 */

const val APP_NAME = "UsernameGenerator"

/**
 * Hero: the mark, the name and a tagline, all centred, as at the top of CheckLink.
 *
 * A 64 dp mark with its glow, the name large and centred, and the tagline in the muted colour
 * under it, no wider than 34 rem (544 dp) so it still wraps on a tablet. The generator follows
 * it. Sizes are CheckLink's (`.hero` in its style.css): 16 dp between the three, the name at
 * 1.9 rem and the tagline at 1.05 rem with a 1.55 line height. All in sp, so Android's font
 * size setting scales them as the browser's does there.
 */
@Composable
fun AppHero(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Image(
            painter = painterResource(R.drawable.ic_app_logo),
            // Decorative: the name under it is already the accessible name, so announcing the
            // mark as well would only slow a screen reader down.
            contentDescription = null,
            modifier = Modifier
                .size(64.dp)
                .drawBehind { drawLogoGlow() },
        )
        Text(
            text = APP_NAME,
            modifier = Modifier.semantics { heading() },
            style = MaterialTheme.typography.headlineSmall.copy(
                fontSize = 30.sp,
                lineHeight = 36.sp,
                fontWeight = FontWeight.Bold,
            ),
            color = Stormberry.TextMain,
            textAlign = TextAlign.Center,
        )
        Text(
            text = HERO_TAGLINE,
            modifier = Modifier.widthIn(max = 544.dp),
            style = MaterialTheme.typography.bodyLarge.copy(
                fontSize = 16.8.sp,
                lineHeight = 26.sp,
            ),
            color = Stormberry.TextMuted,
            textAlign = TextAlign.Center,
        )
    }
}

/**
 * Footer, as CheckLink's: the Stormberry wordmark and tagline, what runs on the device, a
 * divider, the icon row, the bold privacy line, then the small print.
 *
 * Laid out the way CheckLink's `.site-footer` lays itself out on a phone: full width on the
 * page's darkest colour under a hairline, 24 dp of side padding, the brand block above the
 * "runs on your device" block, then a centred column under a second hairline. It is placed
 * outside the screen's own padding so the hairline and the background reach both edges.
 *
 * [onPrivacy] opens the in-app policy. Privacy is the one footer entry that is not a link out:
 * the app has no INTERNET permission, and Play wants the policy reachable from inside it.
 *
 * ### Opening a link from an app with no INTERNET permission
 *
 * The manifest does not merely omit INTERNET, it removes it:
 *
 *     <uses-permission android:name="android.permission.INTERNET" tools:node="remove" />
 *
 * so this process cannot open a socket. That is not in tension with the links below.
 * [openLink] fires an ACTION_VIEW intent and the BROWSER (or the Nostr client) does the
 * fetching, in its own process with its own permissions. Nothing here needs INTERNET and
 * nothing here should ever be "fixed" by adding it: the whole privacy claim rests on that
 * permission being absent, and FooterLinksTest plus the zero-permission check on the built APK
 * keep the claim honest.
 */
@Composable
fun AppFooter(onPrivacy: () -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val open: (String) -> Unit = remember(context) { { url: String -> openLink(context, url); Unit } }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(Stormberry.Background)
            .drawBehind {
                drawLine(
                    Stormberry.BorderFooter, Offset.Zero, Offset(size.width, 0f),
                    strokeWidth = 1.dp.toPx(),
                )
            }
            // The navigation bar's inset sits inside the background, so the footer colour reaches
            // the bottom edge of the screen behind a gesture handle or three buttons.
            .windowInsetsPadding(WindowInsets.navigationBars)
            .padding(start = 24.dp, end = 24.dp, top = 48.dp, bottom = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // The two blocks of .footer-inner, which wrap onto their own rows on a phone.
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(32.dp),
        ) {
            Column(modifier = Modifier.widthIn(max = 320.dp)) {
                Text(
                    text = buildAnnotatedString {
                        append("Stormberry")
                        withStyle(SpanStyle(color = Stormberry.BrandDot)) { append(".") }
                    },
                    style = MaterialTheme.typography.titleLarge.copy(
                        fontSize = 24.sp,
                        lineHeight = 30.sp,
                        fontWeight = FontWeight.Bold,
                    ),
                    color = Stormberry.TextMain,
                    modifier = Modifier
                        .heightIn(min = 48.dp)
                        .clearAndSetSemantics {
                            contentDescription = "Stormberry AS website"
                            role = Role.Button
                        }
                        .clickable(role = Role.Button) { open(FooterLinks.SITE) }
                        .wrapContentHeight(Alignment.CenterVertically),
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = FooterText.TAGLINE,
                    style = footerStyle(15.2.sp, 23.sp),
                    color = Stormberry.TextSoft,
                )
            }

            Text(
                text = buildAnnotatedString { footerParts(FooterText.CREDITS, open, onPrivacy) },
                modifier = Modifier.widthIn(max = 320.dp),
                style = footerStyle(14.1.sp, 22.sp),
                color = Stormberry.TextSoft,
            )
        }

        Spacer(Modifier.height(40.dp))

        // .footer-bottom: a hairline, then a centred column.
        HorizontalDivider(color = Stormberry.BorderSoft)
        Spacer(Modifier.height(32.dp))

        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(horizontalArrangement = Arrangement.Center) {
                for (icon in FooterIcons) {
                    SocialIcon(icon, onClick = { open(icon.url) })
                }
            }

            Text(
                text = FooterText.OFFLINE,
                style = footerStyle(14.4.sp, 23.sp, FontWeight.SemiBold),
                color = Stormberry.TextSoft,
                textAlign = TextAlign.Center,
            )

            Text(
                text = FooterText.PERMISSIONS,
                style = footerStyle(13.6.sp, 22.sp),
                color = Stormberry.TextSoft,
                textAlign = TextAlign.Center,
            )

            Text(
                text = buildAnnotatedString { footerParts(FooterText.SMALL_PRINT, open, onPrivacy) },
                style = footerStyle(13.6.sp, 22.sp),
                color = Stormberry.TextSmallPrint,
                textAlign = TextAlign.Center,
            )
            Text(
                text = FooterText.PRIVACY_FIRST,
                style = footerStyle(13.6.sp, 22.sp),
                color = Stormberry.TextSmallPrint,
                textAlign = TextAlign.Center,
            )
            Text(
                text = FooterText.WORD_LISTS_DATED,
                style = footerStyle(13.6.sp, 22.sp),
                color = Stormberry.TextSmallPrint,
                textAlign = TextAlign.Center,
            )
            Text(
                text = FooterText.AI,
                style = footerStyle(13.6.sp, 22.sp),
                color = Stormberry.TextSmallPrint,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun footerStyle(
    size: TextUnit,
    lineHeight: TextUnit,
    weight: FontWeight = FontWeight.Normal,
) = MaterialTheme.typography.bodySmall.copy(
    fontSize = size,
    lineHeight = lineHeight,
    fontWeight = weight,
)

private val LinkStyles = TextLinkStyles(
    SpanStyle(color = Stormberry.AccentSky, textDecoration = TextDecoration.Underline),
)

/**
 * A link in running footer text: the app's sky blue AND underlined, because colour alone is not
 * an accessible affordance for a link (CheckLink's footer does the same). A real link
 * annotation, so TalkBack lists it among the text's links.
 *
 * Spaces inside [label] are no-break spaces, which is how the web footer's `white-space: nowrap`
 * is kept: the org.nr. does not break inside itself.
 */
private fun AnnotatedString.Builder.footerLink(
    label: String,
    url: String,
    open: (String) -> Unit,
) {
    withLink(
        LinkAnnotation.Clickable(
            tag = url,
            styles = LinkStyles,
            linkInteractionListener = { open(url) },
        ),
    ) { append(label) }
}

/** Draws a sentence made of [FooterPart]s: text as it is, links out through [open], Privacy through [onPrivacy]. */
private fun AnnotatedString.Builder.footerParts(
    parts: List<FooterPart>,
    open: (String) -> Unit,
    onPrivacy: () -> Unit,
) {
    for (part in parts) {
        when (part) {
            is FooterPart.Text -> append(part.text)
            is FooterPart.Link -> footerLink(part.label, part.url, open)
            is FooterPart.InApp -> footerAction(part.label, onPrivacy)
        }
    }
}

/** The same look as [footerLink], for an entry that runs code in the app instead of leaving it. */
private fun AnnotatedString.Builder.footerAction(label: String, action: () -> Unit) {
    withLink(
        LinkAnnotation.Clickable(
            tag = label,
            styles = LinkStyles,
            linkInteractionListener = { action() },
        ),
    ) { append(label) }
}

/** One mark of the icon row: 24 dp drawn, 48 dp to touch, named for a screen reader. */
@Composable
private fun SocialIcon(icon: FooterIcon, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(48.dp)
            .clickable(role = Role.Button, onClickLabel = "Open ${icon.label}", onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            painter = painterResource(icon.drawable),
            contentDescription = icon.label,
            tint = Stormberry.TextSmallPrint,
            modifier = Modifier.size(24.dp),
        )
    }
}

/** What the icon row shows, in CheckLink's order: LinkedIn, GitHub, Nostr, Tor. */
private class FooterIcon(val label: String, val url: String, @param:DrawableRes val drawable: Int)

private val FooterIcons = listOf(
    FooterIcon("LinkedIn", FooterLinks.LINKEDIN, R.drawable.ic_social_linkedin),
    FooterIcon("GitHub", FooterLinks.GITHUB, R.drawable.ic_social_github),
    FooterIcon("Nostr", FooterLinks.NOSTR, R.drawable.ic_social_nostr),
    FooterIcon("Tor onion site", FooterLinks.ONION, R.drawable.ic_social_onion),
)

/**
 * The indigo halo the web app puts behind the same mark with a CSS drop-shadow.
 * Drawn as a radial gradient rather than Modifier.blur, which needs API 31, and
 * deliberately not clipped so it spills past the mark the way a glow should.
 */
private fun DrawScope.drawLogoGlow() {
    val radius = size.minDimension * 0.95f
    drawCircle(
        brush = Brush.radialGradient(
            colors = listOf(Stormberry.AccentIndigo.copy(alpha = 0.42f), Color.Transparent),
            center = center,
            radius = radius,
        ),
        radius = radius,
        center = center,
    )
}
