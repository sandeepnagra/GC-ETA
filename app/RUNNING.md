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
