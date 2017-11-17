'use strict';

const pgp = require('pg-promise')();
const pg = pgp(process.env.DB_CONNECTION);
const sqlite3 = require('sqlite3').verbose(); // TODO: remove `verbose()` in production
const path = require('path');
const sqlite_path = path.resolve(__dirname, '../fpr/fpr.db');
const fpr = new sqlite3.Database(sqlite_path, sqlite3.OPEN_READONLY);

// configure SQLite connection so that reading from and writing to are non-blocking
fpr.run('PRAGMA journal_mode = WAL;');

const maxResults = 100;

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

  // get the File Provenance record for this SWID, as well as our FileQC record
  Promise.all([getSingleFprResult(swid), getSingleFqcResult(swid)])
    .then((results) => {
      // merge results from FPR and FQC queries (throws if we don't have either an FPR result or an FQC result)    
      try {
        const mergedFileQc = mergeOneFileResult(results[0], results[1].fileqc);
        res.status(200).json({ fileqc: mergedFileQc, errors: results[1].errors });
        next();
      } catch (e) {
        return next(generateError(500, e.message));
      }
    })
    .catch((err) => next(err));
}

function getAllFileQcs(req, res, next) {
  // access the project param
  let proj;
  try {
    proj = validateProject(req.query.project);
  } catch (e) {
    if (e instanceof ValidationError) return next(generateError(400, e.message));
  }
  // TODO: add in check if user has supplied SWIDs instead

  const numResults = getLimit(req.query.numresults);
  // get the File Provenance and FileQC records for these FileQCs, and merge the results
  Promise.all([getFprResultsByProject(proj, numResults), getFqcResultsByProject(proj, numResults)])
    .then((results) => {
      // merge the results
      try {
        const merged = mergeFileResults(results[0], results[1].fileqcs);
        res.status(200).json({ fileqcs: merged, errors: results[1].errors });
        next();
      } catch (e) {
        if (e instanceof ValidationError) return next(generateError(500, e.message));
        return next(generateError(500, 'Error processing files'));
      }
    })
    .catch((err) => next(err));
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

function getLimit(queryNumResults) {
  // return the lesser of the query num or the maxResults.
  queryNumResults = parseInt(queryNumResults);
  if (queryNumResults && typeof queryNumResults == 'number' && queryNumResults > 0){
    return Math.min(queryNumResults, maxResults);
  } else {
    return maxResults;
  }
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
      };
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

/** success returns a single File Provenance Report result */
function getSingleFprResult(swid) {
  return new Promise((resolve, reject) => {
    fpr.get('SELECT * FROM fpr WHERE fileswid = ?', [swid], (err, data) => {
      if (err) reject(generateError(500, err));
      resolve((data ? data : {}));
    });
  });
}

/** success returns a single FileQC result */
function getSingleFqcResult(swid) {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM FileQc WHERE fileswid = $1';
    pg.any(sql, [swid])
      .then(data => { 
        if (!data || data.length == 0) resolve({ fileqc: {}, errors: [] });
        resolve({ fileqc: data[0], errors: [] });
      })
      .catch(err => {
        console.log(err);
        reject(generateError(500, 'Error retrieving record'));
      });
  });
}

/** success returns an array of File Provenance results */
function getFprResultsByProject(project, numResults) {
  return new Promise((resolve, reject) => {
    fpr.all('SELECT * FROM fpr WHERE project = ? ORDER BY fileswid ASC LIMIT ?', [project, numResults], (err, data) => {
      if (err) reject(generateError(500, err));
      resolve(data ? data : []);
    });
  });
}

/** success returns an array of FileQCs */
function getFqcResultsByProject(project, numResults) {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM FileQC WHERE project = $1 ORDER BY fileswid ASC LIMIT $2';
    pg.any(sql, [project, numResults])
      .then(data => {
        if (!data || data.length == 0) resolve({ fileqcs: [], errors: [] });
        resolve({ fileqcs: data, errors: [] });
      })
      .catch(err => {
        console.log(err);
        reject(generateError(500, 'Error retrieving records'));
      });
  });
}

/** returns the union of the non-null fields of a File Provenance Report object and a FileQC object */
function mergeOneFileResult(fpr, fqc) {
  if (!fpr.fileswid && !fqc.fileswid) {
    throw new Error('Cannot find any matching record in either file provenance or FileQC.');
  } else if (fpr.fileswid && !fqc.fileswid) {
    // file exists in file provenance but hasn't been QCed
    return yesFprNoFqc(fpr);
  } else if (!fpr.fileswid && fqc.fileswid) {
    // this file is in the FileQC database but not in file provenance
    return noFprYesFqc(fqc);
  } else {
    // we have both file provenance and FileQC data, so merge them
    return yesFprYesFqc(fpr, fqc);
  }
}

/** combines the results then merges them  // TODO: fix this description
  * this only works if results are returned sorted by fileswid */
function mergeFileResults(fprs, fqcs) {
  const merged = [];
  for (let i = 0, j = 0; (i < fprs.length || j < fqcs.length);) {
    if ((j >= fqcs.length) || (fprs[i].fileswid < fqcs[i].fileswid)) {
      // File Provenance record has no corresponding FileQC record
      merged.push(yesFprNoFqc(fprs[i]));
      i++;
    } else if ((i >= fprs.length) || (fprs[i].fileswid > fqcs[i].fileswid)) {
      //FileQC record has no corresponding File Provenance record
      merged.push(noFprYesFqc(fqcs[j]));
      j++;
    } else if (fprs[i].fileswid == fqcs[i].fileswid) {
      merged.push(yesFprYesFqc(fprs[i], fqcs[j]));
      i++;
      j++;
    } else {
      // panic
      throw new ValidationError('Error merging file results');
    }
  }
  return merged;
}

/** If a record is in the File Provenance Report database but not in the FileQC database, 
 * then its QC status is 'PENDING' */
function yesFprNoFqc(fpr) {
  if (fpr.upstream == null) fpr.upstream = [];
  fpr.qcstatus = 'PENDING';
  return fpr;
}

/** If a record is in the FileQC database but not in the File Provenance Report database,
 * something weird has happened. Return it and indicate that it's not in the FPR */
function noFprYesFqc(fqc) {
  fqc.stalestatus = 'NOT IN FILE PROVENANCE';
  fqc.qcstatus = (fqc.qcpassed == true ? 'PASS' : 'FAIL');
  return fqc;
}

/** If a record is in both the File Provenance Report and FileQC databases,
 * merge the relevant info */
function yesFprYesFqc(fpr, fqc) {
  if (fpr.fileswid != fqc.fileswid) throw new Error('Cannot merge non-matching files');
  const merged = Object.assign({}, fpr);
  if (merged.upstream == null) merged.upstream = [];
  merged.qcstatus = (fqc.qcpassed == true ? 'PASS' : 'FAIL');
  merged.username = fqc.username;
  if (fqc.comment != null) merged.comment = fqc.comment;
  return merged;
}
