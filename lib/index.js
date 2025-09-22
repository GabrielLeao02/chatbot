'use strict';

const LydiaClient = require('./LydiaClient');
const sessionManager = require('./sessionManager');

module.exports = {
    LydiaClient,
    sessionManager,
    Lydiabot: sessionManager
};
