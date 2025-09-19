/**
 * CHATBOT WHATSAPP
 *
 * ChatBot Padrão para Whatsapp
 *
 */

const fs = require('fs');
const ini = require('ini');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { MessageMedia } = require('whatsapp-web.js');

const qrcode = require('qrcode-terminal');
const path = require('path');
const http = require('http');
const document_root = path.dirname(require.main.filename);
const faker = require('faker');
const formidable = require('formidable');
const ora = require('ora');
const crypto = require('crypto');

let config = null;
let WWebVersion = null;

// le as configs
if (fs.existsSync(document_root + '/config.ini')) {
    config = ini.parse(fs.readFileSync(document_root + '/config.ini', 'utf-8'));
} else {
    console.log('Arquivo "config.ini" não encontrado!');
    process.exit(1);
}

// array com os DDDs que funcionam com o 9 digito
const ddds9 = [11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 24, 27];

// pega os parametros por get
var argv = require('minimist')(process.argv.slice(2));
var botid = (argv.b === undefined ? '01' : argv.b);
let botname = 'wachatbot' + botid;

let authenticateCount = 1;
let maxAuthenticateCount = config.maxAuthenticateCount;
let port = config.port;

const ACK_ERROR = -1;
const ACK_PENDING = 0;
const ACK_SERVER = 1;
const ACK_DEVICE = 2;
const ACK_READ = 3;
const ACK_PLAYED = 4;

const SESSION_FILE_PATH = document_root + '/cache/wwebjs_auth/';
const SESSION_FILE_CACHE_PATH = document_root + '/cachew/webjs_cache';

/**
 * Inicia o Whatsapp
 */
let clientConfig = {
    authStrategy: new LocalAuth({ dataPath: SESSION_FILE_PATH }),
    webVersionCache: { type: 'local', path: SESSION_FILE_CACHE_PATH },
    takeoverOnConflict: true,
    takeoverTimeoutMs: 60000,
    puppeteer: { headless: config.headless }
};

const client = new Client(clientConfig);

//Fix versão remota do wa
if ( config.waVersionRemotePath !== undefined && config.waVersionRemotePath !== '') {
    clientConfig.webVersionCache = {
        type: 'remote',
        remotePath: config.waVersionRemotePath,
    }
}

client.initialize();

const spinner = ora('Iniciando o Bot...').start();

/**
 * Evento: Leitura do QR Code
 */
client.on('qr', (qr) => {
    spinner.stop();
    console.log('Faça a leitura do QR Code com o aparelho de celular!');
    qrcode.generate(qr, {
        small: true
    });
});

/**
 * Evento: Autenticando no Whatsapp
 */
client.on('authenticated', (session) => {

    console.log('Autenticação no WhatsApp efetuada com sucesso!');

    if(config.fakeMSG === true) {
        //
        // Manda uma "Fake Message" para um outro bot
        // Tempo randomico entre 2 e 10 minutos
        //
        // https://javascript.info/settimeout-setinterval
        // The nested setTimeout guarantees the fixed delay (here XXms).
        // That’s because a new call is planned at the end of the previous one.
        //
        let rndTime = Math.floor((Math.random() * 10) + 2);
        faker.locale = "pt_BR";

        setTimeout(function sendFakeMsg() {

            // lista dos bots para receber "Fake Message" para manter o bot online
            let listBots = getWabots();

            if (listBots.length == 0) {
                console.log('Não foi possível enviar Fake Message, não há bots disponíveis.');
            }

            // vamos colocar o bot online
            client.sendPresenceAvailable();

            if (listBots.length > 0) {

                // formata o fone no formato aceito pelo whats
                let phoneBot = listBots[Math.floor(Math.random() * listBots.length)];
                phoneBot = '55' + phoneBot.substr(0, 2) + phoneBot.substr(3) + '@c.us';

                console.log('Bot selecionado: ' + phoneBot);

                // gera uma msg fake
                let msg = faker.name.firstName() + ' ' + faker.internet.email() + ' ' + faker.random.words(3) + " ##||LD";

                // envia a mensagem
                console.log('Envia a mensagem fake.');
                client.sendMessage(phoneBot, msg)
                    .then(function () {
                        setTimeout(function () { deleteChat(phoneBot); }, 5000);

                    })
                    .catch(function () {
                        setTimeout(function () { deleteChat(phoneBot); }, 5000);
                    });
            }

            // novo tempo randomico
            rndTime = Math.floor((Math.random() * 10) + 2);

            setTimeout(sendFakeMsg, (1000 * (rndTime * 60)));
        }, (1000 * (rndTime * 60)));
    }
});

