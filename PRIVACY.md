# Privacy

**Applies to UsernameGenerator: the Android application, and the web version at
[username.stormberry.as](https://username.stormberry.as).**

## The short version

UsernameGenerator collects nothing. No account, no analytics, no crash reporting, no
advertising, no cookies and no identifier of any kind. There is nothing to request,
correct or erase, because there is nothing.

## The Android application

It declares **no Android permissions at all**. Not "only the clipboard": genuinely none.
The INTERNET permission is stripped from the built package, so the app cannot reach the
network even if a future dependency tried to add it. Check before you install:

```
aapt dump permissions UsernameGenerator-<version>.apk
```

**What stays on your device.** Your settings, meaning the language, the word type, the
length, and the digit and separator choices, are saved in the app's private storage so they
survive a restart. Nothing else is written down. Generated names are held in memory and are
gone when you close the app.

**They are not backed up.** The app sets `allowBackup="false"`, so Android's Auto Backup
never copies them to your Google account, and `adb backup` gets nothing either. It also asks
Android to exclude them from device-to-device transfer, which is the one path
`allowBackup` does not govern; Google's own documentation says some manufacturers do not let
an app opt out of that migration, so we ask, and cannot promise. Uninstalling removes them.

**The clipboard.** Copying a name puts it on the system clipboard, which is shared with
the rest of your device. On Android 13 and later the app marks the clip sensitive, which
keeps it out of the clipboard preview. What happens after you paste it is between you and
the app you pasted into.

**Word lists.** The word lists for all eleven languages are compiled into the app. There is no download, no
update check and no server to ask.

## The web version

Static files. No cookies, no local storage, no analytics and no third-party scripts or
frames. The generator, its fonts and its word lists are served from this site and nowhere
else, and everything you generate happens in your browser and stays there.

One thing to be precise about, because "no tracking" would otherwise be doing work it has
not earned: the "Explore the Stormberry Ecosystem" strip at the bottom of the page shows the
icons of our other apps, and each of those icons is fetched from the subdomain it belongs
to. Those are Stormberry's own servers rather than a third party, but they are separate
hosts, so loading this page does put your IP address and browser string into their access
logs before you have clicked anything. No cookies are set and nothing is measured; if you
would rather not have that, the Android app makes no network connections at all.

The site is served by our hosting and CDN providers, which log connections the way any web
server does. That is their processing and their retention, not ours, and we add no
measurement of our own on top of it.

## Where you got the app

A copy installed from **Google Play** is delivered by Google, which applies its own logging
to the download and the install. That is Google's processing, not ours, and it happens
before the app ever runs.

The Play listing is a separate package, `no.stormberry.usernamegenerator.play`, signed
under Google's Play App Signing. The copy published on **GitHub Releases, Obtainium and
Zapstore** is `no.stormberry.usernamegenerator`, signed with our own key, and is not routed
through Google at all. Both can be installed at once; neither can update the other.

## Children

The application has no content directed at children, collects nothing from anyone, and
never asks anyone's age.

## Changes

If any of this changes, the date below changes with it, and the copy shown inside the
application changes in the same release.

## Who is responsible

**Stormberry AS**, org.nr. 937 751 249, Askøy, Norway. Contact:
[info@stormberry.as](mailto:info@stormberry.as).

The company policy covering the stormberry.as website and its contact form is a separate
document at [stormberry.as/privacy.html](https://stormberry.as/privacy.html).

*Last updated 3 September 2026.*
