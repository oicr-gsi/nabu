'use strict';

const pgp = require('pg-promise')();
const db = pgp(process.env.DB_CONNECTION);

module.exports = {
  getFileQc: getFileQcBySwid,
  getAllFileQcs: getAllFileQcs,
  addFileQc: addFileQc
};

function getFileQcBySwid(req, res, next) {
  const swid = validateSwid(req.params.identifier, next);
  
  const sql = 'SELECT * FROM FileQC WHERE fileswid = $1';
  db.any(sql, [swid])
    .then(function(data) { 
      if (!data || data.length == 0) {
        return next(generateError(404, 'No FileQC found for file with SWID ' + swid));
      }
      
      // TODO: something about DTOifying the response?
      res.status(200)
        .json({ data: data, errors: [] });
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
  const proj = validateProject(req.query.project, next);

  const sql = 'SELECT * FROM FileQC WHERE project = $1';
  db.any(sql, [proj])
    .then(function(data) {
      // TODO: something in here about DTOifying the responses
      res.status(200)
        .json({ fileqcs: data, errors: [] });
      next();
    })
    .catch(function() {
      //debug(err);
      return next(generateError(500, 'Error retrieving records'));
    });
}

function addFileQc(req, res, next) {
  // TODO: fix this
  const project = validateProject(req.query.project, next);
  const filePath = validateFilepath(req.query.filepath, next);
  const fileSWID = validateSwid(req.query.fileswid, next);
  const username = validateUsername(req.query.username, next);
  const comment = validateComment(req.query.comment, res);
  const qcPassed = convertQcStatusToBoolean(req.query.qcstatus);
  if (qcPassed === null) return next(generateError(400, 'FileQC must be saved with status "PASS" or "FAIL"'));

  const select = 'SELECT * FROM FileQc WHERE fileswid = $1';
  const create = 'INSERT INTO FileQc (filepath, qcpassed, username, comment, fileswid, project) VALUES ($1, $2, $3, $4, $5, $6)';
  const update = 'UPDATE FileQc SET filepath = $1, qcpassed = $2, username = $3, comment = $4 WHERE fileswid = $5';
  let createOrUpdate;
  let fileQcAttributes = [filePath, qcPassed, username, comment, fileSWID];
  // first, check if the record already exists
  db.any(select, [fileSWID])
    .then(function(data) {
      // update if record exists; create if it does not
      if (data.length) {
        createOrUpdate = update;
      } else {
        createOrUpdate = create;
        fileQcAttributes.push(project);
      }

      db.none(createOrUpdate, fileQcAttributes)
        .then(function() {
          res.status(201)
            .json({ 'swid': fileSWID, 'errors': [] });
          next();
        })
        .catch(function(err) {
          //debug(err);
          console.log(err); // TODO: fix this into proper logging and debugging
          if (err.error.contains('duplicate key') && err.error.contains('filepath')) {
            next(generateError(400, 'FileQC at path ' + filePath + ' is already associated with a different fileSWID'));
          } else {
            next(generateError(500, 'Failed to create FileQC record'));
          }
        });
    })
    .catch(function(err) {
      //debug(err);
      console.log(err); // TODO: fix this into proper logging and debugging
      return next(generateError(500, 'Failed to check if FileQC record already exists'));
    });
}

function validateProject(param, next) {
  const proj = param || null;
  if (proj == null || !proj.length) return next(generateError(400, 'Error: project must be provided'));
  return proj;
}

function validateSwid(param, next) {
  const swid = parseInt(param);
  if (Number.isNaN(swid)) return next(generateError(400, 'Error: swid is ' + param + ' but must be an integer'));
  return swid;
}

function validateUsername(param, next) {
  const user = nullifyIfBlank(param);
  if (user == null || !user.length) return next(generateError(400, 'Error: username must be provided'));
  return user;
}

function validateComment(param) {
  let comment = nullifyIfBlank(param);
  if (comment !== null) comment = decodeURIComponent(comment.replace(/\+/g,  ' '));
  return comment;
}

function validateFilepath(param, next) {
  let fp = nullifyIfBlank(param);
  if (fp == null || !fp.length) return next(generateError(400, 'Error: filepath must be provided'));
  fp = decodeURIComponent(fp.replace(/\+/g, ' '));
  return fp;
}

function generateError(statusCode, errorMessage) {
  const err = {
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
  const statusToBool = {
    'pass': true,
    'fail': false,
    'pending': null
  };
  return statusToBool[value.toLowerCase()];
}
