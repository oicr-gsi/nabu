var pgp = require('pg-promise')();
var db = pgp(process.env.DB_CONNECTION);

module.exports = {
  getFileQc: getFileQc,
  getAllFileQcs: getAllFileQcs,
  addFileQc: addFileQc
}

function getFileQc(req, res, next) {
  // access the request params
  var swid = getSwidParam(req, res);
  
  var sql = 'SELECT * FROM FileQC WHERE fileswid = $1';
  db.one(sql, [swid])
    .then(function(data) { 
      if (data.rows.length == 0) {
        returnError(res, 404, 'Record not found');
      }
      
      res.statusCode = 200;
      // TODO: something about DTOifying the response?
      res.json(data.rows[0]);
      next();
    })
    .catch(function(err) {
      //debug(err);
      returnError(res, 500, 'Error retrieving record');
    });
}

function getAllFileQcs(req, res, next) {
  // access the project param
  var proj = getProjectQueryParam(req, res);

  var sql = 'SELECT * FROM FileQC WHERE project = $1';
  db.any(sql, [proj])
    .then(function(data) {
       // TODO: something in here about DTOifying the responses
    })
    .catch(function(err) {
      //debug(err);
      returnError(res, 500, 'Error retrieving records');
    });
}

function addFileQc(req, res, next) {
  // TODO: fix this
  var project = getProjectQueryParam(req, res);
  var filePath = req.query.filepath;
  var fileSWID = getSwidParam(req, res);
  var username = req.query.username;
  var comment = nullifyIfBlank(req.query.comment);
  var qcPassed = convertQcStatusToBoolean(req.query.qcstatus);
  if (qcPassed === null) returnError(res, 400, 'FileQC must be created with status "PASS" or "FAIL"');

  var sql = 'INSERT INTO FileQc (project, filepath, fileswid, qcpassed, username, comment) VALUES ($1, $2, $3, $4, $5, $6)';
  db.none(sql, [project, filePath, fileSWID, qcPassed, username, comment])
    .then(function(data) {
      res.statusCode = 201;
      next();  
    })
    .catch(function(err) {
      //debug(err);
      returnError(res, 500, 'Failed to create FileQC record');
    });
}

function getProjectQueryParam(req, res) {
  var proj = req.query.project || null;
  if (proj == null || !proj.length) returnError(res, 400, 'Error: project must be provided');
  return proj;
}

function getSwidParam(req, res) {
  var swid = req.params.identifier || req.query.fileswid;
  swid = parseInt(swid);
  if (isNaN(swid)) returnError(res, 400, 'Error: swid is ' + req.params.identifier + ' or ' + req.query.fileswid + ' but must be an integer');
  return swid;
}

function returnError(res, statusCode, errorMessage) {
  res.statusCode = statusCode;
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
