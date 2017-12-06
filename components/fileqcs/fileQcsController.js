'use strict';

const pgp = require('pg-promise')({});
const pg = pgp(process.env.DB_CONNECTION);
const basesqlite3 = require('sqlite3');
const sqlite3 = ((process.env.DEBUG || 'false') === 'true') ? basesqlite3.verbose() : basesqlite3;
const fpr = new sqlite3.Database(process.env.SQLITE_LOCATION + '/fpr.db', sqlite3.OPEN_READWRITE);
const logger = require('winston');

// configure SQLite connection so that reading from and writing to are non-blocking
fpr.run('PRAGMA journal_mode = WAL;');

/** set up custom error if bad params are given */
function ValidationError (message) {
  this.message = message;
}
ValidationError.prototype = Error.prototype;

/**
 * Get a single FileQC by File SWID
 */
const getFileQcBySwid = async (req, res, next) => {
  try {
    let swid;
    swid = validateSwid(req.params.identifier, next);

    const results = await Promise.all([getSingleFprResult(swid), getSingleFqcResult(swid)]);
    // merge results from FPR and FQC queries (throws if we don't have either an FPR result or an FQC result)
    const mergedFileQc = mergeOneFileResult(results[0], results[1].fileqc);
    res.status(200).json({ fileqc: mergedFileQc, errors: results[1].errors });
    next();
  } catch (e) { 
    handleErrors(e, 'Error getting record', next);
  }
};

/**
 * Get all FileQCs restricted by Project or File SWIDs
 */
const getAllFileQcs = async (req, res, next) => {
  try {
    let proj, swids, qcStatus;
    proj = nullifyIfBlank(req.query.project);
    swids = validateSwids(req.query.fileswids);
    qcStatus = req.query.qcstatus; 

    let results;
    if (qcStatus === null || typeof qcStatus == 'undefined') {
      results = await getByProjOrSwids(proj, swids);
    } else {
      results = await getByProjAndQcStatus(proj, qcStatus);
    }
    res.status(200).json({ fileqcs: results, errors: [] });
    next();
  } catch (e) {
    handleErrors(e, 'Error getting records', next);
  }
};

const getByProjOrSwids = async (proj, swids) => {
  let getFprByProjOrSwids, getFqcByProjOrSwids;
  if (proj != null) {
    getFprByProjOrSwids = () => getFprResultsByProject(proj);
    getFqcByProjOrSwids = () => getFqcResultsByProject(proj);
  } else if (swids != null) {
    getFprByProjOrSwids = () => getFprResultsBySwids(swids);
    getFqcByProjOrSwids = () => getFqcResultsBySwids(swids);
  } else {
    throw new ValidationError('Must supply project or fileswid(s)');
  }

  try {
    const results = await Promise.all([getFprByProjOrSwids(), getFqcByProjOrSwids()]);
    // merge the results from the File Provenance report and the FileQC database
    return mergeFileResults(results[0], results[1].fileqcs);
  } catch (e) {
    throw e;
  }

};

const getByProjAndQcStatus = async (proj, qcStatus) => {
  try {
    const qcpassed = validateQcStatus(qcStatus, false);
    if (qcpassed === null) {
      // get only items from FPR that are not in FileQC
      let fileQcSwids = await getAllFileQcSwids();
      fileQcSwids = fileQcSwids.map(o => parseInt(o.fileswid));
      const pendingFprs = await getFprsNotInFileQc(proj, fileQcSwids);
      return mergeFileResults(pendingFprs, []);
    } else {
      // get only the items which are listed as either PASS or FAIL in FileQC
      const fqcs = await getFqcResultsByProjAndQcStatus(proj, qcpassed);
      const swids = fqcs.map(record => record.fileswid);
      const fprs = await getFprResultsBySwids(swids);
      return mergeFileResults(fprs, fqcs);
    }
  } catch (e) {
    throw e;
  }
};

/**
 * Add a single FileQC
 */
const addFileQc = async (req, res, next) => {
  try {
    const fqc = {
      fileswid: validateSwid(req.query.fileswid),
      username: validateUsername(req.query.username),
      comment: validateComment(req.query.comment),
      qcpassed: validateQcStatus(req.query.qcstatus, true)
    };

    const fpr = await getSingleFprResult(fqc.fileswid);
    const hydratedFqc = hydrateOneFqcPreSave(fpr, fqc);
    const fqcInsert = await upsertSingleFqc(hydratedFqc);
    // merge the results
    const merged = mergeOneFileResult(fpr, hydratedFqc);
    res.status(201).json({ fileqc: merged, errors: fqcInsert.errors });
    next();
  } catch (e) {
    handleErrors(e, 'Error adding record', next);
  }
};

const hydrateOneFqcPreSave = (fpr, fqc) => {
  fqc.project = fpr.project || 'NotInFileProvenance';
  fqc.filepath = fpr.filepath || '';
  return fqc;
};

