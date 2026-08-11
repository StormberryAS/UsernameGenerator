package no.stormberry.usernamegenerator.ui

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import android.os.PersistableBundle
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import no.stormberry.usernamegenerator.Dictionaries
import no.stormberry.usernamegenerator.R
import no.stormberry.usernamegenerator.Language
import no.stormberry.usernamegenerator.Separator
import no.stormberry.usernamegenerator.Settings
import no.stormberry.usernamegenerator.UsernameEngine
import no.stormberry.usernamegenerator.WordType

private const val HISTORY_LIMIT = 12

@Composable
fun UsernameGeneratorApp(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val settings = remember { Settings(context) }
    val dictionaries = remember { Dictionaries(context.assets) }
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    var wordCount by remember { mutableIntStateOf(settings.wordCount) }
    var wordType by remember { mutableStateOf(settings.wordType) }
    var language by remember { mutableStateOf(settings.language) }
    var separator by remember { mutableStateOf(settings.separator) }
    var username by remember { mutableStateOf("") }
    var justCopied by remember { mutableStateOf(false) }
    val history = remember { mutableStateListOf<String>() }

    fun generate() {
        val next = UsernameEngine.generate(dictionaries, wordCount, wordType, language, separator)
        if (username.isNotEmpty()) {
            history.remove(username)
            history.add(0, username)
            while (history.size > HISTORY_LIMIT) history.removeAt(history.lastIndex)
        }
        username = next
        justCopied = false
    }

    fun copy(value: String) {
        if (value.isEmpty()) return
        copyToClipboard(context, value)
        justCopied = true
        // Android 13 (API 33) and above shows its own copy confirmation. Adding ours
        // on those versions would double up, so the in-app snackbar is for older devices only.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            scope.launch { snackbarHostState.showSnackbar("Copied to clipboard") }
        }
    }

    // First generation on launch, matching the web app.
    LaunchedEffect(Unit) { if (username.isEmpty()) generate() }

    // Reset the copied indicator after a moment, like the web app's green tick.
    LaunchedEffect(justCopied) {
        if (justCopied) {
            delay(1500)
            justCopied = false
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Stormberry.Background)
            .drawBehind { drawOrbs() },
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Header()
            Spacer(Modifier.height(24.dp))

            OutputCard(
                username = username,
                justCopied = justCopied,
                onCopy = { copy(username) },
                onRegenerate = ::generate,
            )

            Spacer(Modifier.height(20.dp))

            Button(
                onClick = ::generate,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color.Transparent,
                    contentColor = Stormberry.TextMain,
                ),
                contentPadding = PaddingValues(),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.horizontalGradient(
                                listOf(Stormberry.AccentIndigo, Stormberry.AccentRose),
                            ),
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("Generate", style = MaterialTheme.typography.titleMedium)
                }
            }

            Spacer(Modifier.height(28.dp))

            ControlSection("Words") {
                ChipRow(
                    options = (Settings.MIN_WORDS..Settings.MAX_WORDS).toList(),
                    selected = wordCount,
                    label = { it.toString() },
                    onSelect = {
                        wordCount = it
                        settings.wordCount = it
                        generate()
                    },
                )
            }

            ControlSection("Type") {
                ChipRow(
                    options = WordType.entries,
                    selected = wordType,
                    label = { it.label },
                    onSelect = {
                        wordType = it
                        settings.wordType = it
                        generate()
                    },
                )
            }

            ControlSection("Language") {
                ChipRow(
                    options = Language.entries,
                    selected = language,
                    label = { it.label },
                    onSelect = {
                        language = it
                        settings.language = it
                        generate()
                    },
                )
            }

            ControlSection("Separator") {
                ChipRow(
                    options = Separator.entries,
                    selected = separator,
                    label = { it.label },
                    onSelect = {
                        separator = it
                        settings.separator = it
                        generate()
                    },
                )
            }

            if (history.isNotEmpty()) {
                Spacer(Modifier.height(12.dp))
                HistorySection(history = history, onCopy = ::copy)
            }

            Spacer(Modifier.height(28.dp))
            Footer()
        }

        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp),
        ) { data ->
            Snackbar(
                containerColor = Stormberry.Surface,
                contentColor = Stormberry.TextMain,
                shape = RoundedCornerShape(12.dp),
            ) { Text(data.visuals.message) }
        }
    }
}

