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
fileQcRouter.get('/:identifier', getFileQc, function(req, res) {
  res.json(req.fileqc);
});
// add or update one FileQC
fileQcRouter.post('/', addFileQc, function(req, res) { });

// attach the routes to the path of the app
app.use('/fileqc', fileQcRouter);

module.exports = app;

function getFileQc(req, res, next) {
  // access the request params
  var swid = getSwidParam(req);

  var sql = 'SELECT * FROM FileQC WHERE fileswid = $1';
  postgres.client.query(sql, [ swid ], function(err, results) {
    if (err) {
      debug(err);
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

function getAllFileQcs(req, res, next) {
  // access the project param
  var proj = getProjectQueryParam(req);

  var sql = 'SELECT * FROM FileQC WHERE project = $1';
  postgres.client.query(sql, [ proj ], function(err, results) {
    if (err) {
      debug(err);
      res.statusCode = 500;
      return res.json({ errors: ['Error retrieving records'] });
    }

    // TODO: something in here about DTOifying the responses
    next();
  });
}

function addFileQc(req, res, next) {
  // TODO: fix this
  var project = getProjectQueryParam(req);
  var filePath = req.body.filepath;
  var fileSWID = getSwidParam(req);
  var username = req.body.username;
  var comment = nullifyIfBlank(req.body.comment);
  var qcPassed = convertQcStatusToBoolean(req.body.qcstatus);
  if (qcPassed === null) return400Error(res, 'FileQC status was "PENDING" but must be "PASS" or "FAIL"');

  var sql = 'INSERT INTO FileQc (project, filepath, fileswid, qcpassed, username, comment) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id';
  postgres.client.query(sql, [project, filePath, fileSWID, qcPassed, username, comment], function(err, result) {
    if (err) {
      debug(err);
      res.statusCode = 500;
      return res.json({ errors: ['Failed to create FileQC record'] });
    }

    var newFileQcId = result.rows[0].recordId;
    res.statusCode = 201;
    
  });
}

function getProjectQueryParam(req) {
  var proj = req.query.project || null;
  if (proj == null || !proj.length) return400Error(res, 'Error: project must be provided');
  return proj;
}

function getSwidParam(req) {
  var swid = req.param.fileswid || req.query.fileswid;
  swid = parseInt(qcId);
  if (isNaN(swid)) return400Error(res, 'Error: swid is ' + swid + ' but must be an integer');
  return swid;
} 

var return400Error(res, errorMessage) {
  res.statusCode = 400;
  return res.json({ errors: [errorMessage] });
}

function nullifyIfBlank(value) {
  if (value === null || typeof value == 'undefined' || value.length == 0) value = null;
  return value; 
}

function convertQcStatusToBoolean(value) {
  var statusToBool = {
    "pass": true,
    "fail": false,
    "pending": null
  };
  value = value.toLowerCase();
  return statusToBool[value];
}
