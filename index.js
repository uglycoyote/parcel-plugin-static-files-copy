"use strict";
const fs = require("file-system");
const minimatch = require("minimatch");
const path = require("path");
let logger;
try { // why are there two parcel packages on npm???
    logger = require("parcel-bundler/src/Logger")
}catch (err) {
    logger = require("parcel/src/Logger")
}

const DEFAULT_CONFIG = {
    "staticPath": [ "static" ],
    "watcherGlob": null
};


module.exports = bundler => {
    bundler.on("bundled", async(bundle) => {
        logger.setOptions(bundler.options);

        // main asset and package dir, depending on version of parcel-bundler
        let mainAsset =
            bundler.mainAsset ||                                                // parcel < 1.8
            bundler.mainBundle.entryAsset ||                                    // parcel >= 1.8 single entry point
            bundler.mainBundle.childBundles.values().next().value.entryAsset;   // parcel >= 1.8 multiple entry points
        let pkg;
        if (typeof mainAsset.getPackage === 'function') {                       // parcel > 1.8
            pkg = (await mainAsset.getPackage());
        } else {                                   // parcel <= 1.8
            pkg = mainAsset.package
        }

        // config
        let config = Object.assign({}, DEFAULT_CONFIG, pkg.staticFiles);
        if (pkg.staticPath) { // parcel-plugin-static-files-copy<1.2.5
            config.staticPath = pkg.staticPath;
        }
        if (!Array.isArray(config.staticPath)) { // ensure array
            config.staticPath = [ config.staticPath ];
        }

        // recursive copy function
        let numWatches = 0;
        const copyDir = (staticDir, bundleDir) => {
            if (fs.existsSync(staticDir)) {
                const copy = (filepath, relative, filename) => {
                    const dest = filepath.replace(staticDir, bundleDir);
                    if (!filename) {
                        fs.mkdir(filepath, dest);
                    } else {
                        if (fs.existsSync(dest)) {
                            const destStat = fs.statSync(dest);
                            const srcStat = fs.statSync(filepath);
                            if (destStat.mtime <= srcStat.mtime) { // File was modified - let's copy it and inform about overwriting.
                                logger.log(`Static file '${filepath}' already exists in '${bundleDir}'. Overwriting.`);
                                fs.copyFile(filepath, dest);
                            }
                        } else {
                            fs.copyFile(filepath, dest);
                        }
                        // watch for changes?
                        if (config.watcherGlob && bundler.watcher && minimatch(filepath, config.watcherGlob)) {
                            numWatches++;
                            bundler.watch(filepath, mainAsset);
                        }
                    }
                };
                fs.recurseSync(staticDir, copy);
            } else {
                logger.warn(`Static directory '${staticDir}' does not exist. Skipping.`);
            }
        };

        const bundleDir = path.dirname(bundle.name);
        for (let dir of config.staticPath) {
            copyDir(path.join(pkg.pkgdir, dir), bundleDir);
        }

        if (config.watcherGlob && bundler.watcher) {
            console.log(`Watching for changes in ${numWatches} static files.`);
        }

    });
};
