#!/usr/bin/env bash
# Compile UsernameGenerator's TypeScript (ts/) into the JavaScript the page loads.
#
# Copied on 24 October 2026 from MoonApp's tools/build-ts.sh (itself from SunApp's, EclipseTracker's
# and the Website's, the TypeScript move of 2026-10-14). UsernameGenerator has what MoonApp has: one
# page script, ts/script.ts, which compiles to script.js at the repository root. No ES modules
# (index.html loads script.js as one classic script), no generated data step and no script injected
# into the Android app (the app is native Kotlin with no WebView). What it does not have yet, and
# MoonApp has: a second program for a service worker (a later part of this move adds it).
#
#   tools/build-ts.sh           install the pinned compiler, compile every ts/**/*.ts (the .d.ts
#                               declarations aside) into the .js of the same path at the repository
#                               root (ts/script.ts -> script.js), then run bump_assets.py so every
#                               page carries the current ?v= stamp
#   tools/build-ts.sh --force   the same, but overwrite a compiled .js even when it holds a hand edit
#   tools/build-ts.sh --check   change nothing: fail when a compiled .js is missing, is not tracked
#                               by git, or is not (stamps aside) byte for byte what ts/ compiles to;
#                               when the root holds a .js that no ts/ source compiles to (a stray
#                               left behind by a renamed or deleted source, which the site would
#                               still publish); when a page carries a stale ?v=; or when the two
#                               golden corpora the Android tests read, or the entropy model, are not
#                               what their generators write (tools/check-strength-parity.py)
#
# Every mode also type-checks the tests (tests/*.ts, run by Node 24 directly) with
# tests/tsconfig.json, strict; it writes nothing, and one that does not type-check fails the build
# and the check.
#
# The compiled .js file is committed on purpose: GitHub Pages publishes the repository's files as
# they are, with no build step of its own. Edit ts/*.ts, never the .js.
#
# Until part 2 of the move, tools/gen-sanitise-golden.js and tools/gen-strength-golden.js are still
# hand-written JavaScript (they become TypeScript there). They sit under tools/, not at the root,
# and tools/package.json marks that folder CommonJS so Node still runs them; both go in part 2.
#
# Stamps. script.js imports nothing and carries no ?v= stamp. normalise() strips a stamp from a
# relative URL inside compiled output (a ./x.js?v=0123abcd or ./x.css?v=0123abcd literal), as in
# EclipseTracker, so such a literal never counts as a difference; bump_assets.py --check proves the
# stamps in the pages themselves are current.
#
# Hand edits. A build never overwrites a compiled .js silently. It writes only when the .js now at
# the root, normalised, is one some ts/ source produced: what the committed ts/ (HEAD) compiles to,
# what the current ts/ compiles to, or what this script wrote last time (its record lives in the git
# directory, so it is never committed or published). Anything else is an edit made in the .js
# itself: the build stops and writes nothing. Port the edit into ts/ and build again, or rerun with
# --force to drop it. (The very first build after the move, when script.js was still the
# hand-written 12ddca5 file and HEAD had no ts/, needs --force for exactly this reason.)
#
# The compiler is the exact version in package-lock.json, installed with `npm ci` (a frozen install)
# and with install scripts off. Needs Node and npm (Node 24 on the Dell), python3, and git for the
# hand-edit guard and the tracked-file check (both are skipped outside a git checkout).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

case "$#:${1:-}" in
  0:)        MODE=build ;;
  1:--force) MODE=force ;;
  1:--check) MODE=check ;;
  *)         echo "usage: $0 [--check | --force]" >&2; exit 2 ;;
esac

die() { echo "build-ts: $*" >&2; exit 1; }
command -v node >/dev/null || die "node not found"
command -v npm >/dev/null || die "npm not found"
command -v python3 >/dev/null || die "python3 not found"
GIT=0
if command -v git >/dev/null && [ "$(git rev-parse --show-toplevel 2>/dev/null)" = "$ROOT" ]; then GIT=1; fi

npm ci --ignore-scripts --no-audit --no-fund --prefer-offline --loglevel=error >/dev/null \
  || die "npm ci failed (package.json and package-lock.json must agree; nothing was compiled)"
TSC=(node "$ROOT/node_modules/typescript/bin/tsc")
echo "build-ts: TypeScript $("${TSC[@]}" --version | sed 's/^Version //')"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# A relative URL with its ?v= stamp removed: from './x.js?v=0123abcd' to './x.js' (and .css alike).
normalise() { sed -E "s#(['\"]\\.{1,2}/[^'\"?]+\\.(js|css))\\?v=[0-9a-f]{8}(['\"])#\\1\\3#g" "$1"; }
nsha() { normalise "$1" | sha256sum | cut -d' ' -f1; }

"${TSC[@]}" -p "$ROOT/tests/tsconfig.json" || die "the tests (tests/*.ts) do not type-check; nothing was written"
"${TSC[@]}" -p "$ROOT/tsconfig.json" --outDir "$tmp/out" || die "ts/ does not compile; nothing was written"

