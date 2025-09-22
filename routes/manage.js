'use strict';

const express = require('express');
const router = express.Router();

const {
  startInstance,
  getInstanceStatus,
  getInstanceQr,
  restartInstance
} = require('../controllers/manage');

router.post('/instances/:companyId/:peopleId', startInstance);
router.get('/instances/:companyId/:peopleId/status', getInstanceStatus);
router.get('/instances/:companyId/:peopleId/qr', getInstanceQr);
router.post('/instances/:companyId/:peopleId/restart', restartInstance);

module.exports = router;
