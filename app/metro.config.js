// Metro needs to be told about the model package.
//
// `@gc-eta/model` is a file: dependency, so npm symlinks it into node_modules.
// Metro does not follow that symlink out of the project root by default, and
// the failure is a bare "Unable to resolve" with no hint that a symlink is
// involved. Adding the package directory as a watch folder, and its
// node_modules to the resolver paths, makes the link resolvable and means
// edits to the model hot-reload in the app.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const modelRoot = path.resolve(projectRoot, "../model");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [modelRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(modelRoot, "node_modules"),
];
module.exports = config;
