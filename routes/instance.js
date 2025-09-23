// routes/instance.js
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs/promises');
const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const qrcodeTerm = require('qrcode-terminal');

const logger = require('../lib/logger');
const { getDataRoot } = require('../lib/paths');

const router = express.Router();

/* ==========================
   Config via ENV
   ========================== */
const PORT = parseInt(process.env.PORT || '8081', 10);
const NODE_ENV = (process.env.NODE_ENV || '').toLowerCase();
const HEADLESS = (() => {
    if (process.env.HEADLESS !== undefined) {
        return String(process.env.HEADLESS).toLowerCase() === 'true';
    }
    return NODE_ENV === 'development' ? false : true;
})();
const DATA_ROOT = getDataRoot();
const PUPPETEER_ARGS = (process.env.PUPPETEER_ARGS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
const WAIT_FOR_QR_TIMEOUT_MS = (() => {
    const fallback = 45000;
    const parsed = parseInt(process.env.WAIT_FOR_QR_TIMEOUT_MS || `${fallback}`, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
})();
const WAIT_FOR_QR_POLL_MS = (() => {
    const fallback = 250;
    const parsed = parseInt(process.env.WAIT_FOR_QR_POLL_MS || `${fallback}`, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
})();

/* ==========================
   Estado em memória
   ========================== */
// Mapa de instâncias: key = `${COMPANY_ID}:${PEOPLE_ID}`
const instances = new Map();
/*
  Cada entry: {
    client,                               // whatsapp-web.js Client
    status: 'starting'|'qr'|'authenticated'|'ready'|'failed'|'disconnected'|'restarting',
    lastQR: { raw, pngDataUrl, svgString, ts }, // cache do último QR
    readyInfo: { wid, pushname, ts },     // info quando fica pronto
    startingAt: Date
  }
*/

/* ==========================
   Helpers
   ========================== */
function keyFrom(companyId, peopleId) {
    return `${companyId}:${peopleId}`;
}

function sanitizeStorageKey(key) {
    if (!key) return '';
    const sanitized = key.replace(/[^0-9a-zA-Z_-]/g, '_');
    if (sanitized.length > 0) {
        return sanitized;
    }
    // Fallback determinístico caso o replace zere a string
    return Buffer.from(key).toString('hex');
}

function sessionPathForKey(key) {
    // Mantém uma pasta por par COMPANY_ID/PEOPLE_ID (saneando o identificador)
    return path.join(DATA_ROOT, 'wwebjs_auth', sanitizeStorageKey(key));
}

function legacySessionPathForKey(key) {
    return path.join(DATA_ROOT, 'wwebjs_auth', key);
}

function cachePathForKey(key) {
    return path.join(DATA_ROOT, 'webjs_cache', sanitizeStorageKey(key));
}

function legacyCachePathForKey(key) {
    return path.join(DATA_ROOT, 'webjs_cache', key);
}
function toBool(x) {
    if (typeof x === 'boolean') return x;
    return String(x).toLowerCase() === 'true';
}

async function ensureDirs() {
    await fs.mkdir(path.join(DATA_ROOT, 'wwebjs_auth'), { recursive: true });
    await fs.mkdir(path.join(DATA_ROOT, 'webjs_cache'), { recursive: true });
}

async function pathExists(target) {
    try {
        await fs.access(target);
        return true;
    } catch (_) {
        return false;
    }
}

async function migrateDirectoryIfNeeded(from, to) {
    if (from === to) return;
    try {
        const [fromExists, toExists] = await Promise.all([
            pathExists(from),
            pathExists(to)
        ]);
        if (!fromExists || toExists) {
            return;
        }
        await fs.mkdir(path.dirname(to), { recursive: true });
        await fs.rename(from, to);
    } catch (err) {
        logger.warn(`[WARN] Falha ao migrar diretório de ${from} para ${to}:`, err);
    }
}

async function ensureStorageConsistency(key, sanitizedKey) {
    if (!key || sanitizedKey === key) {
        return;
    }

    const sessionTarget = sessionPathForKey(key);
    const cacheTarget = cachePathForKey(key);
    await Promise.all([
        migrateDirectoryIfNeeded(legacySessionPathForKey(key), sessionTarget),
        migrateDirectoryIfNeeded(legacyCachePathForKey(key), cacheTarget)
    ]);

    const legacySessionFolder = path.join(sessionTarget, `session-${key}`);
    const sanitizedSessionFolder = path.join(sessionTarget, `session-${sanitizedKey}`);

    if (legacySessionFolder === sanitizedSessionFolder) {
        return;
    }

    try {
        const [legacyExists, sanitizedExists] = await Promise.all([
            pathExists(legacySessionFolder),
            pathExists(sanitizedSessionFolder)
        ]);
        if (legacyExists && !sanitizedExists) {
            await fs.rename(legacySessionFolder, sanitizedSessionFolder);
        }
    } catch (err) {
        logger.warn(`[WARN] Falha ao migrar sessão de ${legacySessionFolder} para ${sanitizedSessionFolder}:`, err);
    }
}

async function wipeStoredSessionData(key) {
    const sanitizedKey = sanitizeStorageKey(key);
    const targets = new Set([
        sessionPathForKey(key),
        cachePathForKey(key)
    ]);
    if (sanitizedKey !== key) {
        targets.add(legacySessionPathForKey(key));
        targets.add(legacyCachePathForKey(key));
    }
    await Promise.allSettled(
        Array.from(targets).map((target) => fs.rm(target, { recursive: true, force: true }))
    );
}

function buildQrPayload(qr) {
    if (!qr) return null;
    return {
        at: qr.ts,
        pngDataUrl: qr.pngDataUrl || null,
        svgString: qr.svgString || null,
        raw: qr.raw || null
    };
}

async function waitForNewQr(entry, { timeoutMs = WAIT_FOR_QR_TIMEOUT_MS, pollEveryMs = WAIT_FOR_QR_POLL_MS, beatEveryMs: rawBeatMs } = {}) {
    const beatEveryMs = Number.isFinite(rawBeatMs) && rawBeatMs > 0
        ? rawBeatMs
        : Math.max(5000, pollEveryMs * 20);

    if (!entry) {
        logger.info('[QR_WAIT] (no-entry) Skip wait: instance entry not created');
        return { qr: null, timedOut: false, status: 'not_created', logContext: null };
    }

    const key = entry.key || 'unknown';

    if (entry.lastQR) {
        const contextId = `${key}:${Date.now()}`;
        logger.info(`[QR_WAIT] (${contextId}) Returning cached QR without waiting`);
        return { qr: entry.lastQR, timedOut: false, status: entry.status, logContext: contextId };
    }

    const terminalStates = new Set(['failed', 'disconnected', 'ready', 'authenticated']);

    return new Promise((resolve) => {
        const startedAt = Date.now();
        const contextId = `${key}:${startedAt}`;
        let lastBeatAt = startedAt;

        logger.info(`[QR_WAIT] (${contextId}) Starting wait (status=${entry.status}, timeoutMs=${timeoutMs}, pollEveryMs=${pollEveryMs})`);

        const finish = (qr, timedOut, reason) => {
            const elapsed = Date.now() - startedAt;
            if (reason === 'qr') {
                logger.info(`[QR_WAIT] (${contextId}) QR received after ${elapsed}ms (status=${entry.status})`);
            } else if (reason === 'terminal') {
                logger.info(`[QR_WAIT] (${contextId}) Finished due to terminal status=${entry.status} after ${elapsed}ms`);
            } else if (reason === 'timeout') {
                logger.warn(`[QR_WAIT] (${contextId}) Timed out after ${elapsed}ms (lastStatus=${entry.status})`);
            } else {
                logger.info(`[QR_WAIT] (${contextId}) Finished (reason=${reason}) after ${elapsed}ms (status=${entry.status})`);
            }
            resolve({ qr, timedOut, status: entry.status, logContext: contextId });
        };

        const check = () => {
            if (entry.lastQR) {
                return finish(entry.lastQR, false, 'qr');
            }
            if (terminalStates.has(entry.status)) {
                return finish(null, false, 'terminal');
            }
            const now = Date.now();
            if (now - startedAt >= timeoutMs) {
                return finish(null, true, 'timeout');
            }
            if (now - lastBeatAt >= beatEveryMs) {
                logger.info(`[QR_WAIT] (${contextId}) Still waiting... elapsed=${now - startedAt}ms status=${entry.status}`);
                lastBeatAt = now;
            }
            setTimeout(check, pollEveryMs);
        };

        check();
    });
}

/**
 * Cria uma instância nova (ou reinicializa) para a key.
 * @param {string} companyId
 * @param {string} peopleId
 * @param {object} opts { forceRestart:boolean, headless:boolean }
 */
async function ensureInstance(companyId, peopleId, opts = {}) {
    await ensureDirs();

    const key = keyFrom(companyId, peopleId);
    const sanitizedKey = sanitizeStorageKey(key);
    const forceRestart = !!opts.forceRestart;
    const sessionPath = sessionPathForKey(key);
    const cachePath = cachePathForKey(key);

    // Se já existir e for pra reiniciar, derruba e recria
    if (instances.has(key)) {
        const entry = instances.get(key);
        entry.key = entry.key || key;
        entry.companyId = entry.companyId || companyId;
        entry.peopleId = entry.peopleId || peopleId;
        if (forceRestart) {
            try {
                entry.status = 'restarting';
                if (entry.client) {
                    await entry.client.destroy();
                }
            } catch (_) {}
            instances.delete(key);
        } else {
            logger.info(`[INSTANCE] Reusing existing instance for key=${key} (status=${entry.status})`);
            // já existe e não queremos reiniciar: apenas retorna
            return instances.get(key);
        }
    }

    if (forceRestart) {
        await wipeStoredSessionData(key);
    }

    await ensureStorageConsistency(key, sanitizedKey);

    logger.info(`[INSTANCE] Creating client for key=${key} companyId=${companyId} peopleId=${peopleId} forceRestart=${forceRestart} clientId=${sanitizedKey} sessionPath=${sessionPath} cachePath=${cachePath}`);

    // Cria entry inicial
    const entry = {
        client: null,
        status: 'starting',
        lastQR: null,
        readyInfo: null,
        startingAt: new Date(),
        key,
        companyId,
        peopleId
    };
    instances.set(key, entry);

    // Config do cliente
    const auth = new LocalAuth({
        // clientId evita colisão dentro do mesmo dataPath
        clientId: sanitizedKey,
        dataPath: sessionPath
    });

    const clientHeadless = opts.headless !== undefined ? !!opts.headless : HEADLESS;

    const client = new Client({
        authStrategy: auth,
        webVersionCache: { type: 'local', path: cachePath },
        takeoverOnConflict: true,
        takeoverTimeoutMs: 60_000,
        puppeteer: {
            headless: clientHeadless,
            devtools: !clientHeadless,
            args: PUPPETEER_ARGS.length
                ? PUPPETEER_ARGS
                : ['--no-sandbox', '--disable-setuid-sandbox'] // seguro em servidor
        }
    });

    // Eventos
    client.on('qr', async (qr) => {
        entry.status = 'qr';
        const ts = new Date().toISOString();

        // Guarda QR em memória (raw + PNG data URL + SVG string)
        let pngDataUrl = null;
        let svgString = null;
        try { pngDataUrl = await QRCode.toDataURL(qr, { scale: 8, margin: 1 }); } catch {}
        try { svgString = await QRCode.toString(qr, { type: 'svg' }); } catch {}

        entry.lastQR = { raw: qr, pngDataUrl, svgString, ts };

        // opcional: mostrar no terminal
        qrcodeTerm.generate(qr, { small: true });
        logger.info(`[QR] ${key} @ ${ts}`);
    });

    client.on('authenticated', () => {
        entry.status = 'authenticated';
        logger.info(`[AUTH] ${key} autenticado…`);
    });

    client.on('ready', async () => {
        entry.status = 'ready';
        const wid = client.info?.wid?.user || null;
        const pushname = client.info?.pushname || null;
        entry.readyInfo = { wid, pushname, ts: new Date().toISOString() };
        logger.info(`[READY] ${key} OK - WID ${wid}`);
    });

    client.on('auth_failure', (m) => {
        entry.status = 'failed';
        logger.warn(`[AUTH_FAIL] ${key} - ${m}`);
    });

    client.on('disconnected', (r) => {
        entry.status = 'disconnected';
        logger.warn(`[DISCONNECTED] ${key} - reason: ${r}`);
    });

    entry.client = client;

    // Inicia
    logger.info(`[INSTANCE] Initializing client for key=${key} companyId=${companyId} peopleId=${peopleId}`);
    client.initialize().catch((e) => {
        entry.status = 'failed';
        logger.error(`[INIT_ERROR] ${key}`, e);
    });

    return entry;
}

/* ==========================
   Rotas da API
   ========================== */

/**
 * POST /instance/start
 * Body: { companyId, peopleId, forceRestart?:boolean }
 * - Sobe (ou reinicia) a instância para esse par.
 * - Retorna status e QR (se disponível já na primeira chamada).
 */
router.post('/instance/start', async (req, res, next) => {
    try {
        const { companyId, peopleId, forceRestart } = req.body || {};
        if (!companyId || !peopleId) {
            return res.status(400).json({ ok: false, error: 'companyId e peopleId são obrigatórios' });
        }

        const entry = await ensureInstance(companyId, peopleId, { forceRestart: toBool(forceRestart) });
        const { qr, timedOut, status, logContext } = await waitForNewQr(entry);

        const payload = {
            ok: true,
            companyId,
            peopleId,
            status,
            readyInfo: entry.readyInfo || null,
            qr: buildQrPayload(qr),
            qrTimedOut: timedOut
        };
        if (timedOut && logContext) {
            payload.qrWaitLogContext = logContext;
        }

        return res.json(payload);
    } catch (e) {
        next(e);
    }
});

/**
 * POST /instance/restart
 * Body: { companyId, peopleId }
 * - Derruba qualquer sessão existente e força um novo QR.
 */
router.post('/instance/restart', async (req, res, next) => {
    try {
        const { companyId, peopleId } = req.body || {};
        if (!companyId || !peopleId) {
            return res.status(400).json({ ok: false, error: 'companyId e peopleId são obrigatórios' });
        }

        const entry = await ensureInstance(companyId, peopleId, { forceRestart: true });
        const { qr, timedOut, status, logContext } = await waitForNewQr(entry);

        const payload = {
            ok: true,
            companyId,
            peopleId,
            status,
            readyInfo: entry.readyInfo || null,
            qr: buildQrPayload(qr),
            qrTimedOut: timedOut
        };
        if (timedOut && logContext) {
            payload.qrWaitLogContext = logContext;
        }

        return res.json(payload);
    } catch (e) {
        next(e);
    }
});

/**
 * GET /instance/:companyId/:peopleId/status
 * - Consulta status da instância.
 */
router.get('/instance/:companyId/:peopleId/status', (req, res) => {
    const { companyId, peopleId } = req.params;
    const key = keyFrom(companyId, peopleId);
    const entry = instances.get(key);

    if (!entry) {
        return res.json({
            ok: true,
            exists: false,
            status: 'not_created'
        });
    }

    return res.json({
        ok: true,
        exists: true,
        status: entry.status,
        readyInfo: entry.readyInfo || null,
        lastQrAt: entry.lastQR?.ts || null,
        hasQr: !!entry.lastQR
    });
});

/**
 * GET /instance/:companyId/:peopleId/qr
 * - Recupera o último QR em PNG (data URL) e SVG.
 */
router.get('/instance/:companyId/:peopleId/qr', (req, res) => {
    const { companyId, peopleId } = req.params;
    const key = keyFrom(companyId, peopleId);
    const entry = instances.get(key);

    if (!entry) {
        return res.status(404).json({ ok: false, error: 'instância não encontrada' });
    }
    if (!entry.lastQR) {
        return res.status(404).json({ ok: false, error: 'QR ainda não gerado' });
    }

    return res.json({
        ok: true,
        companyId,
        peopleId,
        at: entry.lastQR.ts,
        pngDataUrl: entry.lastQR.pngDataUrl || null,
        svgString: entry.lastQR.svgString || null,
        raw: entry.lastQR.raw || null
    });
});

/**
 * POST /instance/stop
 * Body: { companyId, peopleId }
 * - Destrói o client em memória (a sessão no disco continua; ao iniciar de novo, reutiliza).
 */
router.post('/instance/stop', async (req, res, next) => {
    try {
        const { companyId, peopleId } = req.body || {};
        if (!companyId || !peopleId) {
            return res.status(400).json({ ok: false, error: 'companyId e peopleId são obrigatórios' });
        }
        const key = keyFrom(companyId, peopleId);
        const entry = instances.get(key);
        if (!entry) {
            return res.json({ ok: true, stopped: false, reason: 'not_found' });
        }
        try { await entry.client.destroy(); } catch {}
        instances.delete(key);
        return res.json({ ok: true, stopped: true });
    } catch (e) {
        next(e);
    }
});

/**
 * GET /health
 */
router.get('/health', (_req, res) => res.json({ ok: true, up: true, port: PORT }));

module.exports = router;