const hydrateFqcsPreSave = (fprs, fqcs, req) => {
  if (fprs.length > fqcs.length) {
    logger.error(`[${req.uid}]: Batch add FileQCs: ended up with more FPR records than FQCs submitted. Very mysterious.`);
    throw new Error('Error getting File Provenance records');
  } else {
    // fprHash: { fileswid: indexInFprArray }
    const fprHash = {};
    fprs.map((fpr, index) => fprHash[fpr.fileswid] = index );
    return fqcs.map((fqc) => {
      const correspondingFpr = fprs[fprHash[fqc.fileswid]] || {};
      return hydrateOneFqcPreSave(correspondingFpr, fqc);
    });
  }
};

/**
 * Batch add FileQCs
 */
const addManyFileQcs = async (req, res, next) => {
  try {
    if (!req.body.fileqcs) throw generateError(400, 'Error: no FileQCs found in request body');

    const validationResults = validateObjectsFromUser(req.body.fileqcs);
    if (validationResults.errors.length) return next(generateError(400, validationResults.errors));
    const toSave = validationResults.validated;
    const swids = toSave.map(record => record.fileswid);
    const fprs = await getFprResultsBySwids(swids);
    const hydratedFqcs = hydrateFqcsPreSave(fprs, toSave, req);

    const fqcInserts = await upsertFqcs(hydratedFqcs);
    // merge the results
    const merged = mergeFileResults(fprs, fqcInserts.fileqcs);
    res.status(200).json({ fileqcs: merged, errors: fqcInserts.errors });
    next();
  } catch (e) {
    handleErrors(e, 'Error adding records', next);
  }
};

/** success returns the last time that the File Provenance Report was imported into SQLite */
const getMostRecentFprImportTime = () => {
  return new Promise((resolve, reject) => {
    fpr.get('SELECT * FROM fpr_import_time ORDER BY lastimported DESC LIMIT 1', [], (err, data) => {
      if (err) reject(err);
      resolve(new Date(data.lastimported).getTime()); 
    });
  });
};

// validation functions

function validateSwid (param) {
  const swid = parseInt(param);
  if (Number.isNaN(swid)) throw new ValidationError('FileSWID is ' + param + ' but must be an integer');
  return swid;
}

/** Expects a comma-separated list of File SWIDs and returns the valid numbers within */
function validateSwids (param) {
  if (nullifyIfBlank(param) == null) return null;
  return param.split(',').map(num => parseInt(num)).filter(num => !Number.isNaN(num));
}

function validateUsername (param) {
  const user = nullifyIfBlank(param);
  if (user == null || !user.length) throw new ValidationError('Username must be provided');
  return user;
}

function validateComment (param) {
  let comment = nullifyIfBlank(param);
  if (comment !== null) comment = decodeURIComponent(comment.replace(/\+/g,  ' '));
  return comment;
}

function validateQcStatus (param, throwIfNull) {
  let qcPassed = nullifyIfBlank(param);
  if (qcPassed === null && throwIfNull) throw new ValidationError('FileQC must be saved with qcstatus "PASS" or "FAIL"');
  qcPassed = convertQcStatusToBoolean(qcPassed);
  return qcPassed;
}

function nullifyIfBlank (value) {
  if (typeof value == 'undefined' || value === null || value.length == 0) value = null;
  return value;
}

/** Must deal with null qcStatus check elsewhere */
function convertQcStatusToBoolean (value) {
  value = value.toLowerCase();
  const statusToBool = {
    'pass': true,
    'fail': false,
    'pending': null
  };
  if (typeof statusToBool[value] == 'undefined') throw new ValidationError('Unknown QC status ' + value);
  return statusToBool[value];
}

function generateError (statusCode, errorMessage) {
  const err = {
    status: statusCode,
    errors: [errorMessage]
  };
  return err;
}

function handleErrors (e, defaultMessage, next) {
  if (e instanceof ValidationError) {
    logger.info(e);
    next(generateError(400, e.message));
  } else if (e.status) {
    logger.info(e.message);
    return next(e); // generateError has already been called, usually because it's a user error
  } else {
    logger.error(e);
    next(generateError(500, defaultMessage));
  }
}

/** returns an object { validated: {}, errors: [] } */
function validateObjectsFromUser (unvalidatedObjects) {
  let validationErrors = [];
  let validatedParams = unvalidatedObjects.map(unvalidated => {
    try {
      return {
        qcpassed: validateQcStatus(unvalidated.qcstatus, true),
        username: validateUsername(unvalidated.username),
        comment: validateComment(unvalidated.comment),
        fileswid: validateSwid(unvalidated.fileswid)
      };
    } catch (e) {
      if (e instanceof ValidationError) {
        validationErrors.push({ fileswid: unvalidated.fileswid, error: e.message });
        return null;
      } else {
        throw e;
      } 
    }
  });

  return { validated: validatedParams, errors: validationErrors };
}

