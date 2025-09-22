'use strict';

const createError = require('http-errors');
const QRCode = require('qrcode');

const { sessionManager, errors } = require('../lib/session-manager');

const { SessionAlreadyExistsError } = errors;

const isDockerMode = /^true$/i.test(String(process.env.IS_DOCKER_MODE || 'false').trim());

function buildSessionPayload(entry) {
  if (!entry) {
    return null;
  }

  return {
    companyId: entry.companyId,
    peopleId: entry.peopleId,
    status: entry.status,
    hasQr: Boolean(entry.lastQr),
    lastQrAt: entry.lastQr?.ts || null,
    readyInfo: entry.readyInfo || null,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    lastError: entry.lastError || null,
    disconnectReason: entry.disconnectReason || null,
    state: entry.state || null
  };
}

function getIdentifiers(req) {
  const { companyId, peopleId } = req.params;
  if (!companyId || !peopleId) {
    throw createError(400, 'Both companyId and peopleId must be provided');
  }

  return { companyId, peopleId };
}

async function startInstance(req, res, next) {
  try {
    const { companyId, peopleId } = getIdentifiers(req);

    const existing = sessionManager.getSession(companyId, peopleId);
    if (existing) {
      throw new SessionAlreadyExistsError(companyId, peopleId);
    }

    const entry = await sessionManager.startSession(companyId, peopleId);

    return res.status(201).json({
      message: 'Session starting',
      session: buildSessionPayload(entry)
    });
  } catch (error) {
    if (error instanceof SessionAlreadyExistsError || error.code === 'SESSION_EXISTS') {
      return next(createError(409, error.message));
    }

    return next(error);
  }
}

function getInstanceStatus(req, res, next) {
  try {
    const { companyId, peopleId } = getIdentifiers(req);
    const entry = sessionManager.getSession(companyId, peopleId);

    if (!entry) {
      return next(createError(404, 'Session not found'));
    }

    return res.json({
      session: buildSessionPayload(entry)
    });
  } catch (error) {
    return next(error);
  }
}

async function getInstanceQr(req, res, next) {
  try {
    const { companyId, peopleId } = getIdentifiers(req);
    const entry = sessionManager.getSession(companyId, peopleId);

    if (!entry) {
      return next(createError(404, 'Session not found'));
    }

    if (!entry.lastQr || !entry.lastQr.raw) {
      return next(createError(404, 'QR code not yet generated'));
    }

    const preferredType = req.accepts(['image/png', 'image/svg+xml']) || 'image/png';

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');

    if (preferredType === 'image/svg+xml') {
      const svg = await QRCode.toString(entry.lastQr.raw, { type: 'svg', margin: 1 });
      res.type('image/svg+xml');
      return res.send(svg);
    }

    if (preferredType !== 'image/png') {
      return next(createError(406, 'Unsupported media type requested'));
    }

    const pngBuffer = await QRCode.toBuffer(entry.lastQr.raw, { type: 'png', margin: 1, scale: 8 });
    res.type('image/png');
    return res.send(pngBuffer);
  } catch (error) {
    return next(error);
  }
}

async function restartInstance(req, res, next) {
  try {
    const { companyId, peopleId } = getIdentifiers(req);

    const hadExisting = await sessionManager.destroySession(companyId, peopleId);

    if (isDockerMode) {
      res.status(202).json({
        message: 'Restart acknowledged; container will exit to allow fresh provisioning',
        companyId,
        peopleId,
        hadExisting,
        willExit: true
      });

      setImmediate(() => {
        try {
          process.kill(process.pid, 'SIGTERM');
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('Failed to terminate process after restart request:', err);
        }
      });

      return;
    }

    const entry = await sessionManager.startSession(companyId, peopleId);

    return res.status(202).json({
      message: 'Session restarting',
      companyId,
      peopleId,
      hadExisting,
      session: buildSessionPayload(entry)
    });
  } catch (error) {
    if (error instanceof SessionAlreadyExistsError || error.code === 'SESSION_EXISTS') {
      return next(createError(409, error.message));
    }

    return next(error);
  }
}

module.exports = {
  startInstance,
  getInstanceStatus,
  getInstanceQr,
  restartInstance
};
