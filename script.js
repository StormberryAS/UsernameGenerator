const outputBox = document.getElementById('output');
const generateBtn = document.getElementById('generateBtn');
const copyBtn = document.getElementById('copyBtn');

// Controls
const wordsInput = document.getElementById('words');
const typeInput = document.getElementById('type');
const langInput = document.getElementById('lang');
const separatorInput = document.getElementById('separator');

// Cache for dictionaries
const dictCache = {};

async function fetchDict(lang, type) {
    const key = `${lang}_${type}s`;
    if (dictCache[key]) return dictCache[key];

    try {
        const response = await fetch(`data/${key}.txt`);
        if (!response.ok) throw new Error('Dict not found');
        const text = await response.text();
        const words = text.split('\n').map(w => w.trim()).filter(w => w.length > 0);
        dictCache[key] = words;
        return words;
    } catch (e) {
        console.error(`Failed to load ${key}`, e);
        return ['error'];
    }
}

function getRandomWord(list) {
    return list[Math.floor(Math.random() * list.length)];
}

async function generateUsername() {
    outputBox.classList.add('loading');
    outputBox.textContent = 'Generating...';
    generateBtn.style.pointerEvents = 'none';

    const numWords = parseInt(wordsInput.value) || 2;
    const type = typeInput.value;
    const lang = langInput.value;
    const separator = separatorInput.value;

    let result = [];

    if (type === 'mixed') {
        if (numWords === 1) {
            const nouns = await fetchDict(lang, 'noun');
            result.push(getRandomWord(nouns));
        } else if (numWords === 2) {
            const adjs = await fetchDict(lang, 'adjective');
            const nouns = await fetchDict(lang, 'noun');
            result.push(getRandomWord(adjs));
            result.push(getRandomWord(nouns));
        } else {
            const verbs = await fetchDict(lang, 'verb');
            const adjs = await fetchDict(lang, 'adjective');
            const nouns = await fetchDict(lang, 'noun');
            for (let i = 0; i < numWords; i++) {
                if (i === 0) result.push(getRandomWord(verbs));
                else if (i === 1) result.push(getRandomWord(adjs));
                else result.push(getRandomWord(nouns));
            }
        }
    } else {
        const words = await fetchDict(lang, type);
        for (let i = 0; i < numWords; i++) {
            result.push(getRandomWord(words));
        }
    }

    let finalUsername = result.join(separator);
    finalUsername = finalUsername.normalize('NFD').replace(/[\u0300-\u036f]/g, "");
    
    // Simulate slight delay for effect
    setTimeout(() => {
        outputBox.classList.remove('loading');
        outputBox.textContent = finalUsername;
        generateBtn.style.pointerEvents = 'auto';
        
        // Pop animation
        outputBox.style.transform = 'scale(1.02)';
        setTimeout(() => outputBox.style.transform = 'scale(1)', 150);
    }, 300);
}

// Copy to clipboard
copyBtn.addEventListener('click', () => {
    if (outputBox.classList.contains('loading')) return;
    
    const text = outputBox.textContent;
    navigator.clipboard.writeText(text).then(() => {
        const originalColor = copyBtn.style.color;
        copyBtn.style.color = '#10b981'; // Green
        setTimeout(() => {
            copyBtn.style.color = originalColor;
        }, 1500);
    });
});

// Generate on click and enter
generateBtn.addEventListener('click', generateUsername);
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') generateUsername();
});

// Initial generation
window.addEventListener('DOMContentLoaded', generateUsername);
