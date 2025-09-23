'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10MB

function resolveBasePath(rawPath) {
    if (!rawPath) {
        return null;
    }
    return path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
}

const dataRoot = (() => {
    const raw = process.env.DATA_ROOT;
    if (raw && raw.trim().length > 0) {
        return resolveBasePath(raw.trim());
    }
    return path.join(process.cwd(), 'cache');
})();

const logFilePath = (() => {
    const raw = process.env.LOG_FILE;
    if (raw && raw.trim().length > 0) {
        return resolveBasePath(raw.trim());
    }
    const target = path.join(dataRoot, 'logs', 'instance.log');
    return resolveBasePath(target);
})();

const maxBytes = (() => {
    const raw = process.env.LOG_FILE_MAX_SIZE;
    if (!raw) {
        return DEFAULT_MAX_BYTES;
    }
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
    }
    return DEFAULT_MAX_BYTES;
})();

const logDir = path.dirname(logFilePath);

function safeMkDir(dir) {
    try {
        fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
        try {
            process.stderr.write(`[LOGGER] Failed to create log directory ${dir}: ${err?.stack || err}\n`);
        } catch (_) {}
    }
}

function rotationSuffix() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

let stream = null;
let currentSize = 0;

function closeStream() {
    if (stream) {
        try {
            stream.end();
        } catch (_) {}
        stream = null;
    }
}

function rotateActiveStream() {
    closeStream();
    try {
        if (fs.existsSync(logFilePath)) {
            const rotatedPath = `${logFilePath}.${rotationSuffix()}`;
            fs.renameSync(logFilePath, rotatedPath);
        }
    } catch (err) {
        try {
            process.stderr.write(`[LOGGER] Failed to rotate log file ${logFilePath}: ${err?.stack || err}\n`);
        } catch (_) {}
    }
    currentSize = 0;
}

function openStream() {
    if (stream) {
        return stream;
    }

    safeMkDir(logDir);

    try {
        if (fs.existsSync(logFilePath)) {
            const stats = fs.statSync(logFilePath);
            if (stats.size >= maxBytes) {
                rotateActiveStream();
            } else {
                currentSize = stats.size;
            }
        } else {
            currentSize = 0;
        }
    } catch (err) {
        currentSize = 0;
        try {
            process.stderr.write(`[LOGGER] Failed to inspect log file ${logFilePath}: ${err?.stack || err}\n`);
        } catch (_) {}
    }

    try {
        stream = fs.createWriteStream(logFilePath, { flags: 'a', encoding: 'utf8' });
        if (!currentSize) {
            try {
                if (fs.existsSync(logFilePath)) {
                    const stats = fs.statSync(logFilePath);
                    currentSize = stats.size;
                }
            } catch (_) {
                currentSize = 0;
            }
        }
    } catch (err) {
        stream = null;
        try {
            process.stderr.write(`[LOGGER] Failed to open log file ${logFilePath}: ${err?.stack || err}\n`);
        } catch (_) {}
    }

    return stream;
}

function ensureCapacity(bytesToWrite) {
    if (!Number.isFinite(bytesToWrite) || bytesToWrite < 0) {
        bytesToWrite = 0;
    }

    if (!stream) {
        openStream();
    }

    if (!stream) {
        return;
    }

    if (currentSize + bytesToWrite > maxBytes) {
        rotateActiveStream();
        openStream();
    }
}

function writeToFile(line) {
    const entry = `${line}\n`;
    const bytes = Buffer.byteLength(entry, 'utf8');
    ensureCapacity(bytes);
    if (!stream) {
        return;
    }
    try {
        stream.write(entry);
        currentSize += bytes;
    } catch (err) {
        try {
            process.stderr.write(`[LOGGER] Failed to write to log file ${logFilePath}: ${err?.stack || err}\n`);
        } catch (_) {}
    }
}

function formatLine(level, args) {
    const message = args.length ? util.format(...args) : '';
    return `${new Date().toISOString()} [${level}] ${message}`.trimEnd();
}

function baseLog(level, ...args) {
    const normalizedLevel = String(level || 'INFO').toUpperCase();
    const line = formatLine(normalizedLevel, args);
    const consoleMethod = normalizedLevel === 'ERROR'
        ? console.error
        : normalizedLevel === 'WARN'
            ? console.warn
            : console.log;

    consoleMethod(line);
    writeToFile(line);
}

function info(...args) {
    baseLog('INFO', ...args);
}

function warn(...args) {
    baseLog('WARN', ...args);
}

function error(...args) {
    baseLog('ERROR', ...args);
}

function debug(...args) {
    baseLog('DEBUG', ...args);
}

function log(...args) {
    info(...args);
}

process.on('exit', () => {
    closeStream();
});

openStream();

module.exports = {
    log,
    info,
    warn,
    error,
    debug,
    logFilePath
};
