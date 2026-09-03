import java.io.FileInputStream
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.compose.compiler)
}

// Signing credentials never live in this repo. Locally they come from
// android/keystore.properties (gitignored); in CI from ORG_GRADLE_PROJECT_* env vars.
// Missing credentials must not break `assembleDebug`, so everything below is optional.
val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) load(FileInputStream(keystorePropertiesFile))
}

fun signingValue(propKey: String, gradleKey: String): String? =
    keystoreProperties.getProperty(propKey) ?: providers.gradleProperty(gradleKey).orNull

val releaseStoreFile = signingValue("storeFile", "RELEASE_STORE_FILE")
val releaseStorePassword = signingValue("storePassword", "RELEASE_STORE_PASSWORD")
val releaseKeyAlias = signingValue("keyAlias", "RELEASE_KEY_ALIAS")
val releaseKeyPassword = signingValue("keyPassword", "RELEASE_KEY_PASSWORD")
val canSignRelease = releaseStoreFile != null && file(releaseStoreFile).exists()

// Google Play is a SEPARATE package, deliberately. `no.stormberry.usernamegenerator`
// stays the sovereign build: our key, our certificate, shipped through GitHub Releases,
// Obtainium and Zapstore, with the NIP-C1 certificate link vouching for it.
// `-PplayBuild=true` builds `no.stormberry.usernamegenerator.play` instead, which Google
// re-signs with an app signing key it holds and never hands back. Two package names means
// two apps as far as Android is concerned: they install side by side and neither can ever
// update the other, which is precisely what keeps existing installs safe from anything
// that happens on Play. The alternative, one package name with two certificates, is the
// Mullvad failure: mutually un-installable builds and a forced uninstall to switch channel.
val playBuild = when (providers.gradleProperty("playBuild").orNull?.lowercase()) {
    null -> false
    // A bare `-PplayBuild` arrives as an empty string. Silently treating that as false
    // used to hand back a sovereign-signed artifact from a command that plainly meant Play.
    "", "true", "1", "yes" -> true
    "false", "0", "no" -> false
    else -> error(
        "-PplayBuild=${providers.gradleProperty("playBuild").get()} is not a recognised " +
            "value. Use -PplayBuild=true, or omit the property for the sovereign build.",
    )
}

// The Play upload key is a separate key with a separate job: it proves who uploaded the
// bundle and never reaches a device. That is why it must not be the release key. If it is
// ever compromised it can be reset from the Play Console without touching a single install,
// and that is only true because it signs nothing a user runs.
val uploadStoreFile = signingValue("playUploadStoreFile", "PLAY_UPLOAD_STORE_FILE")
val uploadStorePassword = signingValue("playUploadStorePassword", "PLAY_UPLOAD_STORE_PASSWORD")
val uploadKeyAlias = signingValue("playUploadKeyAlias", "PLAY_UPLOAD_KEY_ALIAS")
val uploadKeyPassword = signingValue("playUploadKeyPassword", "PLAY_UPLOAD_KEY_PASSWORD")
val canSignPlayUpload = uploadStoreFile != null && file(uploadStoreFile).exists() &&
    uploadStorePassword != null && uploadKeyAlias != null && uploadKeyPassword != null

// Guards on the RESOLVED TASK GRAPH, not on the command line, because the command line
// lies: `build`, `assemble` and Gradle's `bR` abbreviation all reach a release artifact
// without containing the string "bundle" or "assembleRelease", and `bundleDebug` contains
// "bundle" while needing no upload key at all. packageRelease and signReleaseBundle are the
// two tasks that actually consume a signing config, so the check belongs on them.
//
// The dangerous mistake is the one with no flag. `bundleRelease` on its own configures
// cleanly and writes an AAB carrying the SOVEREIGN application ID signed with the release
// key. Uploading that would permanently claim no.stormberry.usernamegenerator as a Play
// package and enrol the release certificate into Play App Signing, which is the exact
// outcome the two-package design exists to prevent, and it cannot be undone.
tasks.matching { it.name == "packageRelease" || it.name == "signReleaseBundle" }.configureEach {
    val isBundle = name == "signReleaseBundle"
    val play = playBuild
    val haveUploadKey = canSignPlayUpload
    doFirst {
        if (isBundle && !play) {
            error(
                "Refusing to build a release bundle without -PplayBuild=true. This AAB would " +
                    "carry the sovereign application ID signed with the release key, and " +
                    "uploading it would permanently claim that package on Play. The sovereign " +
                    "channel ships APKs; Play takes the bundle, with -PplayBuild=true.",
            )
        }
        if (!isBundle && play) {
            error(
                "Refusing to build a release APK with -PplayBuild=true. Play takes the app " +
                    "bundle: run :app:bundleRelease -PplayBuild=true. An installable .play APK " +
                    "has no destination and would share a filename with the sovereign one.",
            )
        }
        if (isBundle && play && !haveUploadKey) {
            error(
                "playBuild=true but the Play upload keystore is not fully configured. All four " +
                    "of playUploadStoreFile, playUploadStorePassword, playUploadKeyAlias and " +
                    "playUploadKeyPassword must be set in android/keystore.properties (or as " +
                    "PLAY_UPLOAD_* Gradle properties), and the store file must exist.",
            )
        }
    }
}

