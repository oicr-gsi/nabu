require('dotenv').config();
var express = require('express');
var bodyParser = require('body-parser');

var app = express();
app.use(bodyParser.json({ type: 'application/json' }));

var postgres = require('./lib/postgres');

// home page
app.get('/', function(req, res) {
  res.end();
});

// routes to fileQC records
var fileQcRouter = express.Router();
// get all FileQCs
fileQcRouter.get('s/', function(req, res) { });
// get one FileQC by identifier
fileQcRouter.get('/:identifier', lookupFileQc, function(req, res) {
  res.json(req.fileQc);
});
// add or update one FileQC
fileQcRouter.post('/', addFileQc, function(req, res) { });

// attach the routes to the path of the app
app.use('/fileqc', fileQcRouter);

module.exports = app;

function lookupFileQc(req, res, next) {
  // access the request params
  var qcId = req.params.identifier;
  qcId = parseInt(qcId);

  if (isNaN(qcId)) return res.json({ errors: ['Error: qcId is ' + qcId + ' but must be an integer'] });

  var sql = 'SELECT * FROM FileQC where fileQcId = $1';
  postgres.client.query(sql, [ qcId ], function(err, results) {
    if (err) {
      console.error(err);
      res.statusCode = 500;
      return res.json({ errors: ['Error retrieving record'] });
    }

    if (results.rows.length == 0) {
      res.statusCode = 404;
      return res.json({ errors: ['Record not found'] });
    }

    req.fileQc = results.rows[0];
    next();
  });
}

function addFileQc(req, res, next) {
  // TODO: fix this
  var project = req.body.project;
  var filePath = req.body.filePath;
  var fileSWID = req.body.fileSWID;
  var qcPassed = req.body.qcPassed;
  var username = req.body.username;
  var why = nullifyIfBlank(req.body.why);

  var sql = 'INSERT INTO FileQc (project, filePath, fileSWID, qcPassed, username, why) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id';
  postgres.client.query(sql, [project, filePath, fileSWID, qcPassed, username, why], function(err, result) {
    if (err) {
      debug(err);
      res.statusCode = 500;
      return res.json({ errors: ['Failed to create FileQC record'] });
    }

    var newFileQcId = result.rows[0].recordId;
    res.statusCode = 201;
  });
}

function nullifyIfBlank(value) {
  if (value === null || typeof value == 'undefined' || value.length == 0) value = null;
  return value; 
}
