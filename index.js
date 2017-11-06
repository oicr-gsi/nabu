require('dotenv').config();
var express = require('express');
var bodyParser = require('body-parser');

var app = express();
app.use(bodyParser.json({ type: 'application/json' }));

var fileQcController = require('./controllers/fileQcController');

// home page
app.get('/', function(req, res) {
  res.end();
});

// routes to fileQC records
app.get('/fileqcs', fileQcController.getAllFileQcs, function(req, res) { return res; });
app.get('/fileqc/:identifier', fileQcController.getFileQc, function(req, res) { return res; });
app.post('/fileqcs', fileQcController.addFileQc, function(req, res) { return res; });
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
