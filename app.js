// app.js
require('dotenv').config();

const createError = require('http-errors');
const express = require('express');
const path = require('path');
const logger = require('morgan');

const instanceRouter = require('./routes/instance');

const app = express();

// views (se tiver views geradas pelo express-generator)
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// middlewares
app.use(logger('dev'));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

// rotas da API de instâncias (WhatsApp)
app.use('/', instanceRouter);

// catch 404 e repassa para o handler
app.use(function (req, res, next) {
    next(createError(404));
});

// handler de erro
app.use(function (err, req, res, next) {
    // responde JSON para chamadas de API
    if (req.path.startsWith('/instance') || req.path.startsWith('/health')) {
        const status = err.status || 500;
        return res.status(status).json({ ok: false, error: err.message || 'error' });
    }

    // ou renderiza página de erro (se estiver usando views)
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};
    res.status(err.status || 500);
    res.render('error');
});

module.exports = app;