/**
 * Evento: Erro de Autenticação no Whatsapp
 */
client.on('auth_failure', (message) => {

    console.log('Erro na autenticação - ' + message);
    console.log('Aguarda 10 segundos e tenta logar novamente. Tentativa ' + authenticateCount + ' de ' + maxAuthenticateCount + '.');

    authenticateCount++;

    // tenta autenticar por X vezes (de acordo com config.ini)
    if (authenticateCount <= maxAuthenticateCount) {

        setTimeout(() => {
            client.initialize();
        }, 10000)
    }

    // ultrapassou as X vezes, tem que notificar
    if (authenticateCount > maxAuthenticateCount) {
        // envia notificação que o Bot tá fora do ar
        console.log('Máximo de tentativas(' + maxAuthenticateCount + ') atingida, enviar notificação!');
        process.exit(1);
    }
});

/**
 * Evento: Whats no ar e bombando
 */
client.on('ready', async () => {

    spinner.stop();

    WWebVersion = await client.getWWebVersion();

    console.log('Whats do ' + botname + ' no ar e bombando, escutando na porta ' + port);
    console.log('--------------------------------------------------------------------');
    console.log('Nome de Registro :  ' + client.info.pushname);
    console.log('Celular Nro.     :  ' + client.info.wid.user);
    console.log('WhatsApp Web     :  ' + WWebVersion);
    console.log('WWeb JS          :  ' + require('whatsapp-web.js').version);
    console.log('--------------------------------------------------------------------');

    //Desabilita leitura mensagens não lidas
    if(config.disableUnreadMessage === true) {
        console.log('Mensagens não lidas desabilitadas');
        return;
    }

    /**
     * Ler as mensagens que não foram lidas
     */
    console.log('Vamos responder as mensagens não lidas');
    let chats = await client.getChats();
    for (let chat of chats) {
        if (chat.unreadCount > 0) {
            console.log('Respondendo para: ' + chat.name);
            msgs = await chat.fetchMessages({ limit: chat.unreadCount });

            waitTime = Math.floor(Math.random() * (10000 - 2000 + 1) + 2000);
            await new Promise(resolve => setTimeout(resolve, waitTime));

            //for (let msg of msgs) {
                //await replyMsg(msg);
            //}
            let msg = msgs[ msgs.length - 1 ];

            if( msg && msg.fromMe ) {
                console.log('Ultima msg do bot: ' + chat.name);
                continue;
            }

            if( msg.ack && msg.ack === ACK_READ ) {
                console.log('Ultima msg ja lida: ' + chat.name);
                continue;
            }

            if( msg !== undefined ) {
                await replyMsg(msg);
            } else {
                console.log('Sem msg para responder: ' + chat.name);
            }
        }
    }

    console.log('Mensagens não lidas foram todas respondidas');

});

/**
 * Evento: Recebemos uma mensagem, vamos trabalhar!
 */
client.on('message', msg => {
    if ( config.disableOnMessageFunction ) {
        console.log('Resposta de mensagem desabilitada via config: disableOnMessageFunction ' + config.disableOnMessageFunction);
        return ;
    }

    // se for mensagem de update de status ou broadcast, desconsidera
    if (msg.isStatus || msg.broadcast) {

        console.log('Mensagem de status recebida: ' + msg.from);

        return;
    }

    // se for "Fake Message" da Lydia, desconsidera
    if (msg.body.slice(-6) == "##||LD" && config.fakeMSG) {

        console.log('Mensagem de monitoramento recebida: ' + msg.from);

        return;
    }

    // desconsidera as mensagens de atualização de Status
    if (msg.from == 'status@broadcast') {

        console.log('Mensagem de status recebida');

        return;
    }

    console.log('Mensagem recebida: ' + msg.from);

    //valida se é o bot
    if ( msg.from.split('@')[0] == client.info.wid.user) {
        console.log('Mensagem para o proprio bot: ' + msg.from.split('@')[0]);
        return;
    }

    replyMsg(msg);

});

