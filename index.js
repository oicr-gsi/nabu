'use strict';

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json({ type: 'application/json' }));

const fileQc = require('./controllers/fileQc');

// home page
app.get('/', function(req, res) {
  res.end();
});

// routes to fileQC records
app.get('/fileqcs', fileQc.getAllFileQcs, function(req, res) { if (!res.headersSent) return res; });
app.get('/fileqc/:identifier', fileQc.getFileQc, function(req, res) { if (!res.headersSent) return res; });
app.post('/fileqcs', fileQc.addFileQc, function(req, res) { if (!res.headersSent) return res; });
app.post('/fileqcs/batch', fileQc.addManyFileQcs, function(req, res) { if (!res.headersSent) return res; });
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
