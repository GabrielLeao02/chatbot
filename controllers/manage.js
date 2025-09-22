const getGRCode =  function(req, res, next) {    
    const qrcode = global.lydiabot.generatedQRCode;
    res.render('qrcode', { 
        qrcode: `${qrcode}`
    });
}

module.exports = {
    getGRCode
}