/**
 * Evento disparado quando o dispositivo/celular desconecta da sessão ativa
 */
client.on('disconnected', () => {
    console.log('Aparelho desconectou do Whatsapp!!');

    // vamos notificar

    console.log('Parando o bot...');
    process.exit(0);
});

/**
 * Responde a mensagem para o contato
 * @param {array} msg
 */
async function replyMsg(msg) {

    let chat = await msg.getChat();

    // mensagem a ser enviada a Lydia
    let msgClient = '';

    // vamos colocar o bot online
    client.sendPresenceAvailable();

    if (msg.type == 'ciphertext' && msg.body == '') {
        console.log('Mesagem tipo "ciphertext", vamos pedir reenvio!')
        client.sendMessage(msg.from, 'Não entendi sua mensagem, favor enviar novamente.');
        return;
    }

    //Verifica se é uma mensagem de grupo
    if(chat.isGroup){

        console.log('Mensagem de grupo, vamos ignorar.');
        return;

    }

    //
    // verifica se veio uma imagem na mensagem
    //
    let base64Image = null;
    let mimeTypeAttachment = null;

    if (msg.hasMedia) {
        console.log('Tem media na mensagem');
        const media = await msg.downloadMedia();
        if (media.mimetype !== 'undefined' && (media.mimetype == 'image/jpeg' || media.mimetype == 'audio/ogg; codecs=opus' || media.mimetype == 'image/png' || media.mimetype == 'image/jpg' || media.mimetype == 'application/pdf')) {
            console.log('mimetype da media:' + media.mimetype);
            let base64String = media.data;
            base64Image = base64String.split(';base64,').pop();
            mimeTypeAttachment = media.mimetype;
        }
    }

    try {

        // mensagem tem postagem do Facebook
        if (typeof msg._data.ctwaContext !== 'undefined') {
            msgClient = msg._data.ctwaContext.description + ' - ' + msg._data.ctwaContext.sourceUrl;
        }

        // mensagem tem postagem do Instagram
        if (typeof msg._data.title !== 'undefined') {
            msgClient = msgClient +  ' - ' +  msg._data.title;
        }

        //reply de msg de texto do lead
        if (typeof msg._data.quotedMsg !== 'undefined') {
            if (msg._data.quotedMsg.type == 'chat') {
                msgClient = 'reply-msg:' + msg._data.quotedMsg.body;
            }
        }

        // pega os dados do contato
        const contact = await msg.getContact();


        //valida contact number
        if( contact.number === undefined) {
            if( contact.id.user === undefined ) {
                throw new Error('4001 - contact undefined: ' + JSON.stringify(contact));
            }else {
                contact.number = contact.id.user;
            }
        }

        //valida se é o bot
        if ( contact.isMe !== undefined && contact.isMe === true) {
            console.log('Mensagem para o proprio bot ' + contact.number);
            return;
        }

        // pega o nome do contato
        let contactName = contact.verifiedName; // Nome do WhatsApp Bussiness

        if( contactName === undefined ) {
            if( contact.name === undefined) {
                contactName = contact.shortName;
            }else{
                contactName = contact.name;
            }
        }

        console.log('Nome WAB: ' + contactName);

        if (typeof contactName === 'undefined') {
            contactName = contact.pushname; // Nome do WhatsApp
            console.log('PushNome WA: ' + contactName);

            if (typeof contactName === 'undefined' || contactName == '' || contactName.length <= 2) {
                contactName = contact.name; // Nome
                console.log('Name WA:' + contactName);
                if (typeof contactName === 'undefined') {
                    contactName = contact.number;
                    console.log('Não achei o nome, vamos de telefone:' + contactName);
                }
            }
        }

        let chat = await msg.getChat();
        const urlP = await client.getProfilePicUrl(chat.id._serialized);

        //coloca como visualizada a mensagem
        client.sendSeen(chat.id._serialized);

        console.log('Peguei o nome do contato: ' + contactName + ' - ' + contact.number);

        /**
         * Parametros passados
         *
         * phone = telefone
         * name = nome do contato
         * gw = id do bot
         * msg = mensagem enviada pelo contato
         *
         */
        //
        // vai na lydia buscar a mensagem que tem que exibir para o cliente
        //
        console.log('Vamos na Lydia buscar a mensagem');

        if (msgClient !== '') {
            msgClient = msg.body + ' - ' + msgClient;
        } else {
            msgClient = msg.body;
        }

        let queryString = '?phone=' + encodeURIComponent(contact.number) + '&name=' + encodeURIComponent(contactName) + '&idgw=' + botid + '&msg=' + encodeURIComponent(msgClient) + '&profileimg=' + encodeURIComponent(urlP);

        console.log(config.responseHostname + config.responsePath + queryString);

        const data = JSON.stringify({
            media: base64Image,
            mimetype: mimeTypeAttachment
        });

        const options = {
            hostname: config.responseHostname,
            path: config.responsePath + queryString,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            let msgsClient = [];

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {

                // LIXO QUE VEM DO WS DA IESA
                let result = data.replace(/^\{.*}/gm, '');
                data = result;
                msgsClient = data.split("||");

                if (data.length > 1 && !emptyOrWhiteSpaces(data)) {
                    console.log('Enviado resposta para o cliente: ' + data);
                    for (let i = 0; i < msgsClient.length; i++) {
                        client.sendMessage(msg.from, msgsClient[i].trim());
                    }
                } else {
                    console.log('Sem resposta para enviar para o cliente');
                }
            });

        }).on("error", (err) => {
            console.log("Ops!! deu erro: " + err.message);
        });

        req.write(data);
        req.end();

    } catch (e) {
        console.log("Ops!! deu erro: " + e);
    }
}

