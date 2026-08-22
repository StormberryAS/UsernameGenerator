# UsernameGenerator

Secure, inspiring, and dynamic identity generation for the modern web. The UsernameGenerator is a self-hosted, highly customizable CLI utility and web application. Designed with a focus on positivity and cross-cultural reach, it algorithmically constructs memorable, high-impact usernames using curated dictionaries.

**Live:** [username.stormberry.as](https://username.stormberry.as)
**Android:** signed APK on the [Releases page](https://github.com/StormberryAS/UsernameGenerator/releases). Zero permissions, no network. Build and verification notes in [`android/README.md`](android/README.md).

## Features
- **11 Supported Languages**: English (`en`), Portuguese (`pt`), Spanish (`es`), Norwegian (`no`), Latin (`la`), German (`de`), French (`fr`), Italian (`it`), Polish (`pl`), Dutch (`nl`), Romanian (`ro`).
- **Empowering Lexicons**: Dictionaries are meticulously populated with exactly 100 exclusively positive, heroic, and inspiring words per category.
- **Dynamic Phrasing**: Intelligently constructs complex structures (e.g., `Verb-Adjective-Noun`) or simple pairs depending on the requested length.
- **Stateful Defaults**: Seamlessly persist your preferred CLI configuration via local config.
- **Universal Compatibility**: Algorithmically reduces every result to plain ASCII (`condução` to `conducao`, `drømme` to `dromme`, `sokół` to `sokol`, `großartig` to `grossartig`), so the username is accepted everywhere. Two steps are needed: Unicode NFD decomposition only reaches letters written as a base plus a combining accent, while `ø`, `ł`, `ß`, `æ` and `œ` are single codepoints and need an explicit transliteration table. That table is identical in all three implementations and is covered by tests.

## Languages

Thirteen options, of which eleven are languages and two are ways of choosing:

| Option | What it does |
|---|---|
| **Random language** *(default)* | Draws **one** language for the whole username, so every word matches. |
| **Mix languages** | Draws each word from the **pooled vocabulary** of all eleven, so one name can hold a German verb, a Portuguese adjective and a Latin noun. |
| The eleven | English, Norwegian, Portuguese, Spanish, German, French, Italian, Dutch, Polish, Romanian, Latin. |

The default changed to **Random language** in this version. Anyone who had already
chosen a language keeps it: only a never-set preference picks up the new default.

### Mixing has a cost, and it is not the entropy

**Every word list was reviewed by a native speaker of its own language and nobody
else.** That was deliberate: a word that is pleasant in French stays in the French
list even if it means something unfortunate in Dutch, because the generator never
put the two side by side.

**Mix languages is the first mode that does.** A mixed name can read as awkward,
rude or offensive to a speaker of one of the languages involved, in a way no
single-language name could. The web app marks the option with a hover note and the
Android app with an asterisk and a footnote. Generate again if you do not like what
you get.

## No word appears twice

A username never repeats a word. `ninja1-ninja2-samurai3` cannot be produced.

This is done by **rejection sampling on the whole name**, not by redrawing the
clashing word. Redrawing one slot would be cheaper and subtly wrong: it would bias
the result towards words that happen to sit in fewer of the other slots' lists, and
every figure below assumes a uniform draw over distinct-word names. A five-word name
is accepted first time about 97% of the time.

Without it, roughly **1 name in 30** repeated a word.

## How strong is it?

All three surfaces show the same figures, updating as you change any option:

```
44.6 bits of entropy
1 in 27 trillion combinations
Even odds of a repeat after 6.1 million names
```

**Combinations** is how many names the settings can produce, so "1 in N" is the
chance one blind guess lands on yours. **Even odds of a repeat** is the birthday
bound, and it is far smaller: two words with no digits is 90,000 combinations but a
coin-flip repeat after just 353 names. A single word with no digits repeats after
about 20 people.

### Two different entropies, on purpose

Under **Random language** the distribution stops being uniform, and one number can
no longer serve both figures honestly:

- The guessing figure uses **min-entropy**, the worst case, because a security
  number must never be optimistic.
- The repeat figure uses **collision entropy** (Rényi-2), because that, not
  min-entropy, governs the birthday bound.

For a fixed language and for **Mix**, the distribution *is* uniform and the two
coincide. Only Random diverges.

### Why "mix" pools the vocabulary

The obvious implementation is "pick a language, then pick a word from it". That is
**wrong**, because the languages are not disjoint: `ninja` is in 9 of the 11 noun
lists, `samurai` in 7, `hacker` in 6. Picking a language first made `ninja` about
nine times likelier than a word unique to one language, costing up to **3.06 bits
per word**, and an attacker guessing shared words first paid nothing for the other
ten languages.

Mix therefore draws from the **pooled distinct vocabulary**: 2,726 adjectives, 2,849
nouns, 2,898 verbs. Every word is equally likely, nothing is deleted, and no fixed
language loses a single entry. That is worth about **11.5 bits per word** against
**8.23** for any one language.

The alternative was deleting the 865 shared duplicates. It was rejected: it would
have cost Spanish adjectives 280 entries down to 132, making Spanish plus adjectives
the *weakest* setting in the app, and it scored lower than pooling on every measure.

Note that **verbs beat nouns**, because verbs overlap least between languages. That
is why the "Max entropy" control computes its answer rather than hardcoding one.

### Max entropy

The strongest combination is **mix languages, 5 verbs, 5 digits each, mixed
separators**, at **148.5 bits**. Note *mixed*, not *random*: Random draws one
separator and uses it throughout, worth 2 bits; Mix draws one per gap, worth 8 on a
five-word name. The button applies it in one press.

Treat that number carefully. It is *not* comparable to a BIP-39 seed phrase's 128
bits, for three reasons: a username is **published** and a seed phrase never is, so
these bits buy uniqueness rather than secrecy; only **57.5** of the 148.5 are words,
the rest being 25 digits and 4 separators; and the result is **63 characters**,
longer than X (15), Instagram (30) or GitHub (39) will accept.

### What is still deliberately not counted

**The language, when you choose one yourself.** An attacker who does not know which
of the eleven you picked must search all of them, worth **+3.33 bits, once**. It is
excluded because the CSPRNG did not choose the language, you did, and predictably.
Entropy counts what was randomly drawn, never what an attacker happens not to know.

Under **Random** and **Mix** the CSPRNG does choose, so there it is counted, and the
model measures what that is genuinely worth rather than assuming `log2(11)`.

**The separator, when you choose one yourself.** A fixed choice, not a draw. Set it
to **Random** and the CSPRNG draws one **per gap**, which is counted: log2(4) per
gap, so 8 bits on a five-word name and nothing at all on a one-word name, which has
no gaps.

Keeping "none" in that pool lets two different word splits produce the same string.
The average (Shannon) loss is **0.0002 bits** on a two-word name, but the headline
figure is min-entropy, and there the honest number is different: for the particular
names that do collide, min-entropy falls by up to **1 bit**, because two draws land
on one string. It affects only those names, and only when an empty separator is
drawn. Dropping "none" would have cost 0.42 bits per gap on *every* name, so it
stays, but the model does not pretend the loss is 0.0002 in the measure it reports.

### A username is not a password

These figures describe how unlikely a *collision* is, and how unguessable the name
is to someone with no other information. Usernames are usually public, so that
second reading rarely matters. Nothing is colour-coded strong or weak, because that
would be a verdict this tool has no business issuing.

### Parity

`tools/gen-entropy-model.py` computes the exact entropy of all 13 options under
no-repeat drawing, using inclusion-exclusion over set partitions because a word can
sit in both the noun and the verb list. `tools/gen-strength-golden.js` lifts the
display maths out of `script.js` and writes 3,124 expectations that
`StrengthGoldenTest` asserts row by row. `tools/check-strength-parity.py`, run by CI
before the build, catches what those cannot: a stale corpus, a stale entropy model,
`username.py` drifting, and the three language orders falling out of step.

```sh
python3 tools/check-strength-parity.py
```

## Architecture
- **Vanilla HTML/CSS/JS** for the web interface, no frameworks, no build step.
- **Native Android app** (`android/`), Kotlin and Jetpack Compose, sharing the same `data/` dictionaries at build time so web, CLI and app never drift apart. Declares **no Android permissions at all**: writing to the clipboard has never needed one, and there is no network access to request.
- **Python CLI Engine** (`username.py`) serving as both the terminal utility and the core logic reference.
- **Privacy first**, no cookies, no tracking. Fully local dictionary lookup.
- Stormberry dark-mode glassmorphism design system, Inter typography.
- **Sovereign AI**, built and maintained using high-speed agentic workflows.

## Stack
- [Deep-Translator](https://github.com/nidhaloff/deep-translator) for dictionary translation/population (build step only).
- Python `unicodedata`, JS `String.prototype.normalize()` and Java `java.text.Normalizer` for string sanitisation, each paired with the same transliteration table.
- [Inter](https://rsms.me/inter/) typeface, locally hosted.

## Local development
```bash
git clone https://github.com/StormberryAS/UsernameGenerator.git
cd UsernameGenerator
python3 -m http.server 8000
```
Open `http://localhost:8000` in your browser.

### Terminal Integration
You can link the engine globally to use it natively in your bash/zsh shell:
```bash
curl -O https://github.com/StormberryAS/UsernameGenerator/raw/main/username.py
chmod +x username.py
ln -s "$(pwd)/username.py" ~/.local/bin/username

# Usage (e.g., 3 words in Portuguese)
username 3 pt
```

## Credits
Built by [Stormberry AS](https://stormberry.as). Proudly powered by sovereign AI agents.

Data generation powered by [Deep-Translator](https://github.com/nidhaloff/deep-translator) (MIT License).

## Disclaimer

Supplied free of charge, **as is**, with no warranty of any kind. Using it creates no client or advisory relationship with Stormberry AS, and nothing it produces is professional advice.

**A generated username is not a security control.** It is unpredictable, which is not the same as private or anonymous. Whether an identity stays separate from another depends on how you use it, not on how it was generated.

This is a **functioning prototype**, not a certified instrument and not a professional service. Values are computed or modelled, not measured. Check anything that matters against an authoritative source before you act on it. Stormberry AS reimburses no cost or loss arising from use of this application.

Full terms: [DISCLAIMER.md](DISCLAIMER.md).
