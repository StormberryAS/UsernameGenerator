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