/**
 * Deleta o chat, usado no envio das Fake Msg
 *
 * @param string phoneBot
 */
function deleteChat(phoneBot) {

    console.log('Deleta todas as mensagens fake.');
    client.getChatById(phoneBot)
        .then(function (fakeChat) {
            fakeChat.delete();
        })
        .catch(function () {
            console.log('ERRO 1!! Deleta todas as mensagens fake.');
        });
}

/**
 * Retorna um array com os bots de envio de whats
 *
 * @returns array
 */
function getWabots() {

    // tenta buscar a lista de bots, se deu algum erro,
    // segue o baile pois isso é usado para enviar Fake Msg
    try {

        var request = require('sync-request');
        var res = request('GET', 'http://' + config.responseHostname + '/php/wabotlist.php');

        return JSON.parse(res.body.toString());

    } catch (e) {

        console.log('Não foi possível obter a lista de bots - Erro: ' + e.message);
        return {};

    }
}

function sendResendMessage(msg) {
    client.sendMessage(msg.from, '');
}

/*******************************************************************************************************
 * Inicializa o servidor HTTP
 *******************************************************************************************************/
const express = require('express');
const server = express();
const listener = server.listen(port);
const router = express.Router();

/**
 * Rota: envia whats com imagem para o numero informado
 * http://localhost:8081/whats
 *      phone: 11965253470
 *      msg: teste
 *      leadid: 1
 */
