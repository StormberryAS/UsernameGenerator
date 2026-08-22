#!/usr/bin/env python3
"""Precomputes the exact entropy of every language option, under the no-repeat rule.

WHY THIS EXISTS. Three things stop the app from computing its own figures:

1. NO-REPEAT DRAWING. A username never repeats a word, so the space is ordered
   tuples of DISTINCT words, not the plain product of the dictionary sizes. When
   the slots draw from different categories that count needs inclusion-exclusion
   over set partitions, because a word can sit in both the noun and the verb list.

2. POOLED MIX. "Mix languages" draws each word uniformly from the pooled distinct
   vocabulary rather than picking a language and then a word. That deliberately
   removes the ninja problem: under the old scheme "ninja" was in 9 of the 11 noun
   lists and so was about nine times likelier than a word unique to one language,
   which cost up to 3.06 bits per word. Pooling makes every word equally likely
   without deleting anything.

3. RANDOM LANGUAGE. One language is drawn for the WHOLE name, so the slots are not
   independent and the languages have different sizes. The distribution is a
   mixture and is genuinely non-uniform, which is why min-entropy and collision
   entropy diverge there and both are needed.

Options 1 and 2 are uniform distributions, so their min-entropy and collision
entropy are equal and are simply log2(count). Only "random" needs the heavy maths.

Regenerate when the dictionaries change; CI fails if the table is stale.
"""
import itertools
import math
import os
import sys
from functools import lru_cache

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from username import sanitize  # noqa: E402  single source of truth for folding
LANGS = "en no pt es de fr it nl pl ro la".split()
CATS = ["adjective", "noun", "verb"]
PLURAL = {"adjective": "adjectives", "noun": "nouns", "verb": "verbs"}
TYPES = ["mixed", "noun", "adjective", "verb"]
MAX_WORDS = 5

# Sets of SANITISED forms, not raw entries. The generator draws distinct displayed
# words, so "male" and "måle" are one word here, and "dragon"/"dragón" across two
# languages are one word too. Counting raw entries would overstate every figure and
# would disagree with what the app can actually produce.
D = {(l, c): frozenset(sanitize(w.strip()) for w in
                       open(os.path.join(ROOT, "data", f"{l}_{PLURAL[c]}.txt"), encoding="utf-8")
                       if w.strip())
     for l in LANGS for c in CATS}

# The pooled vocabulary "mix" draws from. Built by walking the languages in the
# shared order and keeping first occurrences, NOT by sorting: every implementation
# builds it the same way without depending on locale or on how a language sorts
# strings, and only the SIZE affects entropy anyway.
# The pooled vocabulary is simply the union of the sanitised per-language sets.
POOL = {c: frozenset().union(*(D[(l, c)] for l in LANGS)) for c in CATS}


def category_plan(word_count, word_type):
    """Must stay identical to category_plan in username.py and script.js."""
    if word_type != "mixed":
        return [word_type] * word_count
    if word_count <= 1:
        return ["noun"]
    if word_count == 2:
        return ["adjective", "noun"]
    return ["verb", "adjective"] + ["noun"] * (word_count - 2)


def set_partitions(items):
    """Every way of splitting a list into non-empty blocks."""
    if not items:
        yield []
        return
    first, rest = items[0], items[1:]
    for smaller in set_partitions(rest):
        for i, block in enumerate(smaller):
            yield smaller[:i] + [[first] + block] + smaller[i + 1:]
        yield [[first]] + smaller


def distinct_tuples(sets):
    """Ordered tuples (w1..wk) with wi in sets[i] and every wi different.

    Inclusion-exclusion over set partitions of the slot indices: a block of size b
    contributes (-1)^(b-1) * (b-1)! times the size of the intersection of its sets.
    For k=2 this reduces to |A||B| - |A&B|, which is the familiar answer.
    """
    k = len(sets)
    if k == 0:
        return 1
    total = 0
    for partition in set_partitions(list(range(k))):
        coefficient = 1
        product = 1
        for block in partition:
            b = len(block)
            coefficient *= (-1) ** (b - 1) * math.factorial(b - 1)
            inter = sets[block[0]]
            for i in block[1:]:
                inter = inter & sets[i]
            product *= len(inter)
            if product == 0:
                break
        total += coefficient * product
    return total


@lru_cache(maxsize=None)
def subset_sets(subset, cat):
    """The words of `cat` common to every language in `subset`."""
    inter = D[(subset[0], cat)]
    for l in subset[1:]:
        inter = inter & D[(l, cat)]
    return inter


rows = []
for word_type in TYPES:
    for words in range(1, MAX_WORDS + 1):
        cats = category_plan(words, word_type)

        # Fixed languages and mix are uniform over their distinct tuples, so both
        # measures are just log2 of the count.
        for lang in LANGS:
            count = distinct_tuples([D[(lang, c)] for c in cats])
            bits = math.log2(count)
            rows.append((lang, word_type, words, bits, bits))

        count = distinct_tuples([POOL[c] for c in cats])
        bits = math.log2(count)
        rows.append(("mix", word_type, words, bits, bits))

        # Random draws ONE language for the whole name, so the distribution is a
        # mixture over languages of different sizes and is not uniform.
        counts = {l: distinct_tuples([D[(l, c)] for c in cats]) for l in LANGS}
        weight = {l: (1.0 / len(LANGS)) / counts[l] for l in LANGS if counts[l]}

        # H2 = -log2 sum_t p(t)^2, expanded pairwise so it is an 11x11 sum rather
        # than a sum over every possible username.
        sum_sq = 0.0
        for a in LANGS:
            for b in LANGS:
                shared = distinct_tuples([subset_sets((a, b), c) for c in cats])
                if shared:
                    sum_sq += weight[a] * weight[b] * shared

        # Hmin: the heaviest set of languages that can all produce one common name.
        # Adding a language only increases the sum, so the maximum is attained at an
        # achievable subset and enumerating all 2^11 of them is exact.
        best = 0.0
        for r in range(1, len(LANGS) + 1):
            for subset in itertools.combinations(LANGS, r):
                if distinct_tuples([subset_sets(subset, c) for c in cats]):
                    best = max(best, sum(weight[l] for l in subset))
        rows.append(("random", word_type, words, -math.log2(best), -math.log2(sum_sq)))

out = os.path.join(ROOT, "data", "entropy-model.tsv")
with open(out, "w", encoding="utf-8") as f:
    f.write("# generated by tools/gen-entropy-model.py -- do not edit\n")
    f.write("# exact entropy of the word part, under no-repeat drawing and pooled mix.\n")
    f.write("# digits are uniform and independent and are added by the app.\n")
    f.write("# pool sizes: " + ", ".join(f"{c}={len(POOL[c])}" for c in CATS) + "\n")
    f.write("# language\ttype\twords\thmin\th2\n")
    for lang, word_type, words, hmin, h2 in rows:
        f.write(f"{lang}\t{word_type}\t{words}\t{hmin:.9f}\t{h2:.9f}\n")

print(f"{len(rows)} rows -> data/entropy-model.tsv")
print("  pool sizes: " + ", ".join(f"{c}={len(POOL[c])}" for c in CATS))
for lang in ("en", "es", "la", "random", "mix"):
    r = next(x for x in rows if x[0] == lang and x[1] == "verb" and x[2] == 5)
    print(f"  {lang:<7} verb x5   Hmin={r[3]:7.3f}  H2={r[4]:7.3f}")
