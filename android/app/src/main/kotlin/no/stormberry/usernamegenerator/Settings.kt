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

    /**
     * **Defaults to [Language.RANDOM]** from this version, where earlier releases
     * defaulted to English.
     *
     * As with [addDigits], the new default reaches only people who never expressed a
     * preference: [read] returns any stored value, and the app writes one the moment
     * the control is touched, so an explicit choice of English survives the upgrade
     * intact. Only a never-set key becomes RANDOM.
     */
    var language: Language
        get() = read(KEY_LANGUAGE, Language.RANDOM, Language.entries)
        set(value) = prefs.edit { putString(KEY_LANGUAGE, value.name) }

    /**
     * Give each word its own run of digits. **On by default**, where v1.0.1 defaulted
     * to off.
     *
     * Changing a default changes what an existing install generates, which is a real
     * cost and a deliberate decision. It may only reach people who never expressed a
     * preference, though: someone who explicitly chose "none" made a decision, and the
     * app overruling it on upgrade would be worse than the old default ever was. So a
     * stored value wins, under either key, and the new default applies only to the
     * genuinely unset.
     *
     * Hence `contains` rather than `getBoolean(key, true)` over the legacy name: a
     * stored false and a never-set key are different answers, a bare fallback cannot
     * tell them apart, and only the second one is allowed to become true.
     *
     * The key was renamed because the option is no longer an append: it can put the
     * digits in front. The old name is read for as long as anyone might still be
     * carrying it, and never written back.
     */
    var addDigits: Boolean
        get() = when {
            prefs.contains(KEY_ADD_DIGITS) -> prefs.getBoolean(KEY_ADD_DIGITS, DEFAULT_ADD_DIGITS)
            prefs.contains(KEY_LEGACY_APPEND_DIGITS) ->
                prefs.getBoolean(KEY_LEGACY_APPEND_DIGITS, DEFAULT_ADD_DIGITS)
            else -> DEFAULT_ADD_DIGITS
        }
        set(value) = prefs.edit { putBoolean(KEY_ADD_DIGITS, value) }

    /**
     * Which side of each word its digits go on. Meaningless while [addDigits] is off,
     * and the UI hides it then, but it is still remembered so that turning digits back
     * on restores the arrangement the user last chose rather than the default.
     */
    var digitPosition: DigitPosition
        get() = read(KEY_DIGIT_POSITION, DigitPosition.AFTER, DigitPosition.entries)
        set(value) = prefs.edit { putString(KEY_DIGIT_POSITION, value.name) }

    /**
     * How many digits each word gets. Coerced on read as well as on write, because the
     * preference file is a plain XML file on disk: a value from a future version, or
     * an edited one on a rooted device, must not reach the engine unchecked.
     */
    var digitCount: Int
        get() = prefs.getInt(KEY_DIGIT_COUNT, DEFAULT_DIGIT_COUNT).coerceIn(MIN_DIGITS, MAX_DIGITS)
        set(value) = prefs.edit { putInt(KEY_DIGIT_COUNT, value.coerceIn(MIN_DIGITS, MAX_DIGITS)) }

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

        /** Same one-to-five range as the word count, so both read as one chip row. */
        const val MIN_DIGITS = 1
        const val MAX_DIGITS = 5

        /** See [addDigits]: on by default from this version, and off in v1.0.1. */
        private const val DEFAULT_ADD_DIGITS = true
        private const val DEFAULT_DIGIT_COUNT = 1

        private const val KEY_WORD_COUNT = "word_count"
        private const val KEY_WORD_TYPE = "word_type"
        private const val KEY_LANGUAGE = "language"
        private const val KEY_SEPARATOR = "separator"
        private const val KEY_ADD_DIGITS = "add_digits"
        private const val KEY_DIGIT_POSITION = "digit_position"
        private const val KEY_DIGIT_COUNT = "digit_count"

        /** v1.0.1's name for [KEY_ADD_DIGITS]. Read only, never written. */
        private const val KEY_LEGACY_APPEND_DIGITS = "append_digits"
    }
}
