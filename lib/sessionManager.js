'use strict';

const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const { LocalAuth } = require('whatsapp-web.js');

const LydiaClient = require('./LydiaClient');

const sessions = new Map();

const isDockerMode = /^(1|true|yes)$/i.test(String(process.env.IS_DOCKER_MODE || ''));

function getDocumentRoot() {
    if (global.rootPath) {
        return global.rootPath;
    }

    return path.resolve(__dirname, '..');
}

function ensureDirectory(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function buildSessionKey(companyId, peopleId) {
    if (!companyId || !peopleId) {
        throw new Error('Both companyId and peopleId must be provided to manage a session.');
    }

    return `${companyId}:${peopleId}`;
}

function getSessionRecord(companyId, peopleId, { allowFallback = false } = {}) {
    let key = null;

    if (companyId && peopleId) {
        key = buildSessionKey(companyId, peopleId);
    } else if (allowFallback && sessions.size === 1) {
        key = sessions.keys().next().value;
    }

    if (!key) {
        return null;
    }

    return sessions.get(key) || null;
}

function buildPuppeteerArgs() {
    const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-features=site-per-process',
        '--disable-extensions',
        '--disable-infobars',
        '--disable-notifications',
        '--mute-audio',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-client-side-phishing-detection',
        '--disable-component-update',
        '--disable-hang-monitor',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-sync',
        '--metrics-recording-only',
        '--safebrowsing-disable-auto-update'
    ];

    if (isDockerMode) {
        args.push('--single-process', '--no-zygote');
    }

    return args;
}

function buildClientConfig(companyId, peopleId) {
    const root = getDocumentRoot();
    const sessionFolder = `${companyId}_${peopleId}`;
    const sessionRoot = path.join(root, 'cache', '.wwebjs_auth', sessionFolder);
    const cachePath = path.join(sessionRoot, 'Cache');

    ensureDirectory(cachePath);

    const config = {
        authStrategy: new LocalAuth({ dataPath: sessionRoot }),
        webVersionCache: { type: 'local', path: cachePath },
        takeoverOnConflict: true,
        takeoverTimeoutMs: 60000,
        puppeteer: {
            headless: 'new',
            args: buildPuppeteerArgs()
        }
    };

    const requestedVersion = String(process.env.WWebVersion || '').trim();

    if (requestedVersion) {
        config.webVersionCache = {
            type: 'remote',
            remotePath: `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/${requestedVersion}.html`
        };
    }

    return {
        config,
        sessionRoot,
        cachePath
    };
}

function createMetadata(companyId, peopleId, sessionRoot, cachePath, key) {
    const createdAt = new Date();

    return {
        key,
        companyId,
        peopleId,
        sessionRoot,
        cachePath,
        status: 'initializing',
        createdAt,
        lastEventAt: createdAt,
        ready: false,
        readyAt: null,
        authenticated: false,
        authenticatedAt: null,
        disconnectedAt: null,
        disconnectReason: null,
        qr: null,
        lastQR: null,
        lastQrPng: null,
        lastQrAt: null,
        lastQrBuffer: null,
        wid: null,
        pushname: null,
        error: null
    };
}

async function handleQrEvent(metadata, qr) {
    metadata.status = 'qr';
    metadata.lastEventAt = new Date();
    metadata.lastQR = qr;
    metadata.lastQrAt = metadata.lastEventAt;

    try {
        const [dataUrl, buffer] = await Promise.all([
            qrcode.toDataURL(qr),
            qrcode.toBuffer(qr)
        ]);

        metadata.lastQrPng = dataUrl;
        metadata.lastQrBuffer = buffer;
        metadata.qr = {
            dataUrl,
            buffer,
            raw: qr,
            generatedAt: metadata.lastEventAt
        };
    } catch (err) {
        metadata.error = err;
    }

    qrcodeTerminal.generate(qr, { small: true });
}

function handleReadyEvent(metadata, client) {
    metadata.status = 'ready';
    metadata.readyAt = new Date();
    metadata.lastEventAt = metadata.readyAt;
    metadata.ready = true;
    metadata.qr = null;
    metadata.lastQR = null;
    metadata.lastQrPng = null;
    metadata.lastQrBuffer = null;

    if (client && client.info) {
        metadata.wid = client.info.wid ? client.info.wid._serialized || client.info.wid : null;
        metadata.pushname = client.info.pushname || null;
    }
}

