'use strict';

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const morgan = require('morgan');

const app = express();
app.use(bodyParser.json({ type: 'application/json' }));
const logLevel = process.env.LOG_LEVEL || 'dev';
app.use(morgan(logLevel)); // TODO: expand this further to do produciton logging

const fileQc = require('./controllers/fileQc');

// home page
app.get('/', (req, res) => {
  res.end();
});

// routes to fileQC records
app.get('/fileqcs', fileQc.getAllFileQcs, (req, res) => { if (!res.headersSent) return res; });
app.get('/fileqc/:identifier', fileQc.getFileQc, (req, res) => { if (!res.headersSent) return res; });
app.post('/fileqcs', fileQc.addFileQc, (req, res) => { if (!res.headersSent) return res; });
app.post('/fileqcs/batch', fileQc.addManyFileQcs, (req, res) => { if (!res.headersSent) return res; });
app.use(errorHandler);
app.use(bodyParser.json());

module.exports = app;

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  res.status(err.status || 500);
  res.json({ 'errors': err.errors });
  res.end();
}
