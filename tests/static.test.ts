// The page and the publishing set-up: the TypeScript rule (guard S-1), the TypeScript tooling, the
// _config.yml exclusions that keep sources, tooling and tests off the site, the one classic script
// tag and its cache stamp, what the compiled script.js may and may not contain, and the house style
// of the page text. Added on 24 October 2026 with the TypeScript move, on MoonApp's
// tests/static.test.ts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
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
  for (const x of ['ts/', 'tools/', 'tests/', 'node_modules/', 'package.json', 'package-lock.json', 'tsconfig.json', '.npmrc', 'bump_assets.py', 'README.md', 'DISCLAIMER.md', 'PRIVACY.md', 'LICENSE', 'NOTICE', 'android/', 'fastlane/', 'zapstore.yaml', 'username.py', 'build_dicts.py', 'build_dicts_robust.py']) {
    assert.ok(excluded.includes(x), `${x} is excluded`);
  }
  // The page fetches data/ at run time, and loads script.js, so neither may ever be excluded.
  for (const x of ['script.js', 'data/', 'index.html', 'style.css', 'footer.css', 'disclaimer.html', 'privacy.html', 'fonts/', 'switcher-icons/']) assert.ok(!excluded.includes(x), `${x} is published`);
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
  assert.deepEqual(ts.exclude, [], 'an explicit exclude: with outDir set to ".", tsc would otherwise exclude everything');
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
  // The temporary CommonJS marker for the two hand-written generators (decision D-2); part 2 deletes it.
  assert.deepEqual(JSON.parse(read('tools/package.json')), { type: 'commonjs' });
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
// ignored), is script.js, plus the two golden generators that are still hand-written JavaScript
// and are removed in part 2 of the move. script.js is marked linguist-generated, so GitHub's
// language bar counts none of it. A hand-written script anywhere else fails here.
test('the only JavaScript is compiled, apart from the two generators removed in part 2, and marked so (S-1)', (t) => {
  const root = new URL('../', import.meta.url);
  const git = (...args: string[]): string => execFileSync('git', ['-C', root.pathname, ...args], { encoding: 'utf8' });
  let inGit = false;
  try { inGit = git('rev-parse', '--is-inside-work-tree').trim() === 'true'; } catch { inGit = false; }
  if (!inGit) { t.skip('not a git checkout'); return; }
  const walk = (dir: string): string[] => readdirSync(new URL(dir, root)).flatMap((n) => (n.endsWith('.ts') ? [`${dir}${n}`] : /\./.test(n) ? [] : walk(`${dir}${n}/`)));
  const compiled = walk('ts/').filter((f) => !f.endsWith('.d.ts')).map((f) => f.replace(/^ts\//, '').replace(/\.ts$/, '.js')).sort();
  assert.deepEqual(compiled, ['script.js'], 'ts/ compiles to script.js');
  const removedInPart2 = ['tools/gen-sanitise-golden.js', 'tools/gen-strength-golden.js'];
  const allowed = [...compiled, ...removedInPart2].sort();
  const js = git('ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '*.js', '*.mjs', '*.cjs').split('\0').filter(Boolean);
  assert.deepEqual([...new Set(js)].sort(), allowed, 'JavaScript in the repository other than the compiled file and the two generators');
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