server.post('/whats', function (req, res, next) {

    let phone = '';
    let leadid = '';
    let msg = '';

    try {

        //
        // define os padrões do formidable
        //
        const form = new formidable.IncomingForm();
        form.multiples = false;
        form.maxFileSize = (1024 * 1024) * 50; // 50MB

        // Parsing
        form.parse(req, async (err, fields, files) => {

            phone = fields.phone;
            leadid = fields.leadid;
            if (fields.hasOwnProperty('msg')) {
                msg = decodeURIComponent(fields.msg);
            }

            console.log('----------------------------------------------------');
            console.log('Mensagem recebida, vamos trabalhar!');

            console.log('Dados Recebidos');
            console.log('Telefone: ' + phone);
            console.log('Lead ID: ' + leadid);

            if (msg.length > 0) {

                // checa se o numero do telefone é válido
                if (phone.length < 10 || phone.length > 11) {

                    console.log('Erro: Telefone Inválido, tamanho (' + phone.length + ')');

                    res.status(500).json('{"status":"0", "message":"Telefone Inválido.", "data":{"leadid" : "' + leadid + '", "phone":"' + phone + '"}}');

                } else {

                    // se o DDD for de uma cidade que usa 9 digitos no whats, vamos manter os 9 digitos
                    var dddPhone = parseInt(phone.substr(0, 2));
                    if (ddds9.indexOf(dddPhone) > -1) {
                        console.log('Número é de um DDD que usa o 9 digito, vamos manter os 9 digitos');
                    } else {

                        // formata os numeros antigos que nasceram com 8 digitos
                        if (phone.substr(3, 1) == '8' || phone.substr(3, 1) == '9') {

                            console.log('Número antigo, temos que converter para 8 digitos');

                            var ddd = phone.substr(0, 2);
                            phone = phone.substr(3);
                            phone = ddd + phone;

                        } else {

                            console.log('Número novo, vamos manter os 9 digitos');

                        }
                    }

                    console.log('Vamos enviar a mensagem!');
                    console.log('Phone: ' + phone);

                    // envia a imagem
                    if (msg.indexOf('base64') > -1) {

                        console.log('Tem imagem na mensagem!');

                        // pega somente o conteudo base64
                        const base64Data = msg.replace(/^data:[A-Za-z-+\/]+;base64,/, '');

                        if (msg.indexOf('audio/ogg') > -1) {

                            console.log('Tem audio na mensagem!');

                            let audioFile = new MessageMedia('audio/ogg; codec=opus', base64Data);

                            // manda o audio para o caboclo
                            client.sendMessage('55' + phone + '@c.us', audioFile);

                            console.log('Audio enviado com sucesso!');

                        } else {

                            console.log('Tem imagem na mensagem!');

                            var extension = null;
                            if (msg.indexOf('application/pdf') > -1) {
                                extension = '.pdf';
                            } else {
                                extension = '.jpg';
                            }

                            // gera um nome de arquivo aleatório
                            const fileName = crypto.randomBytes(15).toString('hex') + extension;

                            // salva a imagem
                            fs.writeFileSync('/tmp/' + fileName, Buffer.from(base64Data, 'base64'));

                            // prepara a imagem para o envio
                            const media = MessageMedia.fromFilePath('/tmp/' + fileName);

                            // manda a imagem para o caboclo
                            client.sendMessage('55' + phone + '@c.us', media);


                            console.log('Imagem enviada com sucesso!');
                        }


                        res.status(200);

                        // envia a mensagem
                    } else {

                        client.sendMessage('55' + phone + '@c.us', msg);
                        res.status(200).json('{"status":"1", "message":"Mensagem enviada.", "data":{"leadid" : ' + leadid + '}}');
                    }
                }

            } else {

                console.log('Erro: Mensagem não pode ser vazia.');

                res.status(500).json('{"status":"0", "message":"Mensagem não pode ser vazia.", "data":{"leadid" : ' + leadid + '}}');

            }

            res.status(200).json('{"status":"1", "message":"Mensagem enviada.", "data":{"leadid" : ' + leadid + '}}');

        });

    } catch (e) {

        console.log('Erro: Erro ao enviar a mensagem. (' + e + ')');
        console.log('----------------------------------------------------');

        res.status(500).json('{"status":"0", "message":"Erro ao enviar a mensagem. (' + e + ')", "data":{"leadid" : ' + leadid + '}}');

    }
});

/**
 * Rota: envia whats com imagem para o numero informado
 * http://localhost:8081/whats
 *      phone: 11965253470
 *      msg: teste
 *      leadid: 1
 */
