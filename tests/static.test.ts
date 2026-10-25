// The page and the publishing set-up: the TypeScript rule (guard S-1), the TypeScript tooling, the
// _config.yml exclusions that keep sources, tooling and tests off the site, the one classic script
// tag and its cache stamp, what the compiled script.js may and may not contain, and the house style
// of the page text. Added on 24 October 2026 with the TypeScript move, on MoonApp's
// tests/static.test.ts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { defined } from './helpers.ts';

const read = (p: string): string => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const page = read('index.html');
const decode = (s: string): string => s.replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)));
const visible = decode(page.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' '));
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);

test('page text: no en or em dashes, no double hyphens, no exclamation marks; lang unchanged', () => {
  // Two things on the page are not prose. The em dash is the placeholder the strength readout shows
  // before the first figure arrives (written as &#8212; in index.html), and "--strip-components=1"
  // is a flag in the Linux install command of the terminal guide.
  assert.equal(page.split('<span class="strength-bits" id="strengthBits">&#8212;</span>').length, 2, 'the placeholder is there once');
  assert.equal(visible.split(EM_DASH).length, 2, 'and it is the only em dash');
  const rest = visible.replace(EM_DASH, '').replace('--strip-components=1', '');
  assert.ok(!rest.includes(EM_DASH) && !rest.includes(EN_DASH), 'no en or em dash in the page text');
  assert.doesNotMatch(rest, /--/);
  assert.doesNotMatch(rest, /!/);
  assert.match(page, /<html lang="en">/);
});

