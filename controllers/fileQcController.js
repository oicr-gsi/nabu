var pgp = require('pg-promise')();
var db = pgp(process.env.DB_CONNECTION);

module.exports = {
  getFileQc: getFileQcBySwid,
  getAllFileQcs: getAllFileQcs,
  addFileQc: addFileQc
}

function getFileQcBySwid(req, res, next) {
  var swid = validateSwid(req.params.identifier, next);
  
  var sql = 'SELECT * FROM FileQC WHERE fileswid = $1';
  db.any(sql, [swid])
    .then(function(data) { 
      if (!data || data.length == 0) {
        return next(generateError(404, 'No FileQC found for file with SWID ' + swid));
      }
      
      res.statusCode = 200;
      // TODO: something about DTOifying the response?
      res.json({ data: data, errors: [] });
      next();
    })
    .catch(function(err) {
      //debug(err);
      console.log(err);
      return next(generateError(500, 'Error retrieving record'));
    });
}

function getAllFileQcs(req, res, next) {
  // access the project param
  var proj = validateProject(req.query.project, next);

  var sql = 'SELECT * FROM FileQC WHERE project = $1';
  db.any(sql, [proj])
    .then(function(data) {
       // TODO: something in here about DTOifying the responses
       res.json({ fileqcs: data, errors: [] });
       next();
    })
    .catch(function(err) {
      //debug(err);
      return next(generateError(500, 'Error retrieving records'));
    });
}

function addFileQc(req, res, next) {
  // TODO: fix this
  var project = validateProject(req.query.project, next);
  var filePath = validateFilepath(req.query.filepath, next);
  var fileSWID = validateSwid(req.query.fileswid, next);
  var username = validateUsername(req.query.username, next);
  var comment = validateComment(req.query.comment, res);
  var qcPassed = convertQcStatusToBoolean(req.query.qcstatus);
  if (qcPassed === null) return next(generateError(400, 'FileQC must be created with status "PASS" or "FAIL"'));

  var sql = 'INSERT INTO FileQc (project, filepath, fileswid, qcpassed, username, comment) VALUES ($1, $2, $3, $4, $5, $6)';
  db.none(sql, [project, filePath, fileSWID, qcPassed, username, comment])
    .then(function() {
      res.statusCode = 201;
      res.json = ({ 'swid': fileSWID });
      next();  
    })
    .catch(function(err) {
      //debug(err);
      console.log(err); // TODO: fix this into proper logging and debugging
      return next(generateError(500, 'Failed to create FileQC record'));
    });
}

function validateProject(param, next) {
  var proj = param || null;
  if (proj == null || !proj.length) return next(generateError(400, 'Error: project must be provided'));
  return proj;
}

function validateSwid(param, next) {
  var swid = parseInt(param);
  if (isNaN(swid)) return next(generateError(400, 'Error: swid is ' + param + ' but must be an integer'));
  return swid;
}

function validateUsername(param, next) {
  var user = nullifyIfBlank(param);
  if (user == null || !user.length) return next(generateError(400, 'Error: username must be provided'));
  return user;
}

function validateComment(param, res) {
  var comment = nullifyIfBlank(param);
  if (comment !== null) comment = decodeURIComponent(comment.replace(/\+/g,  ' '));
  return comment;
}

function validateFilepath(param, next) {
  var fp = nullifyIfBlank(param);
  if (fp == null || !fp.length) return next(generateError(400, 'Error: filepath must be provided'));
  fp = decodeURIComponent(fp.replace(/\+/g, ' '));
  return fp;
}

function generateError(statusCode, errorMessage) {
  var err = {
    statusCode: statusCode,
    errors: [errorMessage]
  };
  return err;
}

function nullifyIfBlank(value) {
  if (typeof value == 'undefined' || value === null || value.length == 0) value = null;
  return value;
}

function convertQcStatusToBoolean(value) {
  var statusToBool = {
    "pass": true,
    "fail": false,
    "pending": null
  };
  return statusToBool[value.toLowerCase()];
}
