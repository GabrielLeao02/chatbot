'use strict';

const path = require('path');
const fs = require('fs');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');

const DEFAULT_PUPPETEER_ARGS = ['--no-sandbox', '--disable-setuid-sandbox'];
const REMOTE_VERSION_BASE = 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html';

function toBool(value, defaultValue = false) {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (!normalized) {
    return defaultValue;
  }

  return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
}

function parseArgs(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry).trim())
      .filter(Boolean);
  }

  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function sanitizeSegment(value) {
  const stringValue = value === undefined || value === null ? '' : String(value);
  const trimmed = stringValue.trim();
  if (!trimmed) {
    return 'default';
  }
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, '_');
}

class SessionError extends Error {
  constructor(message, code, meta = {}) {
    super(message);
    this.name = 'SessionError';
    this.code = code;
    Object.assign(this, meta);
  }
}

class SessionAlreadyExistsError extends SessionError {
  constructor(companyId, peopleId) {
    super(
      `Session already exists for company ${companyId} and people ${peopleId}`,
      'SESSION_EXISTS',
      { companyId, peopleId }
    );
    this.name = 'SessionAlreadyExistsError';
  }
}

class SessionNotFoundError extends SessionError {
  constructor(companyId, peopleId) {
    super(
      `Session not found for company ${companyId} and people ${peopleId}`,
      'SESSION_NOT_FOUND',
      { companyId, peopleId }
    );
    this.name = 'SessionNotFoundError';
  }
}

class SessionManager {
  constructor(options = {}) {
    this.instances = new Map();
    this.logger = options.logger || console;

    const rootDir = options.rootPath
      ? path.resolve(options.rootPath)
      : options.baseDir
      ? path.resolve(options.baseDir)
      : process.env.DATA_ROOT
      ? path.resolve(process.env.DATA_ROOT)
      : path.join(global.rootPath || process.cwd(), 'cache');

    this.baseDir = rootDir;
    this.authDir = options.authDir || path.join(rootDir, '.wwebjs_auth');
    this.cacheDir = options.cacheDir || path.join(rootDir, '.wwebjs_cache');

    this.webVersion = options.webVersion || process.env.WWebVersion || '';

    const envArgs = parseArgs(process.env.PUPPETEER_ARGS);
    const providedArgs = options.puppeteerArgs ? parseArgs(options.puppeteerArgs) : [];
    this.puppeteerArgs = providedArgs.length ? providedArgs : envArgs;

    if (!this.puppeteerArgs.length) {
      this.puppeteerArgs = [...DEFAULT_PUPPETEER_ARGS];
    }

    this.headless = options.headless !== undefined
      ? !!options.headless
      : toBool(process.env.HEADLESS, true);

    this.takeoverOnConflict = options.takeoverOnConflict !== undefined
      ? !!options.takeoverOnConflict
      : true;

    this.takeoverTimeoutMs = options.takeoverTimeoutMs ?? 60_000;

    this._fs = fs.promises;
    this._baseDirsReady = false;
  }

  get loggerAvailable() {
    return Boolean(this.logger);
  }

  _log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const formatted = `[${timestamp}] ${message}`;
    if (!this.logger) {
      return;
    }

    if (typeof this.logger[level] === 'function') {
      this.logger[level](formatted);
      return;
    }

    if (typeof this.logger.log === 'function') {
      this.logger.log(formatted);
      return;
    }

