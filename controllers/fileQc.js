'use strict';

const pgp = require('pg-promise')();
const db = pgp(process.env.DB_CONNECTION);

module.exports = {
  getFileQc: getFileQcBySwid,
  getAllFileQcs: getAllFileQcs,
  addFileQc: addFileQc,
  addManyFileQcs: addManyFileQcs
};

// set up custom error if bad params are given
function ValidationError(message) {
  this.message = message;
}
ValidationError.prototype = Error.prototype;

function getFileQcBySwid(req, res, next) {
  let swid;
  try {
    swid = validateSwid(req.params.identifier, next);
  } catch (e) {
    if (e instanceof ValidationError) return next(generateError(400, e.message));
  }

  const sql = 'SELECT * FROM FileQC WHERE fileswid = $1';
  db.any(sql, [swid])
    .then(data => { 
      if (!data || data.length == 0) {
        return next(generateError(404, 'No FileQC found for file with SWID ' + swid));
      }
      
      // TODO: something about DTOifying the response?
      res.status(200)
        .json({ fileqc: data, errors: [] });
      next();
    })
    .catch(err => {
      //debug(err);
      console.log(err);
      return next(generateError(500, 'Error retrieving record'));
    });
}

function getAllFileQcs(req, res, next) {
  // access the project param
  let proj;
  try {
    proj = validateProject(req.query.project);
  } catch (e) {
    if (e instanceof ValidationError) return next(generateError(400, e.message));
  }

  const sql = 'SELECT * FROM FileQC WHERE project = $1';
  db.any(sql, [proj])
    .then(data => {
      // TODO: something in here about DTOifying the responses
      res.status(200)
        .json({ fileqcs: data, errors: [] });
      next();
    })
    .catch(err => {
      //debug(err);
      console.log(err);
      return next(generateError(500, 'Error retrieving records'));
    });
}

function addFileQc(req, res, next) {
  // TODO: fix this
  let project, filePath, fileSWID, username, comment, qcPassed;
  try {
    project = validateProject(req.query.project);
    filePath = validateFilepath(req.query.filepath);
    fileSWID = validateSwid(req.query.fileswid);
    username = validateUsername(req.query.username);
    comment = validateComment(req.query.comment);
    qcPassed = convertQcStatusToBoolean(req.query.qcstatus);
    if (qcPassed === null) throw new ValidationError('FileQC must be saved with status "PASS" or "FAIL"');
  } catch (e) {
    if (e instanceof ValidationError) return next(generateError(400, e.message));
  }

  // update if exists, insert if not
  const upsert = 'INSERT INTO FileQc as fqc (filepath, qcpassed, username, comment, fileswid, project) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (fileswid) DO UPDATE SET filepath = $1, qcpassed = $2, username = $3, comment = $4 WHERE fqc.fileswid = $5';

  db.none(upsert, [filePath, qcPassed, username, comment, fileSWID, project])
    .then(() => {
      res.status(201)
        .json({ fileswid: fileSWID, errors: [] });
      next();
    })
    .catch(err => {
      //debug(err);
      console.log(err); // TODO: fix this into proper logging and debugging
      if (err.error.contains('duplicate key') && err.error.contains('filepath')) {
        next(generateError(400, 'FileQC at path ' + filePath + ' is already associated with a different fileSWID'));
      } else {
        next(generateError(500, 'Failed to create FileQC record'));
      }
    });
}

function addManyFileQcs(req, res, next) {
  if (!req.body) return next(generateError(400, 'Error: no FileQCs found in request body"\'));
  const validationResults = validateObjectsFromUser(req.body.fileqcs, req.body.project);
  if (valiationResults.errors.length) return next(generateError(400, validationResults.errors));

  const upsert = 'INSERT INTO FileQc as fqc (filepath, qcpassed, username, comment, fileswid, project) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (fileswid) DO UPDATE SET filepath = $1, qcpassed = $2, username = $3, comment = $4 WHERE fqc.fileswid = $5';

  db.tx('batch', t => {

  })
  .then(data => {

  })
  .catch(err => {

  })
}

// validation functions
function validateProject(param) {
  const proj = param || null;
  if (proj == null || !proj.length) throw new ValidationError('Project must be provided');
  return proj;
}

function validateSwid(param) {
  const swid = parseInt(param);
  if (Number.isNaN(swid)) throw new ValidationError('FileSWID is ' + param + ' but must be an integer');
  return swid;
}

function validateUsername(param) {
  const user = nullifyIfBlank(param);
  if (user == null || !user.length) throw new ValidationError('Username must be provided');
  return user;
}

function validateComment(param) {
  let comment = nullifyIfBlank(param);
  if (comment !== null) comment = decodeURIComponent(comment.replace(/\+/g,  ' '));
  return comment;
}

function validateFilepath(param) {
  let fp = nullifyIfBlank(param);
  if (fp == null || !fp.length) throw new ValidationError('Filepath must be provided');
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

function validateObjectsFromUser(unvalidatedObjects, unvalidatedProject) {
  // returns an object { validated: [], errors: [] }
  let validationErrors = [];
  let validatedObjects = unvalidatedObjects.map(validateFileQcObject);
  return { validated: validatedObjects, errors: validationErrors };
  
  function validateFileQcObject(unvalidated) {
    const validated = {};
    try {
      validated.project = validateProject(unvalidatedProject);
      validated.filepath = validateFilepath(unvalidated.filepath);
      validated.fileswid = validateSwid(unvalidated.fileswid);
      validated.username = validateUsername(unvalidated.username);
      validated.comment = validateComment(unvalidated.comment);
      validated.qcpassed = validateQcPassed(unvalidated.qcstatus);
      if (qcPassed === null) throw new ValidationError('FileQC must be saved with status "PASS" or "FAIL"');
    } catch (e) {
      if (e instanceof ValidationError) {
        validationErrors.push({ fileswid: unvalidated.fileswid, error: e.message });
        return null;
      }
    }
  }
}