mapfile -t OUTPUTS < <(cd "$tmp/out" && find . -type f -printf '%P\n' | LC_ALL=C sort)
mapfile -t EXPECTED < <(cd ts && find . -type f -name '*.ts' ! -name '*.d.ts' -printf '%P\n' | sed 's/\.ts$/.js/' | LC_ALL=C sort)
[ "${#OUTPUTS[@]}" -gt 0 ] || die "tsc emitted nothing"
[ "${OUTPUTS[*]}" = "${EXPECTED[*]}" ] \
  || die "tsc emitted [${OUTPUTS[*]}] but ts/ holds sources for [${EXPECTED[*]}]; look at tsconfig.json"

# The hand-written JavaScript that is still allowed until part 2 of the move: the two golden
# generators under tools/. Nothing else may sit beside the compiled file, at the root or in tools/.
HAND_WRITTEN=(tools/gen-sanitise-golden.js tools/gen-strength-golden.js)

tracked() { [ "$GIT" = 1 ] && git ls-files --error-unmatch -- "$1" >/dev/null 2>&1; }

if [ "$MODE" = check ]; then
  bad=0
  [ "$GIT" = 1 ] || echo "build-ts: not a git checkout; skipping the tracked-file check"
  for f in "${OUTPUTS[@]}"; do
    if [ ! -f "$f" ]; then
      echo "build-ts: $f is missing: run tools/build-ts.sh" >&2; bad=1
    elif [ "$(nsha "$f")" != "$(nsha "$tmp/out/$f")" ]; then
      echo "build-ts: $f is NOT what ts/ compiles to: edit ts/, then run tools/build-ts.sh" >&2; bad=1
    elif [ "$GIT" = 1 ] && ! tracked "$f"; then
      echo "build-ts: $f is what ts/ compiles to but is not tracked by git: git add it" >&2; bad=1
    else
      echo "build-ts: $f matches ts/"
    fi
  done
  # JavaScript with no source: only the compiled files, and the two tools named above.
  mapfile -t PRESENT < <(find . -path ./node_modules -prune -o -path ./android -prune -o -path ./.git -prune -o -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' \) -printf '%P\n' | LC_ALL=C sort)
  for f in "${PRESENT[@]}"; do
    case " ${OUTPUTS[*]} ${HAND_WRITTEN[*]} " in
      *" $f "*) ;;
      *) echo "build-ts: $f is JavaScript that no ts/ source compiles to: delete it (git rm), or restore its source" >&2; bad=1 ;;
    esac
  done
  python3 -I "$ROOT/bump_assets.py" --check || bad=1
  python3 -I "$ROOT/tools/check-strength-parity.py" || bad=1
  [ "$bad" = 0 ] || exit 1
  echo "build-ts: check passed"
  exit 0
fi

STATE=""
[ "$GIT" = 1 ] && STATE="$(git rev-parse --absolute-git-dir)/build-ts.last"

if [ "$MODE" = build ]; then
  if [ "$GIT" = 1 ] && git cat-file -e HEAD:tsconfig.json 2>/dev/null && git cat-file -e HEAD:ts 2>/dev/null; then
    mkdir -p "$tmp/head"
    git archive HEAD tsconfig.json ts | tar -x -C "$tmp/head"
    "${TSC[@]}" -p "$tmp/head/tsconfig.json" --outDir "$tmp/head-out" >/dev/null 2>&1 || true
  fi
  hand=()
  for f in "${OUTPUTS[@]}"; do
    [ -f "$f" ] || continue
    cur="$(nsha "$f")"
    [ "$cur" = "$(nsha "$tmp/out/$f")" ] && continue
    [ -f "$tmp/head-out/$f" ] && [ "$cur" = "$(nsha "$tmp/head-out/$f")" ] && continue
    [ -n "$STATE" ] && [ -f "$STATE" ] && grep -qxF "$cur  $f" "$STATE" && continue
    hand+=("$f")
  done
  if [ "${#hand[@]}" -gt 0 ]; then
    for f in "${hand[@]}"; do
      echo "build-ts: $f holds changes that no TypeScript source produced (edited by hand?)" >&2
    done
    die "nothing was written. Port the change into its TypeScript source (git diff and git log -p show it), then build again; or run tools/build-ts.sh --force to overwrite it."
  fi
fi

wrote=0
for f in "${OUTPUTS[@]}"; do
  if [ -f "$f" ] && [ "$(nsha "$f")" = "$(nsha "$tmp/out/$f")" ]; then continue; fi
  mkdir -p "$(dirname "$f")"
  cp "$tmp/out/$f" "$f"
  echo "build-ts: wrote $f"
  wrote=1
  if [ "$GIT" = 1 ] && ! tracked "$f"; then
    echo "build-ts: $f is new: git add it" >&2
  fi
done
[ "$wrote" = 1 ] || echo "build-ts: compiled output unchanged"
if [ -n "$STATE" ]; then
  for f in "${OUTPUTS[@]}"; do printf '%s  %s\n' "$(nsha "$f")" "$f"; done > "$STATE"
fi

# Always: bump_assets.py changes nothing when every stamp is current, and repairs a stale one even
# when the compiled output did not change.
python3 -I "$ROOT/bump_assets.py"
