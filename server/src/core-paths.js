const fs = require('fs');
const path = require('path');

const appRoot = path.join(__dirname, '../..');

function resolveCoreRoot() {
    const candidates = [
        process.env.LUMESYNC_CORE_DIR,
        path.join(appRoot, 'core'),
        path.join(appRoot, '../core'),
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (fs.existsSync(path.join(candidate, 'packages'))) {
            return path.resolve(candidate);
        }
    }

    throw new Error(`Unable to locate SyncClassroom core. Set LUMESYNC_CORE_DIR or place core next to teacher. Tried: ${candidates.join(', ')}`);
}

function resolveCorePackagePath(...segments) {
    return path.join(resolveCoreRoot(), 'packages', ...segments);
}

module.exports = {
    resolveCoreRoot,
    resolveCorePackagePath,
};