/**
 * A note on punctuation in this file:
 * - SQLite queries use `?` for parameter substitution
 * - Postgres queries use `$1` for parameter substitution with two or fewer parameters,
 *     and array of item(s) is passed in to the SQL call
 * - Postgres queries use `${namedProp}` for parameter substitution with three or more 
 *     parameters, and an object with those properties is passed in to the SQL call
 */

/** success returns a single File Provenance Report result */
function getSingleFprResult (swid) {
  return new Promise((resolve, reject) => {
    fpr.get('SELECT * FROM fpr WHERE fileswid = ?', [swid], (err, data) => {
      if (err) reject(generateError(500, err));
      resolve((data ? data : {}));
    });
  });
}

/** success returns a single FileQC result */
function getSingleFqcResult (swid) {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM FileQc WHERE fileswid = $1';
    pg.any(sql, [swid])
      .then(data => { 
        if (!data || data.length == 0) resolve({ fileqc: {}, errors: [] });
        resolve({ fileqc: data[0], errors: [] });
      })
      .catch(err => {
        logger.error(err);
        reject(generateError(500, 'Error retrieving record'));
      });
  });
}

/** success returns an array of File Provenance results filtered by the given project */
function getFprResultsByProject (project) {
  return new Promise((resolve, reject) => {
    fpr.all('SELECT * FROM fpr WHERE project = ? ORDER BY fileswid ASC', [project], (err, data) => {
      if (err) reject(generateError(500, err));
      resolve(data ? data : []);
    });
  });
}

/** success returns an array of File Provenance results filtered by the given file SWIDs */
function getFprResultsBySwids (swids) {
  return new Promise((resolve, reject) => {
    fpr.all('SELECT * FROM fpr WHERE fileswid IN (' + swids.join() + ') ORDER BY fileswid ASC', (err, data) => {
      if (err) reject(generateError(500, err));
      resolve(data ? data : []);
    });
  });
}

/** success returns an array of FileQCs filtered by the given project */
function getFqcResultsByProject (project) {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM FileQC WHERE project = $1 ORDER BY fileswid ASC';
    pg.any(sql, [project])
      .then(data => {
        resolve({ fileqcs: (data ? data : []), errors: [] });
      })
      .catch(err => {
        logger.error(err);
        reject(generateError(500, 'Error retrieving records'));
      });
  });
}

/** success returns an array of FileQCs filtered by the given file SWIDs */
function getFqcResultsBySwids (swids) {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM FileQC WHERE fileswid in (' + swids.join() + ') ORDER BY fileswid ASC';
    pg.any(sql)
      .then(data => {
        resolve({ fileqcs: (data ? data : []), errors: [] });
      })
      .catch(err => {
        logger.error(err);
        reject(generateError(500, 'Error retrieving records'));
      });
  });
}

/** success returns an object containing the fileswid and an array of errors */
function upsertSingleFqc (fqc) {
  return new Promise((resolve, reject) => {
    // update if exists, insert if not
    const upsert = 'INSERT INTO FileQc as fqc (filepath, qcpassed, username, comment, fileswid, project) VALUES (${filepath}, ${qcpassed}, ${username}, ${comment}, ${fileswid}, ${project}) ON CONFLICT (fileswid) DO UPDATE SET filepath = ${filepath}, qcpassed = ${qcpassed}, username = ${username}, comment = ${comment} WHERE fqc.fileswid = ${fileswid}';

    pg.none(upsert, fqc)
      .then(() => {
        resolve({ fileswid: fqc.fileswid, errors: [] });
      })
      .catch(err => {
        if (err.message.includes('duplicate key') && err.message.includes('filepath')) {
          logger.error(err);
          reject(generateError(400, 'filepath ' + fqc.filepath + ' is already associated with another fileswid'));
        } else {
          logger.error(err);
          reject(generateError(500, 'Failed to create FileQC record'));
        }
      });
  });
}

function getFilepathFromError (errorDetail) {
  return errorDetail.split('(')[2].split(')')[0];
}

