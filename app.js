'use strict';

const path = require('path');
const express = require('express');
const createError = require('http-errors');
const logger = require('morgan');

global.rootPath = path.resolve(__dirname);

const indexRouter = require('./routes/index');
const manageRouter = require('./routes/manage');

const app = express();

app.disable('x-powered-by');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use('/', indexRouter);
app.use('/manage', manageRouter);

app.use((req, res, next) => {
  next(createError(404, 'Not Found'));
});

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  const response = {
    error: err.message
  };

  if (err.details) {
    response.details = err.details;
  }

  if (status >= 500 && req.app.get('env') === 'development') {
    response.stack = err.stack;
  }

  res.status(status).json(response);
});

module.exports = app;