server.get('/whats/:phone/:msg/:leadid', function (req, res) {

    try {

        console.log('----------------------------------------------------');
        console.log('Mensagem recebida, vamos trabalhar!');

        phone = req.params.phone;
        msg = req.params.msg;
        leadid = req.params.leadid;

        console.log('Dados Recebidos');
        console.log('Telefone: ' + phone);
        console.log('Lead ID: ' + leadid);
        console.log('Mensagem: ' + msg);

        if (msg.length > 0) {

            // checa se o numero do telefone é válido
            if (phone.length < 10 || phone.length > 11) {

                console.log('Erro: Telefone Inválido, tamanho (' + phone.length + ')');

                res.status(500).json('{"status":"0", "message":"Telefone Inválido.", "data":{"leadid" : "' + leadid + '", "phone":"' + phone + '"}}');

            } else {

                // se o DDD for de uma cidade que usa 9 digitos no whats, vamos manter os 9 digitos
                var dddPhone = parseInt(phone.substr(0, 2));
                if (ddds9.indexOf(dddPhone) > -1) {
                    console.log('Número é de um DDD que usa o 9 digito, vamos manter os 9 digitos');
                } else {

                    // formata os numeros antigos que nasceram com 8 digitos
                    if (phone.substr(3, 1) == '8' || phone.substr(3, 1) == '9') {

                        console.log('Número antigo, temos que converter para 8 digitos');

                        var ddd = phone.substr(0, 2);
                        phone = phone.substr(3);
                        phone = ddd + phone;

                    } else {

                        console.log('Número novo, vamos manter os 9 digitos');

                    }
                }

                console.log('Vamos enviar a mensagem!');
                console.log('Phone: ' + phone);

                // envia a mensagem
                client.sendMessage('55' + phone + '@c.us', msg);

                res.status(200).json('{"status":"1", "message":"Mensagem enviada.", "data":{"leadid" : ' + leadid + '}}');
            }


        } else {

            console.log('Erro: Mensagem não pode ser vazia.');

            res.status(500).json('{"status":"0", "message":"Mensagem não pode ser vazia.", "data":{"leadid" : ' + leadid + '}}');

        }

    } catch (e) {

        console.log('Erro: Erro ao enviar a mensagem. (' + e + ')');
        console.log('----------------------------------------------------');

        res.status(500).json('{"status":"0", "message":"Erro ao enviar a mensagem. (' + e + ')", "data":{"leadid" : ' + leadid + '}}');

    }
});

/**
 * Rota: Status do Bot
 */
server.get('/status', function (req, res) {

    const process = require('process');
    const execSync = require('child_process').execSync;

    let result = '';
    let lastLog = '';

    try {
        if(!client.info){
            throw new Error('Consulta status: bot não autenticado, sem dados para mostrar');
        }

        lastLog = execSync('cat /var/log/syslog | grep lydia.wachatbot' + botid);
    } catch (err) {
        console.error(err.message);

        res.set('Content-Type', 'text/html');

        return res.status(500).send("");
    }

    result += '<html>';
    result += '<head>';
    result += '<title>status do WACHATBOT :: Lydia</title>';
    result += '</head>';
    result += '<body>';
    result += '<h1>Status do WACHATBOT: ' + botname + '</h1>';

    result += '<table>';
    result += '    <tr>';
    result += '        <td>Nome de Registro</td>';
    result += '        <td>' + client.info.pushname + '</td>';
    result += '    </tr>';
    result += '    <tr>';
    result += '        <td>Celular Nro.</td>';
    result += '        <td>' + client.info.wid.user + '</td>';
    result += '    </tr>';
    result += '    <tr>';
    result += '        <td>WhatsApp Web</td>';
    result += '        <td>' + WWebVersion + '</td>';
    result += '    </tr>';
    result += '    <tr>';
    result += '        <td>WWeb JS</td>';
    result += '        <td>' + require('whatsapp-web.js').version + '</td>';
    result += '    </tr>';
    result += '</table>';

    result += '<br>';

    result += '<p>Instalado em : ' + process.cwd() + '</p>';
    result += '<p>PID : ' + process.pid + '</p>';
    result += '<p>Escutando na porta: ' + listener.address().port + '</p>';
    result += '<p>Rodando a : ' + secondsToHms(process.uptime()) + '</p>';
    result += '<p>Uso de memória : ' + prettySize(process.memoryUsage().rss, ' ') + '</p>';
    result += '<br>';
    result += '<p>Log<br></p>';
    result += '<hr>';
    result += '<p>' + String(lastLog).replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, '$1<br>$2') + '</p>';
    result += '</body>';
    result += '</html>'

    res.set('Content-Type', 'text/html');
    res.status(200).send(result);

});

/**
 * Rota: envia whats para o numero informado TODO: GAMBI COLEGIO REMOVER
 * http://localhost:8081/whats/11965253470/teste/1
 */
