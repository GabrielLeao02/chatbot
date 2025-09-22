'use strict';

const { sessionManager } = require('../lib');

function buildStatusMessage(message) {
    return {
        status: 'error',
        message
    };
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

module.exports = {
    getGRCode
};
