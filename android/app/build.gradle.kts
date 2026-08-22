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
        applicationId = "no.stormberry.usernamegenerator"
        minSdk = 24
        targetSdk = 36
        // 1.1.0, not another 1.0.1: this release adds the strength readout, the
        // digit options, the random/mix language modes and the separator modes.
        // Tagging from 1.0.1 would put a materially different APK behind a version
        // people already have.
        versionCode = 3
        versionName = "1.1.0"

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
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (canSignRelease) signingConfig = signingConfigs.getByName("release")
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

kotlin {
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