    // Fallback to console
    if (level === 'error') {
      console.error(formatted);
    } else {
      console.log(formatted);
    }
  }

  _getKeyParts(companyId, peopleId) {
    const companySegment = sanitizeSegment(companyId);
    const peopleSegment = sanitizeSegment(peopleId);
    const key = `${companySegment}:${peopleSegment}`;

    const sessionDir = path.join(this.authDir, companySegment, peopleSegment);
    const cacheDir = path.join(this.cacheDir, companySegment, peopleSegment);

    return {
      key,
      companySegment,
      peopleSegment,
      sessionDir,
      cacheDir
    };
  }

  async _ensureBaseDirs() {
    if (this._baseDirsReady) {
      return;
    }

    await this._fs.mkdir(this.baseDir, { recursive: true });
    await this._fs.mkdir(this.authDir, { recursive: true });
    await this._fs.mkdir(this.cacheDir, { recursive: true });

    this._baseDirsReady = true;
  }

  _setStatus(entry, status) {
    entry.status = status;
    entry.updatedAt = new Date().toISOString();
  }

  _attachClientEvents(entry, client) {
    const { key } = entry;

    client.on('qr', (qr) => {
      this._setStatus(entry, 'qr');
      entry.lastQr = {
        raw: qr,
        ts: new Date().toISOString()
      };

      try {
        qrcodeTerminal.generate(qr, { small: true });
      } catch (err) {
        this._log(`Failed to render QR code in terminal for ${key}: ${err.message}`, 'error');
      }

      this._log(`QR generated for session ${key}`);
    });

    client.on('authenticated', () => {
      this._setStatus(entry, 'authenticated');
      this._log(`Session ${key} authenticated`);
    });

    client.on('ready', () => {
      this._setStatus(entry, 'ready');
      entry.readyInfo = {
        wid: client.info?.wid?.user || null,
        pushname: client.info?.pushname || null,
        ts: new Date().toISOString()
      };
      this._log(`Session ${key} ready`);
    });

    client.on('auth_failure', (message) => {
      this._setStatus(entry, 'failed');
      entry.lastError = message;
      this._log(`Authentication failed for session ${key}: ${message}`, 'error');
    });

    client.on('disconnected', (reason) => {
      this._setStatus(entry, 'disconnected');
      entry.disconnectReason = reason;
      this._log(`Session ${key} disconnected: ${reason}`);
    });

    client.on('change_state', (state) => {
      entry.state = state;
      this._log(`Session ${key} state changed to ${state}`);
    });
  }

  async startSession(companyId, peopleId) {
    const { key, companySegment, peopleSegment, sessionDir, cacheDir } = this._getKeyParts(companyId, peopleId);

    if (this.instances.has(key)) {
      throw new SessionAlreadyExistsError(companyId, peopleId);
    }

    await this._ensureBaseDirs();
    await this._fs.mkdir(sessionDir, { recursive: true });
    await this._fs.mkdir(cacheDir, { recursive: true });

    const entry = {
      key,
      companyId,
      peopleId,
      sanitizedCompanyId: companySegment,
      sanitizedPeopleId: peopleSegment,
      sessionDir,
      cacheDir,
      status: 'starting',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastQr: null,
      readyInfo: null,
      lastError: null,
      disconnectReason: null,
      state: null,
      client: null
    };

    const authStrategy = new LocalAuth({
      dataPath: sessionDir,
      clientId: key
    });

    const webVersionCache = this.webVersion
      ? {
          type: 'remote',
          remotePath: `${REMOTE_VERSION_BASE}/${this.webVersion}.html`
        }
      : {
          type: 'local',
          path: cacheDir
        };

    const client = new Client({
      authStrategy,
      webVersionCache,
      takeoverOnConflict: this.takeoverOnConflict,
      takeoverTimeoutMs: this.takeoverTimeoutMs,
      puppeteer: {
        headless: this.headless,
        args: [...this.puppeteerArgs]
      }
    });

    entry.client = client;
    this._attachClientEvents(entry, client);

    client.initialize().catch((err) => {
      this._setStatus(entry, 'failed');
      entry.lastError = err?.message || 'Unknown initialization error';
      this._log(`Initialization failed for session ${key}: ${err.message}`, 'error');
    });

    this.instances.set(key, entry);
    this._log(`Session ${key} starting`);
    return entry;
  }

  getSession(companyId, peopleId) {
    const { key } = this._getKeyParts(companyId, peopleId);
    return this.instances.get(key) || null;
  }

  listSessions() {
    return Array.from(this.instances.values());
  }

  async destroySession(companyId, peopleId) {
    const { key } = this._getKeyParts(companyId, peopleId);
    const entry = this.instances.get(key);
    if (!entry) {
      return false;
    }

    if (entry.client) {
      try {
        await entry.client.destroy();
      } catch (err) {
        this._log(`Failed to destroy client for session ${key}: ${err.message}`, 'error');
      }
    }

    this.instances.delete(key);
    this._log(`Session ${key} destroyed`);
    return true;
  }

  async restartSession(companyId, peopleId) {
    await this.destroySession(companyId, peopleId);
    return this.startSession(companyId, peopleId);
  }
}

const sessionManager = new SessionManager();

module.exports = {
  sessionManager,
  SessionManager,
  errors: {
    SessionError,
    SessionAlreadyExistsError,
    SessionNotFoundError
  }
};