function handleAuthenticatedEvent(metadata) {
    metadata.status = 'authenticated';
    metadata.authenticatedAt = new Date();
    metadata.lastEventAt = metadata.authenticatedAt;
    metadata.authenticated = true;
    metadata.qr = null;
    metadata.lastQR = null;
    metadata.lastQrPng = null;
    metadata.lastQrBuffer = null;
}

function handleDisconnectedEvent(metadata, reason) {
    metadata.status = 'disconnected';
    metadata.disconnectedAt = new Date();
    metadata.lastEventAt = metadata.disconnectedAt;
    metadata.disconnectReason = reason || null;
    metadata.ready = false;
    metadata.authenticated = false;
    metadata.qr = null;
    metadata.lastQR = null;
    metadata.lastQrPng = null;
    metadata.lastQrBuffer = null;
}

function registerClientEvents(client, metadata) {
    client.on('qr', (qr) => {
        handleQrEvent(metadata, qr).catch((err) => {
            metadata.error = err;
        });
    });

    client.on('ready', () => handleReadyEvent(metadata, client));
    client.on('authenticated', () => handleAuthenticatedEvent(metadata));
    client.on('disconnected', (reason) => handleDisconnectedEvent(metadata, reason));
}

function ensureSession(companyId, peopleId) {
    const key = buildSessionKey(companyId, peopleId);

    if (sessions.has(key)) {
        return sessions.get(key);
    }

    if (isDockerMode && sessions.size > 0) {
        throw new Error('Docker mode supports only a single active WhatsApp session per process.');
    }

    const { config, sessionRoot, cachePath } = buildClientConfig(companyId, peopleId);
    const client = new LydiaClient(config);
    const metadata = createMetadata(companyId, peopleId, sessionRoot, cachePath, key);

    const session = {
        key,
        companyId,
        peopleId,
        client,
        metadata
    };

    registerClientEvents(client, metadata);

    metadata.initializePromise = client.initialize().catch((err) => {
        metadata.status = 'error';
        metadata.error = err;
        metadata.lastEventAt = new Date();
        throw err;
    });

    sessions.set(key, session);

    return session;
}

function getSession(companyId, peopleId) {
    const record = getSessionRecord(companyId, peopleId, { allowFallback: true });
    return record ? record.client : null;
}

function cloneMetadata(metadata) {
    if (!metadata) {
        return null;
    }

    const clone = { ...metadata };
    delete clone.initializePromise;

    if (metadata.qr) {
        clone.qr = { ...metadata.qr };
        if (metadata.qr.buffer) {
            clone.qr.buffer = Buffer.from(metadata.qr.buffer);
        }
    }

    if (metadata.lastQrBuffer) {
        clone.lastQrBuffer = Buffer.from(metadata.lastQrBuffer);
    }

    return clone;
}

function getStatus(companyId, peopleId) {
    if (typeof companyId === 'undefined' && typeof peopleId === 'undefined') {
        return Array.from(sessions.values()).map((session) => cloneMetadata(session.metadata));
    }

    const record = getSessionRecord(companyId, peopleId, { allowFallback: true });

    return record ? cloneMetadata(record.metadata) : null;
}

async function destroySession(companyId, peopleId, options = {}) {
    const { allowFallback = true, wipe = false } = options;
    const record = getSessionRecord(companyId, peopleId, { allowFallback });

    if (!record) {
        return false;
    }

    sessions.delete(record.key);

    try {
        await record.client.destroy();
    } catch (err) {
        record.metadata.error = err;
    }

    record.client.removeAllListeners();

    record.metadata.status = 'destroyed';
    record.metadata.lastEventAt = new Date();
    record.metadata.ready = false;
    record.metadata.readyAt = null;
    record.metadata.authenticated = false;
    record.metadata.authenticatedAt = null;
    record.metadata.qr = null;
    record.metadata.lastQR = null;
    record.metadata.lastQrPng = null;
    record.metadata.lastQrBuffer = null;
    record.metadata.disconnectedAt = record.metadata.lastEventAt;
    record.metadata.disconnectReason = 'destroyed';

    if (wipe) {
        await fs.promises.rm(record.metadata.sessionRoot, { recursive: true, force: true });
    }

    return true;
}

async function restartSession(companyId, peopleId, options = {}) {
    const { wipe = false } = options;
    await destroySession(companyId, peopleId, { wipe, allowFallback: false });
    return ensureSession(companyId, peopleId);
}

module.exports = {
    ensureSession,
    getSession,
    getStatus,
    restartSession,
    destroySession,
    _sessions: sessions
};
