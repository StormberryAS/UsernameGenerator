# Changelog

Every released version of the UsernameGenerator Android app, newest first. Each release is tagged `android-vX.Y.Z` and its APK is on the [releases page](https://github.com/StormberryAS/UsernameGenerator/releases). The short note shown in the app store for a release is `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt`; this file is the full log it points to. Website changes (username.stormberry.as) have no version number of their own; the ones that ship with a release are listed under it. The Google Play build of a tag has its own version number (see the table in `android/README.md`).

## 1.1.5 (versionCode 8)

The Stormberry Labs carousel from the website is now in the app too, between the generator and the footer. The generator, the word lists and the permissions are as in 1.1.4. The Google Play build of this tag is version 1.2.3 (code 8).

Carousel
- "Explore the Stormberry Ecosystem" shows the other Stormberry Labs apps in the order the website uses, with UsernameGenerator last. Screen readers say "This app" after its name.
- The row slides slowly on its own. Tick "Pause the animation" to stop it. A finger on the row also holds it, and you can drag it by hand.
- With Remove animations on, or with TalkBack on, the row stands still and the tick box is not shown.
- Tap a card to open that app's website in your browser. The app still has no INTERNET permission: the browser loads the page in its own process. If no app on your device can open a link, a short message says so.

Footer
- The message for a footer link that no app can open now reads "No app on this device can open that link.", the same words as the carousel's.

Tests and build
- New tests keep the carousel's heading, tick box, cards, order and links equal to the website's, check that every card has its icon, and pin when the row moves and when it stands still.
- The store screenshots are retaken for phone, 7-inch and 10-inch screens and show the carousel; the phone set gains a fourth shot for it. They are now 256-colour images under 250 KB, small enough for the Zapstore image server, so the repository and the Zapstore listing use the same files again.

Website, shipped with this release
- The carousel gains GDPRLetterBuilder, right after UsernameGenerator, and EclipseTracker moves to right after MoonApp.
- The store buttons now read "Get the Android app on Zapstore" and "Get the Android app on Google Play". They are taller, easier to tap, and fit on a narrow screen.

## 1.1.4 (versionCode 7), 2026-10-25

A new top and bottom for the main screen, matching the other Stormberry apps. The generator, the word lists and the permissions are as in 1.1.3. The Google Play build of this tag is version 1.2.2 (code 7).

Top
- The mark, the name and the tagline are now centred, with the mark larger. The tagline is the one on username.stormberry.as, word for word.
- The clock and battery icons in the status bar, and the gesture bar, are light on the dark page, also when the phone is set to a light theme.

Bottom
- The small footer is replaced by CheckLink's: the Stormberry name and tagline, what runs on your device and the project the word lists were built with, the Stormberry icon row (LinkedIn, GitHub, Nostr, Tor), a line to test the privacy claim by disconnecting, "No permissions. No network. No tracking.", then the company line with Privacy and Disclaimer, and the date of the word lists.
- The footer credits the project the generator is built on, with a link to its source and licence: Deep-Translator, which made the word lists (Apache 2.0, the licence it ships; earlier notices called it MIT). The Inter typeface, the Lucide and Material icons, Android Jetpack and Kotlin are credited in NOTICE and the README, with their licences. NOTICE also says plainly that the Nostr and Tor marks in the icon row have no recorded author.
- Every link except Privacy opens in another app; Privacy opens inside UsernameGenerator. If your phone has no app for a link, a short message says so. The app still has no INTERNET permission.
- A Disclaimer link is new; it opens the page on username.stormberry.as.

Tests and build
- The permissions are unchanged. New tests pin every footer link and keep the tagline equal to the website's.
- The store screenshots are retaken: the first username, the controls with the recent list, and the footer.

Website, shipped with this release
- The page script is now written in TypeScript and compiled to the same single `script.js`. Nothing you can see or use changes.
- An opt-in offline mode for the iPhone Home Screen: after one visit to `https://username.stormberry.as/?offline=1`, the page and its word lists are kept on that device so the generator opens with no network. Without that address nothing is stored. The privacy page now names this option as the exception to "no local storage". It is not used by the Android app, the onion mirror or any other address.
- The footer on username.stormberry.as now carries the app footer's texts word for word: the credit sentence ("Runs entirely on your device: our own code and word lists built with Deep-Translator (Apache 2.0) and reviewed by native speakers. Nothing is sent."), the word-list date, and the company line with its unbreakable Org.nr. Two lines say what is true of a web page instead: "Your usernames and settings never leave this browser." and "No cookies. No tracking. Every username is generated in your browser." (the app keeps "Your usernames and settings never leave this device. Disconnect and try it." and "No permissions. No network. No tracking."). A test now fails if the shared lines drift apart or either web line changes.
- The tools that write the test corpora are now TypeScript too. The corpora are unchanged.
- Fixed: if you changed a setting quickly right after choosing a language whose word list had not loaded yet, the strength readout could show the figure for the earlier setting. It now always shows the latest.

## 1.1.3 (versionCode 6), 2026-10-10

The app is set in Inter, the typeface the website uses, including the generated username itself. The fonts are bundled inside the app, so nothing is downloaded and there are still no permissions. The Google Play build of this tag is version 1.2.1 (code 6).

Website, shipped with this release
- The Disclaimer and Privacy pages use Inter too.
- The footer and the carousel of other Stormberry Labs apps follow the design now shared by the Labs sites: every footer line passes WCAG AA contrast, the carousel is a labelled region that keyboard users can pause, and the credit line names Deep-Translator with a working link.

## 1.1.2 (versionCode 5), 2026-10-03

The app is unchanged. The version was raised so that Zapstore offers the refreshed listing (current screenshots and an install check that names no version) to phones that already have the app.

Website, shipped with this release
- Links to the Zapstore and Google Play listings, and an updated privacy page.
- The Privacy and Disclaimer links in the footer are easier to read, and the organisation number links to its register entry.

## 1.1.1 (versionCode 4), 2026-09-03

The privacy policy can now be read inside the app. Backup is off: settings had been copied to Google's Auto Backup and survived uninstall, which the policy said they did not. `allowBackup` is now false and both backup descriptors exclude everything. The Google Play build of this tag is version 1.2.0 (code 5), under its own application ID.

Website and command line, shipped with this release
- The Disclaimer page is published, and the page carries Open Graph and Twitter card tags.
- `username max` in the command-line tool prints the strongest available settings.
- The release workflow runs the unit tests before it cuts a release.

## 1.1.0 (versionCode 3), 2026-08-22

A live strength readout and more options, on the website, in the app and in the command-line tool.

- Strength readout: bits of entropy, how many combinations, and how many names before an even-odds repeat.
- Digits: on by default, before or after each word, one to five per word.
- Languages: Random draws one for the whole name, Mix draws each word from the pooled vocabulary of all eleven. Random is the new default.
- Separators: Random uses one throughout, Mix draws one per gap.
- No word ever appears twice in a name.
- All 33 word lists were reviewed by native speakers.

## 1.0.1 (versionCode 2), 2026-08-21

- The Stormberry credit in the footer is readable and links to stormberry.as, and the UsernameGenerator mark sits beside the title. Both marks are vectors, so the app still carries no raster images.
- Usernames are reduced to plain ASCII: letters with no accent to strip (o with a stroke, l with a stroke, sharp s, ae, oe) are now transliterated in the app, the website and the command-line tool, so "drømme" becomes "dromme". The first unit tests check this against the same table in all three.
- Every word list holds exactly 100 unique words: 272 duplicates were removed and replaced, and 95 words that sat in two categories at once each have one home now.
- The Tor link in the website footer points to the stormberry vanity address.
- Still no permissions. The new links hand off to whatever browser you already have.

## 1.0.0 (versionCode 1), 2026-08-11

First release. A native Kotlin and Compose port of username.stormberry.as: 11 languages, no permissions and no network access.
