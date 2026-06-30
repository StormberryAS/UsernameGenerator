#!/usr/bin/env python3
import sys
import random
import os
import json
import unicodedata

SCRIPT_DIR = os.path.dirname(os.path.realpath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "data")
CONFIG_PATH = os.path.expanduser("~/.config/username_generator.json")

FALLBACK_CONFIG = {
    "num_words": 2,
    "word_type": "mixed",
    "lang": "en",
    "separator": "-"
}

def load_config():
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, 'r') as f:
                config = json.load(f)
                return {**FALLBACK_CONFIG, **config}
        except Exception:
            pass
    return FALLBACK_CONFIG.copy()

def save_config(config):
    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
    with open(CONFIG_PATH, 'w') as f:
        json.dump(config, f, indent=4)

def load_words(lang, word_type):
    filename = f"{lang}_{word_type}s.txt"
    filepath = os.path.join(DATA_DIR, filename)
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            words = [line.strip().lower() for line in f if line.strip()]
        return words
    except FileNotFoundError:
        print(f"Error: Could not find dictionary file '{filename}' in {DATA_DIR}")
        sys.exit(1)

def generate_username(num_words, word_type, lang, separator):
    result = []
    
    if word_type == "mixed":
        if num_words == 1:
            result.append(random.choice(load_words(lang, "noun")))
        elif num_words == 2:
            result.append(random.choice(load_words(lang, "adjective")))
            result.append(random.choice(load_words(lang, "noun")))
        else:
            verbs = load_words(lang, "verb")
            adjectives = load_words(lang, "adjective")
            nouns = load_words(lang, "noun")
            for i in range(num_words):
                if i == 0:
                    result.append(random.choice(verbs))
                elif i == 1:
                    result.append(random.choice(adjectives))
                else:
                    result.append(random.choice(nouns))
    else:
        words_list = load_words(lang, word_type)
        for _ in range(num_words):
            result.append(random.choice(words_list))
    raw_username = separator.join(result)
    return ''.join(c for c in unicodedata.normalize('NFD', raw_username) if unicodedata.category(c) != 'Mn')

def main():
    config = load_config()
    num_words = config["num_words"]
    word_type = config["word_type"]
    lang = config["lang"]
    separator = config["separator"]
    
    save_requested = False
    args = sys.argv[1:]
    
    for arg in args:
        if arg == "save":
            save_requested = True
        elif arg.isdigit():
            num_words = int(arg)
        elif arg in ["noun", "adjective", "verb", "mixed"]:
            word_type = arg
        elif arg in ["en", "pt", "es", "no", "la", "de", "fr", "it", "pl", "nl"]:
            lang = arg
        elif arg.startswith("separator:"):
            separator = arg.split("separator:", 1)[1]
        elif arg in ["-h", "--help", "help"]:
            print("Username Generator")
            print("Usage: username [options]")
            print("\nOptions can be provided in any order:")
            print("  <number>           Number of words (e.g., '1', '3')")
            print("  adjective|noun|verb Type of words to use")
            print("  de|en|es|fr|it|la|nl|no|pl|pt Language code")
            print("  separator:<char>   Character to join words (e.g., 'separator:_')")
            print("  save               Save the provided options as the new default")
            print("\nExamples:")
            print("  username 3 pt save")
            print("  username noun separator:_")
            sys.exit(0)
        else:
            print(f"Warning: Unknown argument '{arg}', ignoring.")
            
    if save_requested:
        config["num_words"] = num_words
        config["word_type"] = word_type
        config["lang"] = lang
        config["separator"] = separator
        save_config(config)
        print(f"[Settings saved as default: {num_words} words, {word_type}, {lang}, separator '{separator}']")
        
    username = generate_username(num_words, word_type, lang, separator)
    print(username)

if __name__ == "__main__":
    main()
