#!/usr/bin/env python3
"""Proves the three strength implementations agree, and that the corpus is current.

Two distinct failures are checked, because the Kotlin test alone cannot see either:

1. The golden corpus is STALE. The Kotlin test asserts against the committed TSV,
   so editing script.js without regenerating leaves it passing happily against a
   description of code that no longer exists. Re-running the generator and diffing
   is the only thing that catches that.
2. Python has DRIFTED. It has no golden test of its own, so nothing else compares
   it to the other two at all.

Run from anywhere:  python3 tools/check-strength-parity.py
"""
import math
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CORPUS = os.path.join(ROOT, "android/app/src/test/resources/strength-golden.tsv")
sys.path.insert(0, ROOT)
import username as u  # noqa: E402

failures = []

# --- 1. corpus is current -------------------------------------------------
# Compared by CONTENT, not via `git diff`. A newly added corpus is untracked, and
# `git diff` on an untracked path is silently empty, so a git-based check passes
# whatever the file says. Snapshot, regenerate, compare: correct whether the file
# is committed, staged or brand new.
before = open(CORPUS, encoding="utf-8").read() if os.path.exists(CORPUS) else None
subprocess.run(["node", "tools/gen-strength-golden.js"],
               cwd=ROOT, check=True, capture_output=True)
after = open(CORPUS, encoding="utf-8").read()
if before is None:
    failures.append("strength-golden.tsv did not exist; it has now been generated")
elif before != after:
    n = sum(1 for a, b in zip(before.splitlines(), after.splitlines()) if a != b)
    failures.append(
        "strength-golden.tsv changed when regenerated from script.js: it was stale.\n"
        f"    The Kotlin test was asserting against out-of-date expectations ({n} rows differ).")

# --- 2. the entropy model is current --------------------------------------
# Derived from the dictionaries, so an edited word list silently invalidates it.
model_path = os.path.join(ROOT, "data/entropy-model.tsv")
model_before = open(model_path, encoding="utf-8").read() if os.path.exists(model_path) else None
subprocess.run(["python3", "tools/gen-entropy-model.py"],
               cwd=ROOT, check=True, capture_output=True)
if model_before is None:
    failures.append("entropy-model.tsv did not exist; it has now been generated")
elif model_before != open(model_path, encoding="utf-8").read():
    failures.append(
        "entropy-model.tsv changed when regenerated: it was stale.\n"
        "    The dictionaries moved and every random/mix figure was computed from the old ones.")

# --- 3. Python matches every row -----------------------------------------
rows = [l.rstrip("\n").split("\t") for l in open(CORPUS, encoding="utf-8")
        if not l.startswith("#")]
if len(rows) < 4500:
    failures.append(f"corpus has only {len(rows)} rows; expected over 4500")

model = u.load_entropy_model()
if model is None:
    failures.append("username.py could not load data/entropy-model.tsv")

mismatched = 0
for (case, lang, wtype, slots, sizes, add, count, sep,
     hmin, h2, bits_text, combos, collision) in rows:
    sizes_list = [int(x) for x in sizes.split(" ")] if sizes else []
    plan = u.category_plan(int(slots), wtype)
    separator = {"mix": u.SEPARATOR_MIX, "random": u.SEPARATOR_RANDOM}.get(sep, "-")
    got = u.describe_strength(model, plan, lang, wtype, sizes_list, add == "1", int(count),
                              separator)
    if (abs(got["hmin"] - float(hmin)) > 1e-9
            or abs(got["h2"] - float(h2)) > 1e-9
            or got["bits_text"] != bits_text
            or got["combinations"] != combos
            or got["collision_at"] != collision):
        if mismatched < 5:
            failures.append(
                f"python differs at {case} lang={lang} digits={add}x{count}: "
                f"expected {bits_text}/{combos}/{collision}, got "
                f"{got['bits_text']}/{got['combinations']}/{got['collision_at']}")
        mismatched += 1
if mismatched > 5:
    failures.append(f"...and {mismatched - 5} further python mismatches")

# --- 4. the shared orders agree ------------------------------------------
# A language index must mean the same language in all three, or "mix" produces a
# different name from the same draws and no golden corpus would ever notice.
model_langs = open(os.path.join(ROOT, "tools/gen-entropy-model.py"), encoding="utf-8").read()
declared = re.search(r'^LANGS = "([^"]+)"\.split\(\)', model_langs, re.M)
if not declared or declared.group(1).split() != u.REAL_LANGUAGES:
    failures.append(f"REAL_LANGUAGES in username.py disagrees with LANGS in gen-entropy-model.py")
js = open(os.path.join(ROOT, "script.js"), encoding="utf-8").read()
js_langs = re.search(r"^const REAL_LANGUAGES = \[([^\]]+)\];", js, re.M)
if not js_langs or [x.strip().strip("'\"") for x in js_langs.group(1).split(",")] != u.REAL_LANGUAGES:
    failures.append("REAL_LANGUAGES in script.js disagrees with username.py")
kt = open(os.path.join(ROOT,
    "android/app/src/main/kotlin/no/stormberry/usernamegenerator/UsernameEngine.kt"),
    encoding="utf-8").read()
kt_order = re.findall(r'^    ([A-Z]{2})\("([a-z]{2})", ', kt, re.M)
if [c for _, c in kt_order] != u.REAL_LANGUAGES:
    failures.append(f"Language enum order in Kotlin disagrees: {[c for _, c in kt_order]}")

# The separator index must mean the same character in all three, or a random
# separator would render differently from identical draws.
js_seps = re.search(r"^const SEPARATOR_VALUES = \[([^\]]+)\];", js, re.M)
if not js_seps or [x.strip().strip("'\"") for x in js_seps.group(1).split(",")] != u.SEPARATOR_VALUES:
    failures.append("SEPARATOR_VALUES in script.js disagrees with username.py")
kt_seps = re.findall(r'^    (NONE|HYPHEN|UNDERSCORE|DOT)\("[^"]*", "([^"]*)"\),', kt, re.M)
if [v for _, v in kt_seps] != u.SEPARATOR_VALUES:
    failures.append(f"Separator enum order in Kotlin disagrees: {[v for _, v in kt_seps]}")

# --- 5. the plans agree, on real data ------------------------------------
plan_mismatch = 0
for case, lang, wtype, slots, sizes, *_ in rows:
    if case.startswith("synthetic/") or not u.is_real_language(lang):
        continue
    got = [len(u.load_words(lang, c)) for c in u.category_plan(int(slots), wtype)]
    if got != [int(x) for x in sizes.split(" ")]:
        plan_mismatch += 1
if plan_mismatch:
    failures.append(f"category_plan disagrees with the web app on {plan_mismatch} cases")

if failures:
    print("FAIL: strength parity")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)

print(f"OK: {len(rows)} rows agree across script.js, username.py and the corpus the Kotlin "
      f"test asserts against; both generated tables are current; all three language orders match.")
