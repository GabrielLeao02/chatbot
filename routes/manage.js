var express = require('express');
var router = express.Router();

const {getGRCode} = require('../controllers/manage.js');

/* GET qrcode. */
router.get('/qrcode', getGRCode);

module.exports = router;