function upsertFqcs (fqcs) {
  return new Promise((resolve, reject) => {
    const upsert = 'INSERT INTO FileQc as fqc (filepath, qcpassed, username, comment, fileswid, project) VALUES (${filepath}, ${qcpassed}, ${username}, ${comment}, ${fileswid}, ${project}) ON CONFLICT (fileswid) DO UPDATE SET filepath = ${filepath}, qcpassed = ${qcpassed}, username = ${username}, comment = ${comment} WHERE fqc.fileswid = ${fileswid}';

    pg.tx('batch', t => {
      const queries = [];
      for (let i = 0; i < fqcs.length; i++) {
        queries.push(t.none(upsert, fqcs[i]));
      }
      return t.batch(queries);
    })
      .then(() => {
        const returnInfo = fqcs.sort((a, b) => {
          return parseInt(a.fileswid) - parseInt(b.fileswid);
        });
        return resolve({ fileqcs: returnInfo, errors: [] });
      })
      .catch(err => {
        if (err.message.includes('duplicate key') && err.message.includes('filepath')) {
          const dupes = err.data.filter(tx => !tx.success).map(tx => getFilepathFromError(tx.result.detail));
          logger.error(err);
          reject(generateError(400, 'filepath(s) already associated with another fileswid: ' + dupes.join(', ')));
        } else {
          logger.error(err.error);
          reject(generateError(500, 'Failed to create FileQC record'));
        }
      });
  });
}

const getAllFileQcSwids = () => {
  return new Promise((resolve, reject) => {
    pg.any('SELECT fileswid FROM fileqc', [])
      .then(data => resolve(data))
      .catch(err => reject(err)); 
  });
};

const getFqcResultsByProjAndQcStatus = (proj, qcpassed) => {
  return new Promise((resolve, reject) => {
    pg.any('SELECT * FROM fileqc WHERE project = $1 AND qcpassed = $2 ORDER BY fileswid ASC', [proj, qcpassed])
      .then(data => resolve(data))
      .catch(err => reject(err));
  });
};

const getFprsNotInFileQc = (proj, fileQcSwids) => {
  return new Promise((resolve, reject) => {
    fpr.all('SELECT * FROM fpr WHERE fileswid NOT IN (' + fileQcSwids.join() + ') AND project = ? ORDER BY fileswid ASC', [proj], (err, data) => {
      if (err) reject(err);
      resolve(data);
    });
  });
};


/** returns the union of the non-null fields of a File Provenance Report object and a FileQC object */
function mergeOneFileResult (fpr, fqc) {
  if (!fpr.fileswid && !fqc.fileswid) {
    throw new ValidationError('Cannot find any matching record in either file provenance or FileQC.');
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
function mergeFileResults (fprs, fqcs) {
  const merged = [];
  for (let i = 0, j = 0; (i <= fprs.length && j <= fqcs.length);) {
    if (i < fprs.length && (j >= fqcs.length || fprs[i].fileswid < fqcs[j].fileswid)) {
      // File Provenance record has no corresponding FileQC record
      merged.push(yesFprNoFqc(fprs[i]));
      i++;
    } else if (j < fqcs.length && (i >= fprs.length || fprs[i].fileswid > fqcs[j].fileswid)) {
      // FileQC record has no corresponding File Provenance record
      merged.push(noFprYesFqc(fqcs[j]));
      j++;
    } else if (i == fprs.length && j == fqcs.length) {
      // regrettable that we need to check for this
      break;
    } else if (fprs[i].fileswid == fqcs[j].fileswid) {
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
function yesFprNoFqc (fpr) {
  fpr.upstream = parseUpstream(fpr.upstream);
  fpr.qcstatus = 'PENDING';
  return fpr;
}

/** If a record is in the FileQC database but not in the File Provenance Report database,
 * something weird has happened. Return it and indicate that it's not in the FPR */
function noFprYesFqc (fqc) {
  fqc.stalestatus = 'NOT IN FILE PROVENANCE';
  fqc.qcstatus = (fqc.qcpassed == true ? 'PASS' : 'FAIL');
  delete fqc.qcpassed;
  if (!fqc.comment) delete fqc.comment;
  fqc.fileswid = parseInt(fqc.fileswid);
  return fqc;
}

/** If a record is in both the File Provenance Report and FileQC databases,
 * merge the relevant info */
function yesFprYesFqc (fpr, fqc) {
  if (fpr.fileswid != fqc.fileswid) throw new Error('Cannot merge non-matching files');
  const merged = Object.assign({}, fpr);
  merged.upstream = parseUpstream(merged.upstream);
  merged.qcstatus = (fqc.qcpassed == true ? 'PASS' : 'FAIL');
  merged.username = fqc.username;
  if (fqc.comment) merged.comment = fqc.comment;
  return merged;
}

/** comes out of the db as "123;124" */
function parseUpstream (upstream) {
  if (typeof upstream == 'undefined' || upstream == null) {
    return [];
  } else if (typeof upstream == 'number') {
    return [upstream];
  } else if (Array.isArray(upstream)) {
    return upstream;
  } else {
    return upstream.split(';').map(us => parseInt(us));
  }
}

module.exports = {
  getFileQc: getFileQcBySwid,
  getAllFileQcs: getAllFileQcs,
  addFileQc: addFileQc,
  addManyFileQcs: addManyFileQcs,
  getMostRecentFprImportTime: getMostRecentFprImportTime
};


