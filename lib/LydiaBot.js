'use strict';

const {LydiaClient: Client} = require('./');
const { LocalAuth } = require('whatsapp-web.js');

const fs = require('fs');
const qrcode = require('qrcode-terminal');
const normalQrcode = require('qrcode');
const path = require('path');
const ora = require('ora');
const { prototype } = require('events');

const document_root = global.rootPath;

const SESSION_FILE_PATH =  document_root + '/cache/.wwebjs_auth/';
const SESSION_FILE_CACHE_PATH = document_root + '/cache/.wwebjs_cache';

let generatedQRCode = "";
let WWebVersion = process.env.WWebVersion;

let clientConfig = {
    authStrategy: new LocalAuth({ dataPath: SESSION_FILE_PATH }),
    webVersionCache: { type: 'local', path: SESSION_FILE_CACHE_PATH },
    takeoverOnConflict: true,
    takeoverTimeoutMs: 60000,
    puppeteer: { headless: false }
};

const client = new Client(clientConfig);

//cFix versão remota do wa
if (WWebVersion !== "") {
    clientConfig.webVersionCache = {
        type: 'remote',
        remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/" + WWebVersion + ".html",
    }
}




client.initialize();
const spinner = ora('Iniciando o Bot... \n').start();

/**
 * Evento: Leitura do QR Code
 */
client.on('qr', (qr) => {
    spinner.stop();
    normalQrcode.toDataURL(qr, function (err, url) {
        client.generatedQRCode = url;
    })
    console.log('Faça a leitura do QR Code com o aparelho de celular!');
    qrcode.generate(qr, {
        small: true
    });
});



exports = module.exports = createApplication;

function createApplication() {
    const app = client;
  return app;
}