val dictionaryAssetsDir = layout.buildDirectory.dir("generated/assets/dictionaries")

android {
    namespace = "no.stormberry.usernamegenerator"
    // compileSdk is 37.1 because androidx (core-ktx 1.19.0, lifecycle 2.11.0,
    // compose 1.11.4) requires compiling against API 37 or later. targetSdk stays
    // at 36, which is what Google Play requires for new apps from 31 August 2026;
    // the two are deliberately independent.
    compileSdk = 37
    compileSdkMinor = 1

    defaultConfig {
        // The sovereign build keeps the original ID; the Play build gets its own. Once the
        // Play listing is published this string is permanent, because Play treats a changed
        // application ID as a completely different app. `namespace` above is unrelated: it is
        // the R class package, so nothing in the Kotlin source changes with the flag.
        applicationId =
            if (playBuild) "no.stormberry.usernamegenerator.play" else "no.stormberry.usernamegenerator"
        minSdk = 24
        targetSdk = 36
        // TWO NUMBER LINES, ONE CODEBASE. Marcos's call, 2026-09-03: a build's channel should
        // be obvious from its version alone, so Play does not share the sovereign numbering.
        //
        // Sovereign 1.1.1 (code 4), because tag android-v1.1.0 is published and this tree is
        // no longer that binary: it adds the in-app privacy policy, and README and PRIVACY.md
        // now assert the policy is reachable inside the app, which is false of the 1.1.0 APK
        // on Releases. Android refuses an update at an unchanged versionCode, so leaving it
        // at 3 would also mean no existing install ever receives the screen.
        //
        // Play 1.2.0 (code 5). Play only requires monotonicity within its own package, so
        // nothing forces the two lines to track each other. What MUST stay true is the
        // mapping, kept in the release table in README.md: every Play upload is built from a
        // sovereign tag that shipped on GitHub Releases, same code, different application ID
        // and different signature. Never respin Play from an untagged tree.
        versionCode = if (playBuild) 5 else 4
        versionName = if (playBuild) "1.2.0" else "1.1.1"

        // No instrumentation tests, no test runner, nothing that pulls in extra permissions.
        // Density-split PNGs are generated at build time from vectors and are a source of
        // build nondeterminism, so keep the vectors only.
        vectorDrawables.generatedDensities()
    }

    signingConfigs {
        if (canSignRelease) {
            create("release") {
                storeFile = file(releaseStoreFile!!)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
                // Pinned explicitly: AGP documents these as "if null, a default value is
                // used" without saying what that default is, so an AGP upgrade could
                // silently change what the APK carries. minSdk 24 means v1 JAR signing
                // is dead weight; v2 covers 7.0+, v3 enables key rotation later.
                enableV1Signing = false
                enableV2Signing = true
                enableV3Signing = true
                enableV4Signing = false
            }
        }
        if (canSignPlayUpload) {
            create("playUpload") {
                storeFile = file(uploadStoreFile!!)
                storePassword = uploadStorePassword
                keyAlias = uploadKeyAlias
                keyPassword = uploadKeyPassword
                // v1 stays ON here, unlike the release config above. An app bundle is signed
                // like a JAR, and this signature exists only so Play can verify who uploaded
                // it: Play strips it and re-signs the split APKs it generates with the app
                // signing key it holds. Leaving v1 on costs nothing on an artifact no device
                // ever installs, and removes any doubt about whether the APK-scheme flags
                // reach bundle signing at all.
                enableV1Signing = true
                enableV2Signing = true
                enableV3Signing = true
                enableV4Signing = false
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // The Play build never touches the release key and the sovereign build never
            // touches the upload key. Both stay conditional so a clean checkout with no
            // keystore.properties can still run assembleDebug.
            if (playBuild) {
                if (canSignPlayUpload) signingConfig = signingConfigs.getByName("playUpload")
            } else if (canSignRelease) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
    }

    // The word lists are shared with the web app at the repo root. One source of
    // truth: they are copied into assets at build time rather than duplicated here.
    sourceSets["main"].assets.directories.add(dictionaryAssetsDir.get().asFile.absolutePath)

    buildFeatures {
        compose = true
        buildConfig = false
        resValues = false
        shaders = false
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources {
            excludes += setOf(
                "/META-INF/{AL2.0,LGPL2.1}",
                "DebugProbesKt.bin",
                "kotlin-tooling-metadata.json",
            )
        }
    }

    androidResources {
        // PNG crunching is not deterministic across build-tools versions and we ship
        // no PNGs anyway. Off, so a rebuilder gets identical bytes.
        noCompress += "txt"
    }

    dependenciesInfo {
        // Strips the Google-signed dependency blob from the APK. It is encrypted, it is
        // not reproducible, and for an app whose whole claim is "nothing leaves the
        // device" an opaque metadata block is the wrong look.
        includeInApk = false
        includeInBundle = false
    }

    lint {
        warningsAsErrors = true
        abortOnError = true
        disable += setOf(
            // Version bumps are a deliberate, reviewed act here, not something lint
            // should fail the build over. See gradle/libs.versions.toml.
            "GradleDependency",
            "AndroidGradlePluginVersion",
            "ObsoleteLintCustomCheck",
            // targetSdk 36 is intentional. It is what Google Play requires for new
            // apps from 31 August 2026, and API 37 opts into runtime behaviour this
            // app has not been tested against. compileSdk is already 37.1.
            "OldTargetApi",
        )
    }
}

// Under -PplayBuild=true the artifact is named for what it is, so a Play bundle can never be
// mistaken for a sovereign one on disk. Deliberately NOT set for the sovereign build, whose
// filename `app-release.apk` is hardcoded three times in .github/workflows/android-release.yml.
if (playBuild) {
    base { archivesName = "usernamegenerator-play" }
}

kotlin {
    // The JDK that COMPILES, as distinct from the bytecode level, which stays at 17 in
    // compileOptions above and in jvmTarget below. Pinned to 21 because that is what
    // .github/workflows/android-release.yml installs, and a third party rebuilding from a
    // tag is meant to get the same bytes as the released artifact: the compiler version is
    // part of the build definition, not an incidental property of whoever is building.
    //
    // Without this, Gradle compiles with whatever JVM happens to run the daemon. On a
    // machine whose default `java` is a JRE that fails outright with "Toolchain
    // installation ... does not provide the required capabilities: [JAVA_COMPILER]", and on
    // a machine with a newer JDK it silently compiles with a different compiler from CI.
    // Gradle auto-detects installed JDKs, so any vendor's 21 satisfies this and no
    // machine-specific path is written into the repo.
    jvmToolchain(21)

    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        freeCompilerArgs.addAll("-Xjvm-default=all")
    }
}

val copyDictionaries by tasks.registering(Copy::class) {
    description = "Copies the shared word lists from the repo root into app assets."
    group = "build"
    from(rootProject.file("../data")) {
        // entropy-model.tsv rides along with the word lists on purpose: it is
        // DERIVED from them, so shipping one without the other would leave the app
        // quoting entropy for dictionaries it no longer has.
        include("*.txt")
        include("entropy-model.tsv")
    }
    into(dictionaryAssetsDir.map { it.dir("data") })
    // Deterministic ordering, so the APK is byte-reproducible across machines.
    duplicatesStrategy = DuplicatesStrategy.FAIL
}

tasks.named("preBuild") { dependsOn(copyDictionaries) }

dependencies {
    testImplementation(libs.junit)

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.material3)

    debugImplementation(libs.androidx.compose.ui.tooling)
    implementation(libs.androidx.compose.ui.tooling.preview)
}
