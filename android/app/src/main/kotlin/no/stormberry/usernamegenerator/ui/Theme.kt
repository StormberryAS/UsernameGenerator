package no.stormberry.usernamegenerator.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * The Stormberry dark glassmorphism palette, lifted verbatim from the web app's
 * style.css custom properties so the APK and username.stormberry.as look like one
 * product. The app is dark-only by design; [isSystemInDarkTheme] is deliberately
 * not consulted, because a light variant of this palette does not exist yet.
 */
object Stormberry {
    val Background = Color(0xFF0A0A0C)
    val Surface = Color(0xFF121216)
    val GlassFill = Color(0x08FFFFFF)
    val GlassBorder = Color(0x14FFFFFF)
    val TextMain = Color(0xFFFFFFFF)
    val TextMuted = Color(0xFF8A8A93)

    val AccentIndigo = Color(0xFF4F46E5)
    val AccentRose = Color(0xFFE11D48)
    val AccentSky = Color(0xFF0EA5E9)
    val AccentEmerald = Color(0xFF10B981)
}

private val StormberryColors = darkColorScheme(
    primary = Stormberry.AccentIndigo,
    onPrimary = Stormberry.TextMain,
    secondary = Stormberry.AccentSky,
    onSecondary = Stormberry.TextMain,
    tertiary = Stormberry.AccentRose,
    background = Stormberry.Background,
    onBackground = Stormberry.TextMain,
    surface = Stormberry.Surface,
    onSurface = Stormberry.TextMain,
    surfaceVariant = Stormberry.Surface,
    onSurfaceVariant = Stormberry.TextMuted,
    outline = Stormberry.GlassBorder,
)

private val StormberryTypography = Typography().run {
    copy(
        displaySmall = displaySmall.copy(fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp),
        headlineSmall = headlineSmall.copy(fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp),
        titleMedium = titleMedium.copy(fontWeight = FontWeight.SemiBold),
        labelLarge = labelLarge.copy(fontWeight = FontWeight.Medium),
    )
}

/** The generated username itself, sized to stay readable when it gets long. */
val UsernameTextStyle = TextStyle(
    fontSize = 30.sp,
    lineHeight = 38.sp,
    fontWeight = FontWeight.Bold,
    letterSpacing = (-0.5).sp,
)

@Composable
fun UsernameGeneratorTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = StormberryColors,
        typography = StormberryTypography,
        content = content,
    )
}
