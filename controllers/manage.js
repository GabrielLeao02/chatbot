'use strict';

const { sessionManager } = require('../lib');

function buildStatusMessage(message) {
    return {
        status: 'error',
        message
    };
}

function parseBoolean(value, defaultValue = false) {
    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'number') {
        return value !== 0;
    }

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();

        if (!normalized) {
            return defaultValue;
        }

        return ['1', 'true', 'yes', 'on', 'y'].includes(normalized);
    }

    return defaultValue;
}

const getGRCode = function (req, res, next) {
    const { companyId, peopleId } = req.query;

    if (!companyId || !peopleId) {
        res.status(400);
        return res.render('qrcode', {
            qrcode: '',
            status: buildStatusMessage('Query parameters "companyId" and "peopleId" are required to retrieve the QR code.')
        });
    }

    try {
        sessionManager.ensureSession(companyId, peopleId);
        const status = sessionManager.getStatus(companyId, peopleId);

        if (!status) {
            res.status(404);
            return res.render('qrcode', {
                qrcode: '',
                status: buildStatusMessage('Session not found.')
            });
        }

        const qrDataUrl = status.qr?.dataUrl || status.lastQrPng || '';
        const viewStatus = qrDataUrl ? status : {
            ...status,
            message: status.message || `Session status: ${status.status || 'pending'}. QR code not available yet.`
        };

        return res.render('qrcode', {
            qrcode: qrDataUrl,
            status: viewStatus
        });
    } catch (error) {
        return next(error);
    }
};

const manageSession = async function (req, res, next) {
    const {
        action = 'status',
        companyId,
        peopleId,
        wipe,
        allowFallback
    } = req.body || {};

    const normalizedAction = String(action || 'status').trim().toLowerCase();

    try {
        switch (normalizedAction) {
            case 'ensure':
            case 'start':
            case 'create': {
                if (!companyId || !peopleId) {
                    res.status(400);
                    return res.json({
                        status: 'error',
                        message: 'Body parameters "companyId" and "peopleId" are required to start a session.'
                    });
                }

                sessionManager.ensureSession(companyId, peopleId);
                const status = sessionManager.getStatus(companyId, peopleId);

                return res.json({
                    status: 'success',
                    action: 'ensure',
                    session: status
                });
            }
            case 'restart': {
                if (!companyId || !peopleId) {
                    res.status(400);
                    return res.json({
                        status: 'error',
                        message: 'Body parameters "companyId" and "peopleId" are required to restart a session.'
                    });
                }

                const shouldWipe = parseBoolean(wipe);
                await sessionManager.restartSession(companyId, peopleId, { wipe: shouldWipe });
                const status = sessionManager.getStatus(companyId, peopleId);

                return res.json({
                    status: 'success',
                    action: 'restart',
                    session: status
                });
            }
            case 'destroy':
            case 'stop': {
                const shouldWipe = parseBoolean(wipe);
                const fallbackAllowed = typeof allowFallback === 'undefined'
                    ? true
                    : parseBoolean(allowFallback, true);

                if ((!companyId || !peopleId) && !fallbackAllowed) {
                    res.status(400);
                    return res.json({
                        status: 'error',
                        message: 'Body parameters "companyId" and "peopleId" are required to destroy a session when fallback is disabled.'
                    });
                }

                const destroyed = await sessionManager.destroySession(companyId, peopleId, {
                    wipe: shouldWipe,
                    allowFallback: fallbackAllowed
                });

                if (!destroyed) {
                    res.status(404);
                    return res.json({
                        status: 'error',
                        message: 'Session not found.'
                    });
                }

                return res.json({
                    status: 'success',
                    action: 'destroy'
                });
            }
            case 'status':
            case 'get':
            case 'info':
            case '': {
                const status = sessionManager.getStatus(companyId, peopleId);

                if (status === null) {
                    res.status(404);
                    return res.json({
                        status: 'error',
                        message: 'Session not found.'
                    });
                }

                return res.json({
                    status: 'success',
                    action: 'status',
                    session: status
                });
            }
            default: {
                res.status(400);
                return res.json({
                    status: 'error',
                    message: `Unsupported action "${action}".`
                });
            }
        }
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    getGRCode,
    manageSession
};