server.get('/whats/:phone/:msg/:leadid/:idcompany', function (req, res) {

    try {

        console.log('----------------------------------------------------');
        console.log('Mensagem recebida, vamos trabalhar!');

        company = req.params.idcompany;
        numberManipulationExp = ['202'];
        phone = req.params.phone;
        msg = req.params.msg;
        leadid = req.params.leadid;
        console.log('Dados Recebidos');
        console.log('Telefone: ' + phone);
        console.log('Lead ID: ' + leadid);
        console.log("Company:" + company);
        console.log('Mensagem: ' + msg);

        if (msg.length > 0) {

            // checa se o numero do telefone é válido
            if (!numberManipulationExp.includes(company) && (phone.length < 10 || phone.length > 11) ) {

                console.log('Erro: Telefone Inválido, tamanho (' + phone.length + ')');

                res.status(500).json('{"status":"0", "message":"Telefone Inválido.", "data":{"leadid" : "' + leadid + '", "phone":"' + phone + '"}}');

            } else{

                // se o DDD for de uma cidade que usa 9 digitos no whats, vamos manter os 9 digitos
                var dddPhone = parseInt(phone.substr(0, 2));
                if (ddds9.indexOf(dddPhone) > -1 || numberManipulationExp.includes(company)) {
                    console.log('Número é de um DDD que usa o 9 digito, vamos manter os 9 digitos');
                } else {

                    // formata os numeros antigos que nasceram com 8 digitos
                    if (phone.substr(3, 1) == '7' || phone.substr(3, 1) == '8' || phone.substr(3, 1) == '9') {

                        console.log('Número antigo, temos que converter para 8 digitos');

                        var ddd = phone.substr(0, 2);
                        phone = phone.substr(3);
                        phone = ddd + phone;

                    } else {

                        console.log('Número novo, vamos manter os 9 digitos');

                    }
                }

                console.log('Vamos enviar a mensagem!');
                if(!numberManipulationExp.includes(company)){
                    phone = '55' + phone;
                }
                console.log('Phone: ' + phone);

                // envia a mensagem
                client.sendMessage( phone + '@c.us', msg);

                res.status(200).json('{"status":"1", "message":"Mensagem enviada.", "data":{"leadid" : ' + leadid + '}}');
            }

        } else {

            console.log('Erro: Mensagem não pode ser vazia.');

            res.status(500).json('{"status":"0", "message":"Mensagem não pode ser vazia.", "data":{"leadid" : ' + leadid + '}}');

        }

    } catch (e) {

        console.log('Erro: Erro ao enviar a mensagem. (' + e + ')');
        console.log('----------------------------------------------------');

        res.status(500).json('{"status":"0", "message":"Erro ao enviar a mensagem. (' + e + ')", "data":{"leadid" : ' + leadid + '}}');

    }
});

/**
 * Convert seconds to: 99 hours 99 minutes 99 secods
 * @param {number} d
 */
function secondsToHms(d) {
    d = Number(d);
    var h = Math.floor(d / 3600);
    var m = Math.floor(d % 3600 / 60);
    var s = Math.floor(d % 3600 % 60);

    var hDisplay = h > 0 ? h + (h == 1 ? " hour, " : " hours, ") : "";
    var mDisplay = m > 0 ? m + (m == 1 ? " minute, " : " minutes, ") : "";
    var sDisplay = s > 0 ? s + (s == 1 ? " second" : " seconds") : "";
    return hDisplay + mDisplay + sDisplay;
}

/**
 * Convert bytes to: KB, MB, GB, TB
 * @param {number} bytes
 * @param {string} separator
 * @param {string} postFix
 */
function prettySize(bytes, separator = '', postFix = '') {
    if (bytes) {
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.min(parseInt(Math.floor(Math.log(bytes) / Math.log(1024)).toString(), 10), sizes.length - 1);
        return `${(bytes / (1024 ** i)).toFixed(i ? 1 : 0)}${separator}${sizes[i]}${postFix}`;
    }
    return 'n/a';
}

/**
 * Verifica se texto é vazio ou espaço em branco
 * @param msg string
 * @returns {boolean}
 */
function emptyOrWhiteSpaces(msg) {
    return msg.trim().length < 1;
}

/**
 * parar a execução do bot (necessário para quando usar o systemd do linux)
 */
process.on('SIGTERM', () => {
    console.log('Parando o bot...');
    process.exit(0);
})
