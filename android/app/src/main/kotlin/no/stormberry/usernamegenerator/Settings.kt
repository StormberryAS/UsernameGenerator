package no.stormberry.usernamegenerator

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit

/**
 * Preference persistence. SharedPreferences lives in the app's private data
 * directory, so this needs no permission and never leaves the device.
 */
class Settings(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("username_generator", Context.MODE_PRIVATE)

    var wordCount: Int
        get() = prefs.getInt(KEY_WORD_COUNT, 2).coerceIn(MIN_WORDS, MAX_WORDS)
        set(value) = prefs.edit { putInt(KEY_WORD_COUNT, value.coerceIn(MIN_WORDS, MAX_WORDS)) }

    var wordType: WordType
        get() = read(KEY_WORD_TYPE, WordType.MIXED, WordType.entries)
        set(value) = prefs.edit { putString(KEY_WORD_TYPE, value.name) }

    var language: Language
        get() = read(KEY_LANGUAGE, Language.EN, Language.entries)
        set(value) = prefs.edit { putString(KEY_LANGUAGE, value.name) }

    var separator: Separator
        get() = read(KEY_SEPARATOR, Separator.NONE, Separator.entries)
        set(value) = prefs.edit { putString(KEY_SEPARATOR, value.name) }

    /**
     * Reads an enum by name, falling back to the default if the stored value is
     * absent or no longer a valid constant. That second case is the one that
     * matters: renaming an enum constant in a later version must not crash on
     * someone's existing install.
     */
    private fun <T : Enum<T>> read(key: String, fallback: T, values: List<T>): T {
        val stored = prefs.getString(key, null) ?: return fallback
        return values.firstOrNull { it.name == stored } ?: fallback
    }

    companion object {
        const val MIN_WORDS = 1
        const val MAX_WORDS = 5

        private const val KEY_WORD_COUNT = "word_count"
        private const val KEY_WORD_TYPE = "word_type"
        private const val KEY_LANGUAGE = "language"
        private const val KEY_SEPARATOR = "separator"
    }
}
