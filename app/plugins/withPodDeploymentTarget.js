/**
 * Force a minimum iOS deployment target on every CocoaPods target.
 *
 * Why this exists. Xcode 27 refuses deployment targets below 15.0, but the
 * React Native and Expo podspecs in SDK 51 still declare 13.4. The Podfile's
 * `platform :ios` line does not override a podspec's own minimum, so a build
 * fails with one error per pod, about sixty of them, none of which name the
 * real cause.
 *
 * Patching ios/Podfile by hand works until the next `expo prebuild`, which
 * regenerates it. This plugin reapplies the patch every time, so the fix
 * survives and a fresh clone can build without anyone remembering it.
 */

const { withPodfile } = require("@expo/config-plugins");

const MARKER = "gc-eta: force pod deployment target";

module.exports = function withPodDeploymentTarget(config, { target = "16.4" } = {}) {
  return withPodfile(config, (cfg) => {
    const contents = cfg.modResults.contents;
    if (contents.includes(MARKER)) return cfg;

    const anchor = "  post_install do |installer|\n";
    if (!contents.includes(anchor)) {
      throw new Error(
        "withPodDeploymentTarget: could not find the post_install hook in the Podfile",
      );
    }

    const injection =
      anchor +
      `    # ${MARKER}\n` +
      `    installer.pods_project.targets.each do |t|\n` +
      `      t.build_configurations.each do |c|\n` +
      `        c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${target}'\n` +
      `      end\n` +
      `    end\n` +
      `    installer.pods_project.build_configurations.each do |c|\n` +
      `      c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${target}'\n` +
      `    end\n`;

    cfg.modResults.contents = contents.replace(anchor, injection);
    return cfg;
  });
};
