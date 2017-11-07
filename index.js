require('dotenv').config();
var express = require('express');
var bodyParser = require('body-parser');

var app = express();
app.use(bodyParser.json({ type: 'application/json' }));

var fileQc= require('./controllers/fileQc');

// home page
app.get('/', function(req, res) {
  res.end();
});

// routes to fileQC records
app.get('/fileqcs', fileQc.getAllFileQcs, function(req, res) { if (!res.headersSent) return res; });
app.get('/fileqc/:identifier', fileQc.getFileQc, function(req, res) { if (!res.headersSent) return res; });
app.post('/fileqcs', fileQc.addFileQc, function(req, res) { if (!res.headersSent) return res;});
app.use(errorHandler);

module.exports = app;

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  res.status(err.status || 500);
  res.json({ 'errors': err.errors });
  res.end();
}
