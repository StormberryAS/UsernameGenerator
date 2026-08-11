package no.stormberry.usernamegenerator

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import no.stormberry.usernamegenerator.ui.Stormberry
import no.stormberry.usernamegenerator.ui.UsernameGeneratorApp
import no.stormberry.usernamegenerator.ui.UsernameGeneratorTheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            UsernameGeneratorTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = Stormberry.Background,
                ) {
                    UsernameGeneratorApp(
                        modifier = Modifier
                            .fillMaxSize()
                            .windowInsetsPadding(WindowInsets.systemBars)
                            .consumeWindowInsets(WindowInsets.systemBars),
                    )
                }
            }
        }
    }
}
