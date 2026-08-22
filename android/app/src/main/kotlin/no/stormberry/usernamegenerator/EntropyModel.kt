package no.stormberry.usernamegenerator

import android.content.res.AssetManager

/**
 * The exact entropy of every language option, precomputed.
 *
 * WHY IT IS PRECOMPUTED rather than worked out from the dictionary sizes:
 *
 * 1. NO-REPEAT DRAWING. A username never repeats a word, so the space is ordered
 *    tuples of DISTINCT words, not the plain product of the sizes. When the slots
 *    draw from different categories, counting those needs inclusion-exclusion over
 *    set partitions, because a word can sit in both the noun and the verb list.
 * 2. POOLED MIX. [Language.MIX] draws from the combined vocabulary, whose size is
 *    not any arithmetic on the eleven sizes: the lists overlap heavily.
 * 3. RANDOM LANGUAGE. One draw fixes the language for the whole name, so the
 *    distribution is a mixture over lists of different sizes and is genuinely
 *    non-uniform, which is the only case where the two measures diverge.
 *
 * tools/gen-entropy-model.py computes all of it; CI fails if the table is stale.
 */
class EntropyModel private constructor(private val rows: Map<Key, Row>) {

    /** Min-entropy and collision entropy. See [Strength] for why both are needed. */
    data class Row(val hmin: Double, val h2: Double)

    private data class Key(val language: Language, val type: WordType, val wordCount: Int)

    fun lookup(language: Language, type: WordType, wordCount: Int): Row? =
        rows[Key(language, type, wordCount)]

    companion object {
        private const val ASSET = "data/entropy-model.tsv"

        /**
         * Returns null rather than throwing when the asset is missing or malformed.
         * Callers fall back to the size-based figure: a packaging fault should cost
         * the readout its last decimal, never break it.
         */
        fun fromAssets(assets: AssetManager): EntropyModel? = runCatching {
            parse(assets.open(ASSET).bufferedReader().use { it.readText() })
        }.getOrNull()

        fun parse(text: String): EntropyModel {
            val rows = HashMap<Key, Row>()
            for (line in text.lineSequence()) {
                if (line.isBlank() || line.startsWith("#")) continue
                val f = line.split('\t')
                require(f.size == 5) { "malformed entropy-model row: $line" }
                val language = Language.entries.firstOrNull { it.code == f[0] } ?: continue
                val type = WordType.entries.firstOrNull { it.key == f[1] } ?: continue
                rows[Key(language, type, f[2].toInt())] = Row(f[3].toDouble(), f[4].toDouble())
            }
            return EntropyModel(rows)
        }
    }
}
