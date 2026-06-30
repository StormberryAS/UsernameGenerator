# Stormberry UsernameGenerator

> Secure, inspiring, and dynamic identity generation for the modern web.

The **Stormberry UsernameGenerator** is a self-hosted, highly customizable CLI utility and web application. Designed with a focus on positivity and cross-cultural reach, it algorithmically constructs memorable, high-impact usernames using curated dictionaries.

## Features
- **10 Supported Languages**: English (`en`), Portuguese (`pt`), Spanish (`es`), Norwegian (`no`), Latin (`la`), German (`de`), French (`fr`), Italian (`it`), Polish (`pl`), Dutch (`nl`).
- **Empowering Lexicons**: Dictionaries are meticulously populated with exactly 100 exclusively positive, heroic, and inspiring words per category.
- **Dynamic Phrasing**: Intelligently constructs complex structures (e.g., `Verb-Adjective-Noun`) or simple pairs depending on the requested length.
- **Stateful Defaults**: Seamlessly persist your preferred CLI configuration.
- **Web Interface**: A premium, glassmorphic UI hosted at `username.stormberry.as`.

## CLI Installation

1. Make the core script executable:
   ```bash
   chmod +x username.py
   ```

2. Symlink to your local bin directory:
   ```bash
   ln -s "$(pwd)/username.py" ~/.local/bin/username
   ```

## CLI Usage

Commands are entirely flexible and order-independent.

```bash
username [amount] [type] [language] [separator:char] [save]
```

### Examples
- **Generate a default 2-word username (English):**
  ```bash
  username
  ```
  *Output: `cyber-champion`*

- **Generate a 3-word Norwegian phrase and save as default:**
  ```bash
  username 3 no save
  ```
  *Output: `oppnaa-stralende-seier`*

- **Generate a single Italian verb:**
  ```bash
  username 1 verb it
  ```
  *Output: `vincere`*

## Customization
Expand the terminology by editing the plain-text dictionaries in the `data/` directory. The web interface will automatically fetch the latest terms.

---
*Developed by Stormberry AS*
