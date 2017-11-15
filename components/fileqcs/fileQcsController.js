'use strict';

const pgp = require('pg-promise')();
const pg = pgp(process.env.DB_CONNECTION);
const sqlite3 = require('sqlite3');
const path = require('path');
const sqlite_path = path.resolve(__dirname, '../fpr/fpr.db');
const fpr = new sqlite3.Database(sqlite_path);
fpr.run('PRAGMA journal_mode = WAL;');

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
  pg.any(sql, [swid])
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
  pg.any(sql, [proj])
    .then(data => {
      // TODO: something in here about DTOifying the responses
      res.status(200)
        .json({ fileqcs: data, errors: [] });
      next();
    })
    .catch(err => {
      console.log(err);
      return next(generateError(500, 'Error retrieving records'));
    });
}

function addFileQc(req, res, next) {
  // TODO: fix this
  const fqc = {};
  try {
    fqc.project = validateProject(req.query.project);
    fqc.filepath = validateFilepath(req.query.filepath);
    fqc.fileswid = validateSwid(req.query.fileswid);
    fqc.username = validateUsername(req.query.username);
    fqc.comment = validateComment(req.query.comment);
    fqc.qcpassed = validateQcStatus(req.query.qcstatus);
  } catch (e) {
    if (e instanceof ValidationError) return next(generateError(400, e.message));
  }

  // update if exists, insert if not
  const upsert = 'INSERT INTO FileQc as fqc (filepath, qcpassed, username, comment, fileswid, project) VALUES (${filepath}, ${qcpassed}, ${username}, ${comment}, ${fileswid}, ${project}) ON CONFLICT (fileswid) DO UPDATE SET filepath = ${filepath}, qcpassed = ${qcpassed}, username = ${username}, comment = ${comment} WHERE fqc.fileswid = ${fileswid}';

  pg.none(upsert, fqc)
    .then(() => {
      res.status(201)
        .json({ fileswid: fqc.fileswid, errors: [] });
      next();
    })
    .catch(err => {
      console.log(err); // TODO: fix this into proper logging and debugging
      if (err.error.contains('duplicate key') && err.error.contains('filepath')) {
        next(generateError(400, 'FileQC at path ' + fqc.filepath + ' is already associated with a different fileSWID'));
      } else {
        next(generateError(500, 'Failed to create FileQC record'));
      }
    });
}

function addManyFileQcs(req, res, next) {
  if (!req.body.fileqcs) return next(generateError(400, 'Error: no FileQCs found in request body'));

  const validationResults = validateObjectsFromUser(req.body.fileqcs, req.body.project);
  if (validationResults.errors.length) return next(generateError(400, validationResults.errors));
  const toSave = validationResults.validated;

  const upsert = 'INSERT INTO FileQc as fqc (filepath, qcpassed, username, comment, fileswid, project) VALUES (${filepath}, ${qcpassed}, ${username}, ${comment}, ${fileswid}, ${project}) ON CONFLICT (fileswid) DO UPDATE SET filepath = ${filepath}, qcpassed = ${qcpassed}, username = ${username}, comment = ${comment} WHERE fqc.fileswid = ${fileswid}';

  pg.tx('batch', t => {
    const queries = [];
    for (let i = 0; i < toSave.length; i++) {
      queries.push(t.none(upsert, toSave[i]));
    }
    return t.batch(queries);
  })
    .then(()=> {
      const returnInfo = toSave.map(fqc => { return { fileswid: fqc.fileswid, upstream: [] }; });
      res.status(201)
        .json({ errors: [], fileqcs: returnInfo });
    })
    .catch(err => {
      console.log(err); // TODO: fix this into proper logging and debugging
      return next(generateError(500, err.error));
    });
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

function validateQcStatus(param) {
  let qcPassed = nullifyIfBlank(param);
  if (qcPassed === null) throw new ValidationError('FileQC must be saved with qcstatus "PASS" or "FAIL"');
  qcPassed = convertQcStatusToBoolean(qcPassed);
  return qcPassed;
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

/** Must deal with null qcStatus check elsewhere */
function convertQcStatusToBoolean(value) {
  value = value.toLowerCase();
  const statusToBool = {
    'pass': true,
    'fail': false,
    'pending': null
  };
  if (statusToBool[value] == null) throw new ValidationError('Unknown QC status ' + value);
  return statusToBool[value];
}

/** returns an object { validated: {}, errors: [] } */
function validateObjectsFromUser(unvalidatedObjects, unvalidatedProject) {
  let validationErrors = [];
  let validatedParams = unvalidatedObjects.map(unvalidated => {
    // project may be passed in separately from the fileqcs, or as part of the fileqcs array
    const proj = unvalidatedProject || unvalidated.project;
    try {
      return {
        filepath: validateFilepath(unvalidated.filepath),
        qcpassed: validateQcStatus(unvalidated.qcstatus),
        username: validateUsername(unvalidated.username),
        comment: validateComment(unvalidated.comment),
        fileswid: validateSwid(unvalidated.fileswid),
        project: validateProject(proj)
      }
    } catch (e) {
      if (e instanceof ValidationError) {
        validationErrors.push({ fileswid: unvalidated.fileswid, error: e.message });
        return null;
      } else {
        console.log(e.error);
        throw e;
      } 
    }
  });

  return { validated: validatedParams, errors: validationErrors };
}