test('the page loads one classic script, script.js, last in the body, stamped', () => {
  const scripts = [...page.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
  assert.deepEqual(scripts.map((s) => s.replace(/\?v=[0-9a-f]{8}/, '?v=STAMP')), ['<script src="script.js?v=STAMP">']);
  assert.ok(page.indexOf('src="script.js') > page.indexOf('<body'));
  assert.ok(page.indexOf('src="script.js') < page.indexOf('</body>'));
  assert.equal(page.slice(page.indexOf('</script>') + '</script>'.length).replace(/\s+/g, ''), '</body></html>', 'nothing follows the script but the end of the page');
  assert.doesNotMatch(page, /type="module"/);
  assert.doesNotMatch(page, /src="ts\//);
});

test('every local script and stylesheet carries the ?v= stamp of its current bytes', () => {
  const refs = [...page.matchAll(/(?:src|href)="((?!https?:|\/\/|data:|#|mailto:)[^"?#]+\.(?:js|css))(\?v=[^"]*)?"/g)];
  assert.equal(refs.length, 4, 'inter.css, style.css, footer.css and script.js');
  for (const m of refs) {
    const path = defined(m[1], 'the path');
    const want = createHash('sha256').update(readFileSync(new URL(`../${path}`, import.meta.url))).digest('hex').slice(0, 8);
    assert.equal(m[2], `?v=${want}`, `${path} is stamped with its own hash`);
  }
});

test('_config.yml keeps sources, tooling and tests off the site, and publishes the app', () => {
  const cfg = read('_config.yml');
  const excluded = [...cfg.matchAll(/^ {2}- (\S+)$/gm)].map((m) => m[1]);
  for (const x of ['ts/', 'tools/', 'tests/', 'node_modules/', 'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.sw.json', '.npmrc', 'bump_assets.py', 'README.md', 'DISCLAIMER.md', 'PRIVACY.md', 'LICENSE', 'NOTICE', 'android/', 'fastlane/', 'zapstore.yaml', 'username.py', 'build_dicts.py', 'build_dicts_robust.py']) {
    assert.ok(excluded.includes(x), `${x} is excluded`);
  }
  // The page fetches data/ at run time, and loads script.js, so neither may ever be excluded.
  for (const x of ['script.js', 'sw.js', 'data/', 'index.html', 'style.css', 'footer.css', 'disclaimer.html', 'privacy.html', 'fonts/', 'switcher-icons/']) assert.ok(!excluded.includes(x), `${x} is published`);
  // Gone with the move: nothing may still point at them.
  for (const x of ['jsconfig.json', 'types/']) assert.ok(!excluded.includes(x), `${x} no longer exists`);
});

test('the TypeScript set-up follows MoonApp: TypeScript 6.0.3 pinned, strict, a classic script', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.deepEqual(pkg.devDependencies, { '@types/node': '24.19.2', typescript: '6.0.3' });
  assert.equal(pkg.dependencies, undefined, 'no runtime dependency');
  assert.deepEqual(pkg.engines, { node: '>=24' });
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.private, true);
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(lock.packages['node_modules/typescript'].version, '6.0.3');
  assert.equal(lock.packages['node_modules/@types/node'].version, '24.19.2');
  assert.deepEqual(Object.keys(lock.packages).filter((k) => k !== '').sort(), ['node_modules/@types/node', 'node_modules/typescript', 'node_modules/undici-types']);
  for (const [k, v] of Object.entries(lock.packages as Record<string, { integrity?: string; hasInstallScript?: boolean }>)) {
    if (k === '') continue;
    assert.match(v.integrity ?? '', /^sha512-/, `${k} is pinned by its integrity hash`);
    assert.notEqual(v.hasInstallScript, true, `${k} has no install script`);
  }
  assert.match(read('.npmrc'), /^ignore-scripts=true$/m);
  assert.match(read('.npmrc'), /^save-exact=true$/m);
  const ts = JSON.parse(read('tsconfig.json'));
  for (const k of ['strict', 'noUnusedLocals', 'noUnusedParameters', 'noImplicitReturns', 'noFallthroughCasesInSwitch', 'noUncheckedIndexedAccess', 'verbatimModuleSyntax', 'removeComments', 'noEmitOnError']) {
    assert.equal(ts.compilerOptions[k], true, `tsconfig.json ${k}`);
  }
  assert.equal(ts.compilerOptions.rootDir, 'ts');
  assert.equal(ts.compilerOptions.outDir, '.');
  assert.equal(ts.compilerOptions.module, 'ES2020');
  assert.equal(ts.compilerOptions.target, 'ES2020');
  assert.deepEqual(ts.include, ['ts/**/*.ts']);
  assert.deepEqual(ts.exclude, ['ts/sw.ts'], 'an explicit exclude: with outDir set to ".", tsc would otherwise exclude everything; the worker is a second program (tsconfig.sw.json)');
  assert.match(read('.gitignore'), /^node_modules\/$/m);
  // script.ts is a classic script: no import or export, so tsc emits a script and index.html keeps
  // loading script.js without type="module" (decision D-1).
  assert.doesNotMatch(read('ts/script.ts'), /^\s*(import|export)\b/m);
  const js = read('script.js');
  assert.match(js, /^"use strict";\n\/\*! UsernameGenerator page script\. Compiled from ts\/script\.ts by tools\/build-ts\.sh; edit the TypeScript, not this file\. \*\/\n/);
  assert.doesNotMatch(js, /^\s*(import|export)\b/m);
  // The tests are TypeScript, run by Node 24 directly and type-checked strictly.
  const tests = JSON.parse(read('tests/tsconfig.json'));
  for (const k of ['strict', 'noUncheckedIndexedAccess', 'erasableSyntaxOnly', 'verbatimModuleSyntax', 'noEmit']) assert.equal(tests.compilerOptions[k], true, `tests/tsconfig.json ${k}`);
  assert.deepEqual(tests.compilerOptions.types, ['node'], 'Node is typed by @types/node');
  // The DOM library is there for the code that runs in the browser (typed functions sent with
  // inPage, tests/cdp.ts), which the strict check then reads like the rest.
  assert.deepEqual(tests.compilerOptions.lib, ['ES2023', 'DOM', 'DOM.Iterable'], 'the DOM library types the in-page functions');
  assert.match(read('tools/build-ts.sh'), /tests\/tsconfig\.json/);
  assert.deepEqual(readdirSync(new URL('./', import.meta.url)).filter((n) => /\.(m?js|cjs)$/.test(n)), [], 'no JavaScript left in tests/');
  // The golden generators are TypeScript too, type-checked with the tests, and nothing under tools/
  // marks the folder CommonJS any more (the temporary tools/package.json of decision D-2 is gone).
  assert.ok(tests.include.includes('../tools/*.ts'), 'tests/tsconfig.json type-checks tools/*.ts');
  const tools = readdirSync(new URL('../tools/', import.meta.url));
  for (const f of ['gen-sanitise-golden.ts', 'gen-strength-golden.ts']) assert.ok(tools.includes(f), `tools/${f} exists`);
  assert.deepEqual(tools.filter((n) => /\.(m?js|cjs)$/.test(n) || n === 'package.json'), [], 'no JavaScript and no package.json under tools/');
});

test('script.js uses the platform CSPRNG, no storage, and reaches only its own data files', () => {
  const js = read('script.js');
  assert.match(js, /crypto\.getRandomValues\(/);
  assert.doesNotMatch(js, /Math\.random/, 'never the predictable generator (R-4)');
  assert.doesNotMatch(js, /localStorage|sessionStorage|indexedDB|document\.cookie|XMLHttpRequest|navigator\.sendBeacon|WebSocket|\beval\(|new Function/);
  const fetches = [...js.matchAll(/\bfetch\(([^)]*)\)/g)].map((m) => m[1]);
  assert.deepEqual(fetches, ['`data/${key}.txt`', "'data/entropy-model.tsv'"], 'two same-origin fetches');
});

// S-1 (24 October 2026, as MoonApp's of 22 October): the only JavaScript in the repository is
// compiled output. Every .js, .mjs and .cjs that git tracks, or would pick up (untracked and not
// ignored), is script.js, the compiled page, or sw.js, the compiled service worker of the offline
// pilot. (Until part 2 of the move the two golden generators under tools/ were hand-written
// JavaScript and were named here; they are TypeScript now.) Both files are marked
// linguist-generated, so GitHub's language bar counts none of it. A hand-written script anywhere
// else fails here.
test('the only JavaScript is the compiled script.js and sw.js, and they are marked so (S-1)', (t) => {
  const root = new URL('../', import.meta.url);
  const git = (...args: string[]): string => execFileSync('git', ['-C', root.pathname, ...args], { encoding: 'utf8' });
  let inGit = false;
  try { inGit = git('rev-parse', '--is-inside-work-tree').trim() === 'true'; } catch { inGit = false; }
  if (!inGit) { t.skip('not a git checkout'); return; }
  const walk = (dir: string): string[] => readdirSync(new URL(dir, root)).flatMap((n) => (n.endsWith('.ts') ? [`${dir}${n}`] : /\./.test(n) ? [] : walk(`${dir}${n}/`)));
  const compiled = walk('ts/').filter((f) => !f.endsWith('.d.ts')).map((f) => f.replace(/^ts\//, '').replace(/\.ts$/, '.js')).sort();
  assert.deepEqual(compiled, ['script.js', 'sw.js'], 'ts/ compiles to script.js and sw.js');
  const allowed = [...compiled].sort();
  const js = git('ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '*.js', '*.mjs', '*.cjs').split('\0').filter(Boolean);
  assert.deepEqual([...new Set(js)].sort(), allowed, 'JavaScript in the repository other than the compiled file');
  const attr = (name: string, files: string[]): Map<string, string> => {
    const out = git('check-attr', '-z', name, '--', ...files).split('\0');
    const m = new Map<string, string>();
    for (let i = 0; i + 2 < out.length; i += 3) m.set(defined(out[i], 'path'), defined(out[i + 2], 'value'));
    return m;
  };
  const generated = [...compiled, 'android/app/src/test/resources/strength-golden.tsv', 'android/app/src/test/resources/sanitise-golden.csv', 'data/entropy-model.tsv', 'tests/page-vectors.json'];
  const marks = attr('linguist-generated', generated);
  for (const f of generated) assert.equal(marks.get(f), 'true', `${f} is linguist-generated`);
});

test('no page code is written inside a string: tests call the page through fn()', () => {
  // A string handed to the page's vm (tests/load.ts run()) is JavaScript that the strict check
  // never reads. run() is kept for reading a value or a one-call expression; anything with a
  // statement, a block or a function in it belongs in TypeScript, calling page.fn('name').
  const files = readdirSync(new URL('./', import.meta.url)).filter((n) => n.endsWith('.ts') && n !== 'load.ts').map((n) => `tests/${n}`);
  const bad: string[] = [];
  for (const f of files) {
    for (const m of read(f).matchAll(/\.run(?:<[^()]*?>)?\((`[^`]*`|'[^']*'|"[^"]*")/g)) {
      const code = defined(m[1], 'the string').replace(/\$\{[^}]*\}/g, '0');
      if (/=>|;|[{}]|\bfunction\b/.test(code)) bad.push(`${f}: ${code.slice(0, 60)}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('no page code is written inside a string: the browser is driven by typed functions (inPage)', () => {
  // Code that runs in the page is a typed TypeScript function sent with inPage() / p.run() /
  // p.until() (tests/cdp.ts), so the strict check reads it and the "In TS" rule holds for it too.
  // A string literal or template handed to ev(), waitFor(), a Runtime.evaluate expression, a
  // Page.addScriptToEvaluateOnNewDocument source or an init option is hand-written JavaScript.
  const files = readdirSync(new URL('./', import.meta.url)).filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts')).map((n) => `tests/${n}`);
  const bad: string[] = [];
  const quoted = /(?:\.ev|\.waitFor|\bev|\bwaitFor)\(\s*(?:`|'|")|\b(?:expression|source|init)\s*:\s*(?:`|'|")/g;
  for (const f of files) {
    const lines = read(f).split('\n');
    lines.forEach((line, i) => { if (!/^\s*(\/\/|\*)/.test(line) && quoted.test(line)) bad.push(`${f}:${i + 1}: ${line.trim().slice(0, 70)}`); quoted.lastIndex = 0; });
  }
  assert.deepEqual(bad, []);
});

// The offline pilot (ported 24 October 2026 from MoonApp cba61dd, itself from SunApp 88f59d4): ts/sw.ts, compiled to sw.js,
// registered by offlinePilot() in ts/script.ts on https://username.stormberry.as only. tests/sw-smoke.ts runs it in Chromium.
const listed = (src: string): string[] => {
  const m = /const ASSETS(?:: readonly string\[\])? = \[([\s\S]*?)\];/.exec(src);
  return [...defined(m?.[1], 'the ASSETS list').matchAll(/'([^']*)'/g)].map((x) => defined(x[1], 'an entry'));
};
const stampOfFile = (path: string): string => createHash('sha256').update(readFileSync(new URL(`../${path}`, import.meta.url))).digest('hex').slice(0, 8);
const FONTS = ['./fonts/inter/InterVariable.woff2', './fonts/inter/InterVariable-Italic.woff2'];
const PAGES = ['index.html', 'disclaimer.html', 'privacy.html'];

test('offline pilot: sw.js stores exactly what the pages load, under the stamps the pages use', () => {
  const assets = listed(read('sw.js'));
  // ts/sw.ts holds the same list without stamps; bump_assets.py writes them into sw.js.
  assert.deepEqual(listed(read('ts/sw.ts')), assets.map((a) => a.replace(/\?v=[0-9a-f]{8}$/, '')));
  assert.equal(new Set(assets).size, assets.length, 'no entry twice');
  // Every script and stylesheet the three pages load, with the stamp they load it under.
  const pageRefs = new Set<string>();
  for (const html of PAGES) {
    for (const m of read(html).matchAll(/(?:src|href)="((?!https?:|\/\/|data:|#|mailto:)[^"?#]+\.(?:js|css)\?v=[0-9a-f]{8})"/g)) pageRefs.add(`./${m[1]}`);
  }
  assert.deepEqual(assets.filter((a) => /\?v=/.test(a)).sort(), [...pageRefs].sort());
  for (const a of assets) {
    const m = /^\.\/([^?]*)(?:\?v=([0-9a-f]{8}))?$/.exec(a);
    assert.ok(m, `${a} is a relative path`);
    const path = defined(m[1], 'path') || 'index.html';
    assert.ok(existsSync(new URL(`../${path}`, import.meta.url)), `${a} exists`);
    if (m[2]) assert.equal(m[2], stampOfFile(path), `${a} carries the hash of ${path}`);
    if (/\.(js|css)$/.test(path)) assert.ok(m[2], `${a} is stamped`);
  }
  // The rest: the page itself, the two Inter faces the pages request, the favicon, the two other
  // pages, every word list and the entropy model (script.js fetches them at run time: the mixed
  // language setting needs all 33, and the strength readout needs the model) and every carousel icon.
  const names = (dir: string, ext: string): string[] => readdirSync(new URL(`../${dir}/`, import.meta.url)).filter((n) => n.endsWith(ext)).sort().map((n) => `./${dir}/${n}`);
  const words = names('data', '.txt');
  assert.equal(words.length, 33, 'eleven languages, three word types');
  assert.deepEqual(assets.filter((a) => !/\?v=/.test(a)), ['./', ...FONTS, './favicon.svg', './privacy.html', './disclaimer.html', ...words, './data/entropy-model.tsv', ...names('switcher-icons', '.svg')]);
  // Measured on 24 October 2026 with the network log of all three pages in Chromium: the generator asks
  // for InterVariable.woff2 only, the privacy page and the disclaimer for it and the italic.
  for (const f of FONTS) assert.match(read('fonts/inter/inter.css'), new RegExp(`url\\("${f.split('/').pop()}"\\)`), `${f} is the one inter.css asks for`);
  // The Home Screen icon (12ddca5) is linked by every page but deliberately not stored: iOS fetches
  // it online when the page is added, and precaching is all or nothing, so a listed file that went
  // missing would fail every install.
  for (const html of PAGES) {
    assert.match(read(html), /<link rel="apple-touch-icon" href="apple-touch-icon\.png" \/>/, `${html} links the Home Screen icon`);
  }
  assert.ok(!assets.some((a) => a.includes('apple-touch-icon')), 'the Home Screen icon is not precached');
});

// The worker's precache and keepPage() treat every ?v= reference in a stored page as a same-origin
// script or stylesheet it must hold (fix round 2, verify 1 offline C-4): an absolute or other kind
// of ?v= reference would make every install fail without a word, so it fails here instead.
test('offline pilot: every ?v= reference in the stored pages is a relative .js or .css path', () => {
  for (const html of PAGES) {
    const refs = [...read(html).matchAll(/(?:src|href)="([^"]*\?v=[^"]*)"/g)].map((m) => defined(m[1], 'a reference'));
    assert.ok(refs.length > 0, `${html} has stamped references`);
    for (const r of refs) assert.match(r, /^(?![a-z][a-z0-9+.-]*:|\/)[^"?#]+\.(?:js|css)\?v=[0-9a-f]{8}$/, `${html}: ${r}`);
  }
});

test('offline pilot: registered only on https://username.stormberry.as; no manifest, no theme colour', () => {
  const app = read('ts/script.ts');
  assert.match(app, /if \(location\.protocol !== 'https:' \|\| location\.hostname !== 'username\.stormberry\.as'\) return;/);
  // A bare 'sw.js', never './sw.js': the worker's address has to stay the same for the browser to
  // update it in place, and the './x.js' form is the one bump_assets.py stamps in sw.js.
  assert.match(app, /sw\.register\('sw\.js', \{ scope: '\.\/', updateViaCache: 'none' \}\)/);
  assert.match(app, /^const OFFLINE_PILOT = '(off|opt-in|on)' as 'off' \| 'opt-in' \| 'on';$/m);
  assert.match(app, /^ {4}try \{ offlinePilot\(\); \} catch \{/m);
  assert.match(read('ts/sw.ts'), /^const KILL = (true|false) as boolean;$/m);
  for (const html of PAGES) {
    const text = read(html);
    assert.doesNotMatch(text, /rel="manifest"/, `${html} has no manifest (it would let Chrome on Android offer an install that competes with Zapstore)`);
    assert.doesNotMatch(text, /name="theme-color"/, `${html} has no theme colour`);
    assert.doesNotMatch(text, /sw\.js/, `${html} does not load the worker as a script`);
  }
  // The page itself keeps nothing (the first test above), but a visitor who opts in to the offline pilot
  // gets a stored copy, so both privacy texts say "no local storage" only with that exception (DRAFT for Marcos).
  for (const f of ['privacy.html', 'PRIVACY.md']) {
    assert.match(read(f).replace(/\s+/g, ' '), /no local storage \(unless you choose the offline option/i, `${f} names the offline option as the exception to "no local storage"`);
  }
  // The website footer carries the Android footer's texts word for word (Marcos, 2026-10-24: "keep web
  // versions and APKs consistent"); FooterWebParityTest checks the same against FooterContent.kt.
  // Two lines are the exception (Marcos, 2026-10-25, option B): the permission line and the privacy
  // line say what is true of a web page, and the app keeps its own wording for them.
  // The footer credits the one project the word lists were built with, with a link to its source and to
  // its licence (Apache 2.0, as the Android footer says). Icons, fonts and languages go in NOTICE and the README only.
  const credit = /<div class="footer-powered">\s*<p>([\s\S]*?)<\/p>/.exec(page)?.[1] ?? '';
  assert.equal(
    credit.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '\u00a0'),
    'Runs entirely on your device: our own code and word lists built with Deep-Translator (Apache\u00a02.0) and reviewed by native speakers. Nothing is sent.',
    'the credit sentence is the Android footer\'s, word for word',
  );
  assert.match(credit, /built with <a href="https:\/\/github\.com\/nidhaloff\/deep-translator"[^>]*>Deep-Translator<\/a> \(<a href="https:\/\/github\.com\/nidhaloff\/deep-translator\/blob\/master\/LICENSE"[^>]*>Apache&nbsp;2\.0<\/a>\) and reviewed by native speakers\./, 'the credit names Deep-Translator and its licence, each linked');
  assert.doesNotMatch(credit, /Inter|Lucide|Kotlin|TypeScript|Material|Jetpack/, 'no icon, font or language credit in the footer');
  for (const [cls, text] of [
    ['footer-tagline', 'Smarter sales. Global culture. AI-driven strategy.'],
    ['footer-privacy', 'Privacy First: We do not collect cookies or personal data.'],
    ['footer-dated', 'Word lists dated 2026-08-22'],
    ['footer-ai', 'Proudly powered by sovereign AI agents.'],
    // The two web versions, approved as written.
    ['footer-offline', 'Your usernames and settings never leave this browser.'],
    ['footer-permissions', 'No cookies. No tracking. Every username is generated in your browser.'],
  ]) {
    assert.ok(page.includes(`<p class="${cls}">${text}</p>`), `the footer line .${cls} is the approved wording, word for word`);
  }
  // The shared lines equal the app's constants; the app's own two lines stay as they are.
  const kt = read('android/app/src/main/kotlin/no/stormberry/usernamegenerator/ui/components/FooterContent.kt');
  const ktConst = (name: string): string => new RegExp(`const val ${name} = "([^"]*)"`).exec(kt)?.[1] ?? '';
  assert.equal(ktConst('TAGLINE'), 'Smarter sales. Global culture. AI-driven strategy.');
  assert.equal(ktConst('PRIVACY_FIRST'), 'Privacy First: We do not collect cookies or personal data.');
  assert.equal(ktConst('AI'), 'Proudly powered by sovereign AI agents.');
  assert.equal(ktConst('OFFLINE'), 'Your usernames and settings never leave this device. Disconnect and try it.', 'the app keeps its own privacy line');
  assert.equal(ktConst('PERMISSIONS'), 'No permissions. No network. No tracking.', 'the app keeps its own permission line');
  for (const [cls, name] of [['footer-tagline', 'TAGLINE'], ['footer-privacy', 'PRIVACY_FIRST'], ['footer-ai', 'AI']] as const) {
    assert.ok(page.includes(`<p class="${cls}">${ktConst(name)}</p>`), `.${cls} equals the app's ${name}, word for word`);
  }
  for (const f of ['index.html', 'privacy.html', 'disclaimer.html']) {
    assert.ok(read(f).includes('>Org.nr.&nbsp;NO&nbsp;937&nbsp;751&nbsp;249</a>'), `${f}: the company line has the Android footer's unbreakable Org.nr.`);
  }
  // The worker is checked as a worker: no DOM, the WebWorker library, and kept out of the page program.
  const swc = JSON.parse(read('tsconfig.sw.json'));
  assert.equal(swc.extends, './tsconfig.json');
  assert.deepEqual(swc.compilerOptions.lib, ['ES2020', 'WebWorker']);
  assert.deepEqual(swc.include, ['ts/sw.ts']);
  assert.deepEqual(JSON.parse(read('tsconfig.json')).exclude, ['ts/sw.ts']);
  assert.match(read('tools/build-ts.sh'), /tsconfig\.sw\.json/);
});
