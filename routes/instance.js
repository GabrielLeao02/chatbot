// routes/instance.js
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs/promises');
const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const qrcodeTerm = require('qrcode-terminal');

const router = express.Router();

/* ==========================
   Config via ENV
   ========================== */
const PORT = parseInt(process.env.PORT || '8081', 10);
const HEADLESS = String(process.env.HEADLESS || 'true').toLowerCase() === 'true';
const DATA_ROOT = process.env.DATA_ROOT || path.join(process.cwd(), 'cache');
const PUPPETEER_ARGS = (process.env.PUPPETEER_ARGS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

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
        console.warn(`[WARN] Falha ao migrar diretório de ${from} para ${to}:`, err);
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
        console.warn(`[WARN] Falha ao migrar sessão de ${legacySessionFolder} para ${sanitizedSessionFolder}:`, err);
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

async function waitForNewQr(entry, timeoutMs = 15000, pollEveryMs = 250) {
    if (!entry) return null;
    if (entry.lastQR) {
        return entry.lastQR;
    }

    const terminalStates = new Set(['failed', 'disconnected', 'ready', 'authenticated']);

    return new Promise((resolve) => {
        const startedAt = Date.now();

        const check = () => {
            if (entry.lastQR) {
                return resolve(entry.lastQR);
            }
            if (terminalStates.has(entry.status)) {
                return resolve(null);
            }
            if (Date.now() - startedAt >= timeoutMs) {
                return resolve(null);
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

    // Se já existir e for pra reiniciar, derruba e recria
    if (instances.has(key)) {
        const entry = instances.get(key);
        if (forceRestart) {
            try {
                entry.status = 'restarting';
                if (entry.client) {
                    await entry.client.destroy();
                }
            } catch (_) {}
            instances.delete(key);
        } else {
            // já existe e não queremos reiniciar: apenas retorna
            return instances.get(key);
        }
    }

    if (forceRestart) {
        await wipeStoredSessionData(key);
    }

    await ensureStorageConsistency(key, sanitizedKey);

    // Cria entry inicial
    const entry = {
        client: null,
        status: 'starting',
        lastQR: null,
        readyInfo: null,
        startingAt: new Date()
    };
    instances.set(key, entry);

    // Config do cliente
    const auth = new LocalAuth({
        // clientId evita colisão dentro do mesmo dataPath
        clientId: sanitizedKey,
        dataPath: sessionPathForKey(key)
    });

    const client = new Client({
        authStrategy: auth,
        webVersionCache: { type: 'local', path: cachePathForKey(key) },
        takeoverOnConflict: true,
        takeoverTimeoutMs: 60_000,
        puppeteer: {
            headless: opts.headless !== undefined ? !!opts.headless : HEADLESS,
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
        console.log(`[QR] ${key} @ ${ts}`);
    });

    client.on('authenticated', () => {
        entry.status = 'authenticated';
        console.log(`[AUTH] ${key} autenticado…`);
    });

    client.on('ready', async () => {
        entry.status = 'ready';
        const wid = client.info?.wid?.user || null;
        const pushname = client.info?.pushname || null;
        entry.readyInfo = { wid, pushname, ts: new Date().toISOString() };
        console.log(`[READY] ${key} OK - WID ${wid}`);
    });

    client.on('auth_failure', (m) => {
        entry.status = 'failed';
        console.log(`[AUTH_FAIL] ${key} - ${m}`);
    });

    client.on('disconnected', (r) => {
        entry.status = 'disconnected';
        console.log(`[DISCONNECTED] ${key} - reason: ${r}`);
    });

    entry.client = client;

    // Inicia
    client.initialize().catch((e) => {
        entry.status = 'failed';
        console.error(`[INIT_ERROR] ${key}`, e);
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

        return res.json({
            ok: true,
            companyId,
            peopleId,
            status: entry.status,
            readyInfo: entry.readyInfo || null,
            qr: buildQrPayload(entry.lastQR)
        });
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
        const qrInfo = await waitForNewQr(entry);

        return res.json({
            ok: true,
            companyId,
            peopleId,
            status: entry.status,
            qr: buildQrPayload(qrInfo)
        });
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
