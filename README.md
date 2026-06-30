# UsernameGenerator

Secure, inspiring, and dynamic identity generation for the modern web. The UsernameGenerator is a self-hosted, highly customizable CLI utility and web application. Designed with a focus on positivity and cross-cultural reach, it algorithmically constructs memorable, high-impact usernames using curated dictionaries.

**Live:** [username.stormberry.as](https://username.stormberry.as)

## Features
- **10 Supported Languages**: English (`en`), Portuguese (`pt`), Spanish (`es`), Norwegian (`no`), Latin (`la`), German (`de`), French (`fr`), Italian (`it`), Polish (`pl`), Dutch (`nl`).
- **Empowering Lexicons**: Dictionaries are meticulously populated with exactly 100 exclusively positive, heroic, and inspiring words per category.
- **Dynamic Phrasing**: Intelligently constructs complex structures (e.g., `Verb-Adjective-Noun`) or simple pairs depending on the requested length.
- **Stateful Defaults**: Seamlessly persist your preferred CLI configuration via local config.
- **Universal Compatibility**: Algorithmically strips accents and special characters (e.g., `condução` to `conducao`) to ensure platform-agnostic usernames.

## Architecture
- **Vanilla HTML/CSS/JS** for the web interface, no frameworks, no build step.
- **Python CLI Engine** (`username.py`) serving as both the terminal utility and the core logic reference.
- **Privacy first**, no cookies, no tracking. Fully local dictionary lookup.
- Stormberry dark-mode glassmorphism design system, Inter typography.
- **Sovereign AI**, built and maintained using high-speed agentic workflows.

## Stack
- [Deep-Translator](https://github.com/nidhaloff/deep-translator) for dictionary translation/population (build step only).
- Python `unicodedata` and JS `String.prototype.normalize()` for string sanitization.
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
