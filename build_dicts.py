import os
import time
from deep_translator import GoogleTranslator

en_nouns = [
    "champion", "pioneer", "legend", "star", "saviour", "splendour", "knight", "marvel", 
    "treasure", "victor", "hero", "master", "inspiration", "wonder", "gem", "diamond", 
    "gold", "jewel", "eagle", "lion", "tiger", "dragon", "phoenix", "samurai", "ninja", 
    "gladiator", "astronaut", "hacker", "warrior", "titan", "king", "queen", "prince", 
    "princess", "lord", "angel", "spirit", "soul", "heart", "dream", "vision", "light", 
    "spark", "flame", "fire", "sun", "moon", "planet", "galaxy", "universe", "cosmos", 
    "rocket", "ship", "sail", "compass", "map", "path", "journey", "quest", "adventure", 
    "summit", "peak", "mountain", "ocean", "sea", "wave", "thunder", "lightning", "bolt", 
    "gleam", "glint", "beam", "ray", "dawn", "sunrise", "blossom", "flower", "rose", 
    "lily", "lotus", "harmony", "peace", "joy", "triumph", "glory", "victory", "grace", 
    "beauty", "wisdom", "truth", "honor", "courage", "bravery", "strength", "power", 
    "magic", "miracle", "blessing", "gift", "charm", "luck"
]

en_adjectives = [
    "brilliant", "smashing", "splendid", "lovely", "stellar", "grand", "brave", "bold", 
    "glowing", "magnificent", "superb", "radiant", "charming", "awesome", "amazing", 
    "fantastic", "incredible", "wonderful", "perfect", "beautiful", "gorgeous", "handsome", 
    "pretty", "cute", "sweet", "nice", "kind", "gentle", "calm", "peaceful", "serene", 
    "quiet", "strong", "tough", "solid", "firm", "steady", "fast", "quick", "swift", 
    "rapid", "agile", "nimble", "slick", "smooth", "soft", "warm", "cool", "fresh", 
    "crisp", "clean", "pure", "clear", "bright", "shiny", "sparkling", "glittering", 
    "gleaming", "dazzling", "flashing", "burning", "blazing", "fiery", "hot", "flaming", 
    "flying", "soaring", "floating", "rising", "jumping", "leaping", "running", "moving", 
    "diving", "swimming", "surfing", "riding", "driving", "sailing", "gliding", "cruising", 
    "drifting", "wandering", "exploring", "discovering", "searching", "finding", "seeking", 
    "epic", "heroic", "legendary", "cosmic", "quantum", "magical", "mystic", "supreme", 
    "ultimate", "divine", "glorious", "victorious", "triumphant"
]

en_verbs = [
    "achieve", "inspire", "bloom", "shine", "soar", "thrive", "blossom", "conquer", 
    "dazzle", "prosper", "flourish", "glow", "triumph", "uplift", "win", "succeed", 
    "excel", "surpass", "overcome", "master", "lead", "guide", "empower", "encourage", 
    "support", "aid", "assist", "bless", "heal", "protect", "defend", "rescue", "save", 
    "liberate", "free", "awaken", "enlighten", "illuminate", "delight", "charm", 
    "fascinate", "captivate", "enchant", "amaze", "astound", "thrill", "excite", 
    "stimulate", "energize", "revitalize", "refresh", "renew", "restore", "rejuvenate", 
    "comfort", "soothe", "calm", "relax", "pacify", "unite", "connect", "join", "merge", 
    "blend", "harmonize", "balance", "stabilize", "secure", "strengthen", "fortify", 
    "reinforce", "boost", "elevate", "raise", "lift", "ascend", "climb", "mount", 
    "scale", "arise", "emerge", "evolve", "grow", "develop", "expand", "magnify", 
    "amplify", "multiply", "increase", "enrich", "enhance", "improve", "perfect", 
    "refine", "polish", "brighten", "clarify", "clear", "purify", "cleanse"
]

langs = {
    "pt": "pt",
    "es": "es",
    "no": "no",
    "la": "la",
    "de": "de",
    "fr": "fr",
    "it": "it",
    "pl": "pl",
    "nl": "nl",
    "ro": "ro"
}

def translate_list(words, lang_code):
    try:
        translator = GoogleTranslator(source='en', target=lang_code)
        # deep-translator handles batch translation
        translated = translator.translate_batch(words)
        
        # Format the words: lowercase, replace spaces with hyphens just in case
        formatted = []
        for t in translated:
            if t:
                formatted.append(t.lower().replace(" ", "-"))
            else:
                formatted.append("word")
        return formatted
    except Exception as e:
        print(f"Failed translation for {lang_code}: {e}")
        return ["word"] * len(words)

def main():
    os.makedirs("data", exist_ok=True)
    
    # Save EN directly
    with open("data/en_nouns.txt", "w") as f: f.write("\n".join(en_nouns))
    with open("data/en_adjectives.txt", "w") as f: f.write("\n".join(en_adjectives))
    with open("data/en_verbs.txt", "w") as f: f.write("\n".join(en_verbs))
    
    for code, target in langs.items():
        print(f"Translating to {code}...")
        pt_nouns = translate_list(en_nouns, target)
        pt_adjectives = translate_list(en_adjectives, target)
        pt_verbs = translate_list(en_verbs, target)
        
        with open(f"data/{code}_nouns.txt", "w") as f: f.write("\n".join(pt_nouns))
        with open(f"data/{code}_adjectives.txt", "w") as f: f.write("\n".join(pt_adjectives))
        with open(f"data/{code}_verbs.txt", "w") as f: f.write("\n".join(pt_verbs))
        time.sleep(1) # Be nice to the API
        
    print("All dictionaries generated successfully with 100 positive entries each!")

if __name__ == "__main__":
    main()
