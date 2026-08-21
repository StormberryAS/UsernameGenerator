# UsernameGenerator for Android

The native Android build of [username.stormberry.as](https://username.stormberry.as). Same engine, same word lists, no WebView and no network access of its own.

**Zero permissions.** Not "only the clipboard permission": genuinely none. Writing to the clipboard has never required a manifest permission on any version of Android, and everything else runs on word lists compiled into the APK. You can check this yourself before you install:

```bash
aapt dump permissions UsernameGenerator-1.0.1.apk
```

The only line you should see is the package name. If anything else appears, do not install it.

The footer links to stormberry.as. That is a hand-off, not a network call: the app fires an `ACTION_VIEW` intent and whichever browser you already have decides what to do with it. Nothing is fetched in this process, and `INTERNET` is still stripped from the merged manifest.

## Install

The app is not on Google Play. Download the APK from [Releases](https://github.com/StormberryAS/UsernameGenerator/releases), then either:

- **On the phone:** tap the downloaded file. Android will ask you to allow installs from whichever app is doing the installing (browser or file manager). That toggle lives at *Settings, Apps, Special app access, Install unknown apps*. Play Protect may warn about an app it has not seen before; that is expected for a small independent release.
- **Over USB:** `adb install UsernameGenerator-1.0.1.apk`. Cleaner, and it avoids the per-source permission entirely.

Requires Android 7.0 (API 24) or newer.

### Verify what you downloaded

Two independent checks, and they answer different questions.

**Who built it.** Every release is signed with the same key. The certificate fingerprint never changes, and Android itself enforces that continuity on every later update:

```bash
apksigner verify --print-certs UsernameGenerator-1.0.1.apk
```

```
Signer #1 certificate DN: CN=Stormberry AS, OU=Stormberry Labs, O=Stormberry AS, L=Bergen, ST=Vestland, C=NO
Signer #1 certificate SHA-256 digest: 37d0be029cbdbd019de799617a3b33cb7a522794faff8196c072bfdb8f2e75e8
```

Do not use `jarsigner` or `keytool -printcert -jarfile` for this. They only understand v1 JAR signing, which these APKs deliberately do not carry, so they will tell you nothing useful.

**Where it came from.** Releases are built by GitHub Actions and carry a provenance attestation, so you can confirm the binary came out of this repository rather than someone's laptop:

```bash
gh attestation verify UsernameGenerator-1.0.1.apk -R StormberryAS/UsernameGenerator
```

A `.sha256` file ships alongside each APK too, but be clear about what it buys: it proves the bytes you downloaded are the bytes that were uploaded. It does not prove authorship, because anyone who could swap the APK could swap the checksum next to it. The certificate and the attestation are the real anchors.

## What it does

Ports the web app's engine exactly, so all three implementations (web, Python CLI, Android) produce the same shapes from the same dictionaries.

- **11 languages**: English, Norsk, Português, Español, Deutsch, Français, Italiano, Nederlands, Polski, Română, Latina. About 100 curated positive words per category per language.
- **Word count** 1 to 5, **type** mixed / adjectives / nouns / verbs, **separator** none / `-` / `_` / `.`.
- **Mixed** follows the web app: one word is a noun, two are adjective plus noun, three or more open with a verb, then an adjective, then nouns.
- Accents are stripped after generation (`condução` becomes `conducao`) so the result is accepted everywhere.
- Tap the card or the copy icon to copy. Recent generations are kept in memory for the session and are tappable too.

One deliberate difference from the web version: randomness comes from `SecureRandom` rather than `Math.random()`. People generate usernames to keep identities apart, and a predictable PRNG quietly undermines that.

## Build it yourself

```bash
cd android
./gradlew :app:assembleDebug
```

The debug build needs no signing credentials. The word lists are copied out of the repo's `data/` directory at build time, so there is exactly one source of truth for them.

### Toolchain

Pinned deliberately in `gradle/libs.versions.toml`. These versions are load-bearing, so read this before bumping anything.

| Component | Version | Why this one |
|---|---|---|
| JDK | 21 | AGP 9.3's minimum and default is 17. Nothing above 21 is validated by Google, and builds on JDK 25 fail |
| Gradle | 9.5.0 | AGP 9.3's minimum *and* default |
| AGP | 9.3.1 | Latest stable |
| Kotlin | 2.2.10 | Not a free choice: AGP 9.0+ has built-in Kotlin and 9.3.1 bundles exactly this. Do not apply `org.jetbrains.kotlin.android`, it now fails the build |
| Compose compiler plugin | 2.2.10 | Must equal the Kotlin version in use |
| Compose BOM | 2026.06.01 | Maps to Material 3 1.4.0 |
| compileSdk | 37.1 | Forced by androidx: core-ktx 1.19.0 and lifecycle 2.11.0 require API 37+ |
| targetSdk | 36 | What Google Play requires for new apps from 31 August 2026. API 37 opts into runtime behaviour this app has not been tested against |
| minSdk | 24 | Android 7.0. Also why v1 JAR signing is off; v2 covers everything from 7.0 |

### Signing

The keystore never enters this repository and never enters the Obsidian vault.

- **Locally:** `android/keystore.properties` (gitignored) points at a keystore held outside the repo tree entirely, with passwords read from the system keyring. Without it, `assembleDebug` still works and `assembleRelease` produces an unsigned APK rather than failing.
- **In CI:** four repository secrets, `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`. The keystore is decoded into `$RUNNER_TEMP`, outside the workspace, and shredded in an `always()` step.

Signature schemes are pinned explicitly (v2 and v3 on, v1 and v4 off) because AGP documents their defaults only as "if null, a default value is used", which means an AGP upgrade could silently change what the APK carries.

### Releasing

```bash
git tag android-v1.0.1
git push origin android-v1.0.1
```

`.github/workflows/android-release.yml` then builds, lints, **fails the release if the APK declares any permission**, attests provenance and publishes to GitHub Releases.

## Known limits

- Dark theme only. The Stormberry palette has no light variant yet.
- Recent generations live in memory for the session and are not written to disk. That is deliberate; a persisted list of the identities you generated is exactly the file you would not want on the device.
- Instrumentation tests are still absent. There ARE JVM unit tests (`./gradlew :app:testDebugUnitTest`) covering the sanitiser against the exact table `username.py` and `script.js` are also checked against, so the three implementations cannot silently drift apart. Generation itself is not yet covered, because it needs an `AssetManager`.

## Licence

Same as the parent project. See [LICENSE](../LICENSE).
