var express = require('express');
var router = express.Router();

const { getGRCode, manageSession } = require('../controllers/manage.js');

/* GET qrcode. */
router.get('/qrcode', getGRCode);

/* POST session management. */
router.post('/session', manageSession);

module.exports = router;
