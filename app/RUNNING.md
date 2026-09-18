# Running the app on a simulator

Verified working on an iPhone 17 Pro simulator, iOS 26.3, Xcode 27.

```bash
# once
npm install
npx expo prebuild --platform ios
cd ios && pod install && cd ..

# build and install
xcrun simctl boot "iPhone 17 Pro"          # or any available device id
xcodebuild -workspace ios/GCETA.xcworkspace -scheme GCETA \
  -configuration Debug -sdk iphonesimulator \
  -destination "id=<device-udid>" -derivedDataPath build build
xcrun simctl install booted build/Build/Products/Debug-iphonesimulator/GCETA.app

# run
npx expo start --localhost          # Metro, in another shell
xcrun simctl launch booted com.gceta.app
xcrun simctl io booted screenshot shot.png
```

## Things that will bite you

**Metro cannot see the model package without help.** `@gc-eta/model` is a
`file:` dependency, so npm symlinks it. Metro does not follow that symlink out
of the project root and fails with a bare "Unable to resolve" that never
mentions symlinks. `metro.config.js` adds the package as a watch folder.

**Xcode 27 rejects the pod deployment targets.** SDK 51 podspecs declare iOS
13.4 and Xcode 27 requires 15.0 or newer, producing about sixty errors that do
not name the cause. `plugins/withPodDeploymentTarget.js` patches the Podfile's
post_install on every prebuild so the fix is not lost when the native project is
regenerated.

**Expo Go is not needed and is worse here.** Loading through Expo Go triggers an
"Open in Expo Go?" system dialog that `simctl` cannot dismiss, because simctl
has no tap command. Building natively avoids it entirely.

**Dark mode can be tested without touching the app**: `xcrun simctl ui booted
appearance dark`. The theme follows the system setting live, with no relaunch.

## Dates are calendar dates, not instants

A priority date has no time and no timezone. Converting one through UTC shifts
it: parsing "2015-03-10" as UTC midnight and rendering it in a timezone behind
UTC yields the 9th, and writing it back with `toISOString()` shifts it again.
This was live in the app and only visible on device, where the field read
10 March while the picker wheel sat on 9. `CaseScreen` stays in local calendar
components throughout. Do not reintroduce `toISOString()` for these.

## Reinstalling without a rebuild

A Release build embeds the JavaScript, so it runs with no Metro server. That is
what you want for hands-on testing; a Debug build shows a red error screen the
moment the dev server stops.

```bash
xcrun simctl boot "iPhone 17 Pro"
xcrun simctl install booted app/build/GCETA.app
xcrun simctl launch booted com.gceta.app
```

To rebuild that artifact after a change:

```bash
cd app && node scripts/sync-data.mjs
cd ios && xcodebuild -workspace GCETA.xcworkspace -scheme GCETA \
  -configuration Release -sdk iphonesimulator \
  -destination "id=<udid>" -derivedDataPath build \
  CODE_SIGNING_ALLOWED=NO build
```

## Seeing the simulator window

`Simulator.app` is missing from this machine's Xcode install, so the GUI cannot
be opened from here even though `simctl` drives the device fine. If the window
does not appear, the install is incomplete: reinstall Xcode from the App Store,
or install the simulator runtime through Xcode's Settings, Platforms tab.
Screenshots work regardless: `xcrun simctl io booted screenshot shot.png`.
