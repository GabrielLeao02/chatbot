const index =  function(req, res, next) {
    const botType = process.env.BOT_TYPE;
    const botID = process.env.BOT_ID;
    
    res.render('index', { 
        title: `Lydia ${botType} ${botID}`
    });
    
}

module.exports = {
    index
}