@Composable
private fun Header() {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = "UsernameGenerator",
            style = MaterialTheme.typography.headlineMedium,
            color = Stormberry.TextMain,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = "Memorable identities, generated on your device",
            style = MaterialTheme.typography.bodyMedium,
            color = Stormberry.TextMuted,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun OutputCard(
    username: String,
    justCopied: Boolean,
    onCopy: () -> Unit,
    onRegenerate: () -> Unit,
) {
    val scale by animateFloatAsState(
        targetValue = if (justCopied) 1.02f else 1f,
        animationSpec = tween(durationMillis = 150),
        label = "outputScale",
    )
    val copyTint by animateColorAsState(
        targetValue = if (justCopied) Stormberry.AccentEmerald else Stormberry.TextMuted,
        animationSpec = tween(durationMillis = 200),
        label = "copyTint",
    )

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .background(Stormberry.GlassFill, RoundedCornerShape(20.dp))
            .border(1.dp, Stormberry.GlassBorder, RoundedCornerShape(20.dp))
            .clickable(onClick = onCopy)
            .padding(20.dp),
    ) {
        Text(
            text = username,
            style = UsernameTextStyle,
            color = Stormberry.TextMain,
            modifier = Modifier.fillMaxWidth().heightIn(min = 76.dp),
        )
        Spacer(Modifier.height(4.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = if (justCopied) "Copied" else "Tap to copy",
                style = MaterialTheme.typography.labelLarge,
                color = if (justCopied) Stormberry.AccentEmerald else Stormberry.TextMuted,
                modifier = Modifier.weight(1f),
            )
            IconButton(onClick = onRegenerate) {
                Icon(
                    painter = painterResource(R.drawable.ic_refresh),
                    contentDescription = "Generate another username",
                    tint = Stormberry.TextMuted,
                )
            }
            IconButton(onClick = onCopy) {
                Icon(
                    painter = painterResource(R.drawable.ic_copy),
                    contentDescription = "Copy username to clipboard",
                    tint = copyTint,
                )
            }
        }
    }
}

@Composable
private fun ControlSection(title: String, content: @Composable () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)) {
        Text(
            text = title.uppercase(),
            style = MaterialTheme.typography.labelMedium,
            color = Stormberry.TextMuted,
            fontSize = 11.sp,
        )
        Spacer(Modifier.height(8.dp))
        content()
    }
}

@Composable
private fun <T> ChipRow(
    options: List<T>,
    selected: T,
    label: (T) -> String,
    onSelect: (T) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        options.forEach { option ->
            val isSelected = option == selected
            FilterChip(
                selected = isSelected,
                onClick = { if (!isSelected) onSelect(option) },
                label = { Text(label(option)) },
                shape = RoundedCornerShape(12.dp),
                colors = FilterChipDefaults.filterChipColors(
                    containerColor = Stormberry.GlassFill,
                    labelColor = Stormberry.TextMuted,
                    selectedContainerColor = Stormberry.AccentIndigo,
                    selectedLabelColor = Stormberry.TextMain,
                ),
                border = null,
            )
        }
    }
}

@Composable
private fun HistorySection(history: List<String>, onCopy: (String) -> Unit) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = "RECENT",
            style = MaterialTheme.typography.labelMedium,
            color = Stormberry.TextMuted,
            fontSize = 11.sp,
        )
        Spacer(Modifier.height(8.dp))
        history.forEach { entry ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onCopy(entry) }
                    .padding(vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = entry,
                    style = MaterialTheme.typography.bodyLarge,
                    color = Stormberry.TextMuted,
                    modifier = Modifier.weight(1f),
                )
                Icon(
                    painter = painterResource(R.drawable.ic_copy),
                    contentDescription = "Copy $entry to clipboard",
                    tint = Stormberry.GlassBorder,
                    modifier = Modifier.size(18.dp),
                )
            }
        }
    }
}

@Composable
private fun Footer() {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = "No permissions. No network. No tracking.",
            style = MaterialTheme.typography.bodySmall,
            color = Stormberry.TextMuted,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = "Stormberry AS",
            style = MaterialTheme.typography.bodySmall,
            color = Stormberry.GlassBorder,
        )
    }
}

/**
 * The three blurred background orbs from the web app, drawn as radial gradients.
 * Deliberately not Modifier.blur, which needs API 31; a soft radial gradient gets
 * the same look and works back to API 24.
 */
private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawOrbs() {
    fun orb(color: Color, centre: Offset, radius: Float) {
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(color.copy(alpha = 0.34f), Color.Transparent),
                center = centre,
                radius = radius,
            ),
            radius = radius,
            center = centre,
        )
    }
    orb(Stormberry.AccentIndigo, Offset(size.width * 0.05f, size.height * 0.08f), size.minDimension * 0.85f)
    orb(Stormberry.AccentRose, Offset(size.width * 0.95f, size.height * 0.78f), size.minDimension * 0.95f)
    orb(Stormberry.AccentSky, Offset(size.width * 0.80f, size.height * 0.18f), size.minDimension * 0.60f)
}

/**
 * Writes to the clipboard. This needs no permission on any Android version.
 *
 * A username is not a secret, but it is an identity the user may be deliberately
 * keeping separate, so the clip is flagged sensitive on Android 13 and above.
 * That keeps the value out of the system's clipboard preview.
 */
private fun copyToClipboard(context: Context, value: String) {
    val manager = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
    val clip = ClipData.newPlainText("username", value)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        clip.description.extras = PersistableBundle().apply {
            putBoolean(ClipDescription.EXTRA_IS_SENSITIVE, true)
        }
    }
    manager.setPrimaryClip(clip)
}
