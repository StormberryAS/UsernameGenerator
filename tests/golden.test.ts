// The parity contracts with the Android port and the command line: the two golden corpora the
// Kotlin tests read are what the generators write from the compiled script.js, and
// tools/check-strength-parity.py still finds the three implementations of the strength readout in
// agreement. Added on 24 October 2026 with the TypeScript move.
//
// The generators and the parity script write into the repository they sit in, so each is run on a
// throwaway copy of exactly the files it reads, and the copy is compared with what is committed.
// Nothing here writes to the working tree. The two generators are still JavaScript until part 2 of
// the move.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const STRENGTH = 'android/app/src/test/resources/strength-golden.tsv';
const SANITISE = 'android/app/src/test/resources/sanitise-golden.csv';
const ENGINE = 'android/app/src/main/kotlin/no/stormberry/usernamegenerator/UsernameEngine.kt';

/** A copy of what the generators and the parity script read, in a folder of its own. */
function copyOfRepository(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ug-golden-'));
  for (const f of ['script.js', 'username.py', 'data', 'tools', STRENGTH, SANITISE, ENGINE]) {
    mkdirSync(join(dir, f, '..'), { recursive: true });
    cpSync(join(root, f), join(dir, f), { recursive: true });
  }
  return dir;
}

test('the two golden corpora are byte for byte what the generators write from script.js', () => {
  const dir = copyOfRepository();
  try {
    // Start from something else, so a generator that wrote nothing could not pass.
    for (const f of [STRENGTH, SANITISE]) rmSync(join(dir, f));
    const sanitise = execFileSync(process.execPath, [join(dir, 'tools/gen-sanitise-golden.js')], { encoding: 'utf8' });
    assert.match(sanitise, /59 rows, 38 distinct non-ASCII characters/);
    assert.match(sanitise, /rows whose OUTPUT is still non-ASCII: 0/);
    const strength = execFileSync(process.execPath, [join(dir, 'tools/gen-strength-golden.js')], { encoding: 'utf8' });
    assert.match(strength, /^4684 rows -> /);
    assert.match(strength, /max entropy: mix \+ verb \+ 5 words \+ 5 digits \+ mix separators = 148\.5 bits/);
    for (const f of [STRENGTH, SANITISE]) {
      assert.ok(readFileSync(join(dir, f)).equals(readFileSync(join(root, f))), `${f} is what its generator writes`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the strength readout agrees across script.js, username.py and the corpus the Kotlin test reads', () => {
  const dir = copyOfRepository();
  try {
    const out = execFileSync('python3', ['-I', join(dir, 'tools/check-strength-parity.py')], { encoding: 'utf8' });
    assert.match(out, /^OK: 4684 rows agree across script\.js, username\.py and the corpus/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
