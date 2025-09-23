'use strict';

const path = require('path');

function resolveProjectRoot() {
    if (global.rootPath && typeof global.rootPath === 'string') {
        return path.resolve(global.rootPath);
    }

    const envRoot = process.env.PROJECT_ROOT;
    if (envRoot && envRoot.trim().length > 0) {
        return path.resolve(envRoot.trim());
    }

    return path.resolve(__dirname, '..');
}

const PROJECT_ROOT = resolveProjectRoot();

function resolveFromProjectRoot(targetPath) {
    if (!targetPath) {
        return PROJECT_ROOT;
    }

    return path.isAbsolute(targetPath)
        ? targetPath
        : path.resolve(PROJECT_ROOT, targetPath);
}

function getDataRoot() {
    const raw = process.env.DATA_ROOT;
    if (raw && raw.trim().length > 0) {
        return resolveFromProjectRoot(raw.trim());
    }

    return path.join(PROJECT_ROOT, 'cache');
}

function getLogFilePath() {
    const raw = process.env.LOG_FILE;
    if (raw && raw.trim().length > 0) {
        return resolveFromProjectRoot(raw.trim());
    }

    return path.join(getDataRoot(), 'logs', 'instance.log');
}

module.exports = {
    PROJECT_ROOT,
    resolveFromProjectRoot,
    getDataRoot,
    getLogFilePath
};
