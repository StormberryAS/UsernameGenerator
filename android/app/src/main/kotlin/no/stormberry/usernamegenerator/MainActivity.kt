package no.stormberry.usernamegenerator

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import no.stormberry.usernamegenerator.ui.Stormberry
import no.stormberry.usernamegenerator.ui.UsernameGeneratorApp
import no.stormberry.usernamegenerator.ui.UsernameGeneratorTheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        // The app is dark whatever the phone's setting is, so both bars use the dark style:
        // light clock, battery and gesture handle on the dark page. (The default follows the
        // phone, which in light mode drew dark icons on the dark background.)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)
        setContent {
            UsernameGeneratorTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = Stormberry.Background,
                ) {
                    // The top and the sides are padded here. The bottom is left to the footer,
                    // which takes the navigation bar's inset inside its own background so the
                    // footer colour runs to the edge of the screen (see AppFooter); padding it
                    // here left a strip under the footer that showed the page's glow.
                    val topAndSides = WindowInsets.systemBars
                        .only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal)
                    UsernameGeneratorApp(
                        modifier = Modifier
                            .fillMaxSize()
                            .windowInsetsPadding(topAndSides)
                            .consumeWindowInsets(topAndSides),
                    )
                }
            }
        }
    }
}
