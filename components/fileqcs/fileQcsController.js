'use strict';

const pgp = require('pg-promise')({});
const pg = pgp(process.env.DB_CONNECTION);
const basesqlite3 = require('sqlite3');
const sqlite3 =
  (process.env.DEBUG || 'false') === 'true'
    ? basesqlite3.verbose()
    : basesqlite3;
const fpr = new sqlite3.Database(
  process.env.SQLITE_LOCATION + '/fpr.db',
  sqlite3.OPEN_READWRITE
);
const logger = require('winston');

/* some projects are represented with two different names. This contains only the duplicates,
 * and maps the long name to the short name */
const project_mappings = require('./project_mappings');

// configure SQLite connection so that reading from and writing to are non-blocking
fpr.run('PRAGMA journal_mode = WAL;');

/** set up custom error if bad params are given */
function ValidationError (message) {
  this.message = message;
}
ValidationError.prototype = Error.prototype;

const getAvailableConstants = async (req, res, next) => {
  try {
    const results = await Promise.all([listProjects(), listWorkflows()]);
    res.status(200).json({ projects: results[0], workflows: results[1] });
    next();
  } catch (e) {
    handleErrors(e, 'Error getting projects and workflows', next);
  }
};

/**
 * Get a single FileQC by File SWID
 */
const getFileQcBySwid = async (req, res, next) => {
  try {
    let swid = validateInteger(req.params.identifier, 'fileswid', true);

    const results = await Promise.all([
      getSingleFprResult(swid),
      getSingleFqcResult(swid)
    ]);
    // merge results from FPR and FQC queries (throws if we don't have either an FPR result or an FQC result)
    const mergedFileQc = mergeOneFileResult(results[0], results[1].fileqc);
    res.status(200).json({ fileqc: mergedFileQc, errors: results[1].errors });
    next();
  } catch (e) {
    handleErrors(e, 'Error getting record', next);
  }
};

/**
 * Get all FileQCs restricted by Project, QC Status, and/or Workflow, or File SWIDs
 */
const getAllFileQcs = async (req, res, next) => {
  try {
    let proj, swids, workflow, qcStatus;
    const validQueryParams = ['project', 'fileswids', 'workflow', 'qcstatus'];
    validateQueryParams(validQueryParams, req.query);
    proj = nullifyIfBlank(validateProject(req.query.project));
    swids = validateIntegers(req.query.fileswids, 'fileswid');
    workflow = nullifyIfBlank(req.query.workflow);
    qcStatus = nullifyIfBlank(req.query.qcstatus);

    let results;
    if (qcStatus !== null && proj !== null) {
      results = await getByProjAndQcStatus(proj, workflow, qcStatus);
    } else if (proj !== null) {
      results = await getByProjAndMaybeWorkflow(proj, workflow);
    } else if (swids !== null) {
      results = await getBySwids(swids);
    } else {
      throw new ValidationError('Must supply either project or fileswids');
    }

    res.status(200).json({ fileqcs: results, errors: [] });
    next();
  } catch (e) {
    handleErrors(e, 'Error getting records', next);
  }
};

const getBySwids = async swids => {
  try {
    const results = await Promise.all([
      getFprResultsBySwids(swids),
      getFqcResultsBySwids(swids)
    ]);
    // merge the results from the File Provenance report and the FileQC database
    return mergeFileResults(results[0], results[1].fileqcs);
  } catch (e) {
    throw e;
  }
};

const getByProjAndMaybeWorkflow = async (proj, workflow) => {
  try {
    const results = await Promise.all([
      getFprResultsByProject(proj, workflow),
      getFqcResultsByProject(proj)
    ]);
    return mergeFileResults(results[0], results[1].fileqcs);
  } catch (e) {
    throw e;
  }
};

const getByProjAndQcStatus = async (proj, workflow, qcStatus) => {
  try {
    const qcpassed = validateQcStatus(qcStatus, false);
    if (qcpassed === null) {
      // get only items from FPR that are not in FileQC
      let fileQcSwids = await getAllFileQcSwids();
      fileQcSwids = fileQcSwids.map(o => parseInt(o.fileswid));
      const pendingFprs = await getFprsNotInFileQc(proj, workflow, fileQcSwids);
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
      project: validateProject(req.query.project),
      fileswid: validateInteger(req.query.fileswid, 'fileswid', true),
      username: validateUsername(req.query.username),
      comment: validateComment(req.query.comment),
      qcpassed: validateQcStatus(req.query.qcstatus, true)
    };

    const fpr = await getSingleFprResult(fqc.fileswid);
    const hydratedFqc = hydrateOneFqcPreSave(fpr, fqc);
    const fqcInsert = await addSingleFqc(hydratedFqc);
    // merge the results
    const merged = mergeOneFileResult(fpr, hydratedFqc);
    res.status(201).json({ fileqc: merged, errors: fqcInsert.errors });
    next();
  } catch (e) {
    handleErrors(e, 'Error adding record', next);
  }
};

const hydrateOneFqcPreSave = (fpr, fqc) => {
  fqc.project = fpr.project || '';
  fqc.filepath = fpr.filepath || '';
  return fqc;
};

const hydrateFqcsPreSave = (fprs, fqcs, req) => {
  if (fprs.length > fqcs.length) {
    logger.error(
      `[${
        req.uid
      }]: Batch add FileQCs: ended up with more FPR records than FQCs submitted. Very mysterious.`
    );
    throw new Error('Error getting File Provenance records');
  } else {
    // fprHash: { fileswid: indexInFprArray }
    const fprHash = {};
    fprs.map((fpr, index) => (fprHash[fpr.fileswid] = index));
    return fqcs.map(fqc => {
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
    if (!req.body.fileqcs)
      throw generateError(400, 'Error: no "fileqcs" found in request body');

    const validationResults = validateObjectsFromUser(req.body.fileqcs);
    if (validationResults.errors.length)
      throw new ValidationError(validationResults.errors);
    const toSave = validationResults.validated;
    const swids = toSave.map(record => record.fileswid);
    const fprs = await getFprResultsBySwids(swids);
    const hydratedFqcs = hydrateFqcsPreSave(fprs, toSave, req);

    const fqcInserts = await addFqcs(hydratedFqcs);
    // merge the results
    const merged = mergeFileResults(fprs, fqcInserts.fileqcs);
    res.status(200).json({ fileqcs: merged, errors: fqcInserts.errors });
    next();
  } catch (e) {
    handleErrors(e, 'Error adding FileQCs', next);
  }
};

/**
 * Batch delete FileQCs
 */
const deleteManyFileQcs = async (req, res, next) => {
  try {
    if (Object.keys(req.body).indexOf('fileqcids') == -1)
      throw generateError(400, 'Error: no "fileqcids" found in request body');
    const fqcIds = req.body.fileqcids.map(
      fqcId => validateInteger(fqcId, 'fileQc ID', true),
      'fileqcid'
    );
    const username = validateUsername(req.body.username);
    const result = await deleteFqcs(fqcIds, username);
    res.status(200).json(result);
    next();
  } catch (e) {
    handleErrors(e, 'Error deleting records', next);
  }
};

/** success returns the last time that the File Provenance Report was imported into SQLite */
const getMostRecentFprImportTime = () => {
  return new Promise((resolve, reject) => {
    fpr.get(
      'SELECT * FROM fpr_import_time ORDER BY lastimported DESC LIMIT 1',
      [],
      (err, data) => {
        if (err) reject(generateError(500, err));
        resolve(new Date(data.lastimported).getTime());
      }
    );
  });
};

const validateQueryParams = (validParams, actualParams) => {
  for (let key in actualParams) {
    if (actualParams.hasOwnProperty(key) && validParams.indexOf(key) == -1) {
      throw new ValidationError(
        `Invalid parameter "${key}" given. Valid parameters are: ${validParams.join(
          ', '
        )}.`
      );
    }
  }
};

// validation functions
function validateProject (param) {
  if (nullifyIfBlank(param) == null) return null;
  param = param.trim();
  if (param.match(/[^a-zA-Z0-9-_']+/)) {
    throw new ValidationError('Project contains invalid characters');
  }
  // regrettably, `Catherine_O'Brien_Bug` is an existing project
  param = param.replace(/'/, '\'');
  return param;
}

function validateInteger (param, paramLabel, required) {
  if (nullifyIfBlank(param) == null) {
    if (required) {
      throw new ValidationError(`${paramLabel} is a required field`);
    } else {
      return null;
    }
  }
  const swid = parseInt(param);
  if (Number.isNaN(swid))
    throw new ValidationError(
      `Expected integer for ${paramLabel} but got ${param}`
    );
  return swid;
}

/** Expects a comma-separated list of File SWIDs and returns the valid numbers within */
function validateIntegers (param, paramLabel) {
  if (nullifyIfBlank(param) == null) return null;
  return param
    .split(',')
    .map(num => validateInteger(num, paramLabel))
    .filter(num => !Number.isNaN(num));
}

function validateUsername (param) {
  const user = nullifyIfBlank(param);
  if (user == null || !user.length)
    throw new ValidationError('Username must be provided');
  if (user.match(/\W+/))
    throw new ValidationError('Username must contain only letters');
  return user;
}

function validateComment (param) {
  let comment = nullifyIfBlank(param);
  if (comment !== null)
    comment = decodeURIComponent(comment.replace(/\+/g, ' '));
  return comment;
}

function validateQcStatus (param, throwIfNull) {
  let qcPassed = nullifyIfBlank(param);
  if (qcPassed === null && throwIfNull)
    throw new ValidationError(
      'FileQC must be saved with qcstatus "PASS" or "FAIL"'
    );
  qcPassed = convertQcStatusToBoolean(qcPassed);
  return qcPassed;
}

function nullifyIfBlank (value) {
  if (typeof value == 'undefined' || value === null || value.length == 0)
    value = null;
  return value;
}

/** Must deal with null qcStatus check elsewhere */
function convertQcStatusToBoolean (value) {
  value = value.toLowerCase();
  const statusToBool = {
    pass: true,
    fail: false,
    pending: null
  };
  if (typeof statusToBool[value] == 'undefined')
    throw new ValidationError('Unknown QC status ' + value);
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
        project: validateProject(unvalidated.project),
        qcpassed: validateQcStatus(unvalidated.qcstatus, true),
        username: validateUsername(unvalidated.username),
        comment: validateComment(unvalidated.comment),
        fileswid: validateInteger(unvalidated.fileswid, 'fileswid', true)
      };
    } catch (e) {
      if (e instanceof ValidationError) {
        validationErrors.push({
          fileswid: unvalidated.fileswid,
          error: e.message
        });
        return null;
      } else {
        throw e;
      }
    }
  });

  return { validated: validatedParams, errors: validationErrors };
}

/**
 * A note on punctuation in this section:
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
      resolve(data ? data : {});
    });
  });
}

/** success returns a single FileQC result */
function getSingleFqcResult (swid) {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM FileQc WHERE fileswid = $1 AND deleted = FALSE';
    pg
      .any(sql, [swid])
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

function listProjects () {
  return new Promise((resolve, reject) => {
    fpr.all(
      'SELECT DISTINCT project FROM fpr ORDER BY project ASC',
      [],
      (err, data) => {
        if (err) reject(generateError(500, err));
        resolve(data ? data.map(fpRecord => fpRecord.project) : []);
      }
    );
  });
}

function listWorkflows () {
  return new Promise((resolve, reject) => {
    fpr.all(
      'SELECT DISTINCT workflow FROM fpr ORDER BY workflow ASC',
      [],
      (err, data) => {
        if (err) reject(generateError(500, err));
        resolve(data ? data.map(fpRecord => fpRecord.workflow) : []);
      }
    );
  });
}

function getAllProjectNames (proj) {
  const ary = [proj];
  if (Object.keys(project_mappings).indexOf(proj) != -1)
    ary.push(project_mappings[proj]);
  return ary;
}

// for SQLite
function getQuestionMarkPlaceholders (items) {
  return items.map(() => '?').join(', ');
}

// for PostgreSQL
function getIndexedPlaceholders (items, offset = 0) {
  return items.map((item, index) => '$' + (index + offset + 1)).join(', ');
}

function getQuotedPlaceholders (workflowNames) {
  return workflowNames
    .split(',')
    .map(wf => '\'' + wf + '\'')
    .join(', ');
}

/** success returns an array of File Provenance results filtered by the given project */
function getFprResultsByProject (project, workflows) {
  // if project is represented with both long and short names in FPR, need to search by both names
  const projectNames = getAllProjectNames(project);
  const select =
    'SELECT * FROM fpr WHERE project IN (' +
    getQuestionMarkPlaceholders(projectNames) +
    ')' +
    (workflows == null
      ? ''
      : ' AND workflow IN (' + getQuotedPlaceholders(workflows) + ')') +
    ' ORDER BY fileswid ASC';
  return new Promise((resolve, reject) => {
    fpr.all(select, projectNames, (err, data) => {
      if (err) reject(generateError(500, err));
      resolve(data ? data : []);
    });
  });
}

/** success returns an array of File Provenance results filtered by the given file SWIDs */
function getFprResultsBySwids (swids) {
  const select =
    'SELECT * FROM fpr WHERE fileswid IN (' +
    swids.join() +
    ')' +
    ' ORDER BY fileswid ASC';
  return new Promise((resolve, reject) => {
    fpr.all(select, (err, data) => {
      if (err) reject(generateError(500, err));
      resolve(data ? data : []);
    });
  });
}

/** success returns an array of FileQCs filtered by the given project */
function getFqcResultsByProject (project) {
  // if project is represented with both long and short names in FPR, need to search by both names
  const projectNames = getAllProjectNames(project);
  const select =
    'SELECT * FROM FileQC WHERE project IN (' +
    getIndexedPlaceholders(projectNames) +
    ')' +
    ' AND deleted = FALSE' +
    ' ORDER BY fileswid ASC';
  return new Promise((resolve, reject) => {
    pg
      .any(select, projectNames)
      .then(data => {
        resolve({ fileqcs: data ? data : [], errors: [] });
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
    const sql =
      'SELECT * FROM FileQC WHERE fileswid in (' +
      swids.join() +
      ')' +
      ' AND deleted = FALSE' +
      ' ORDER BY fileswid ASC';
    pg
      .any(sql)
      .then(data => {
        resolve({ fileqcs: data ? data : [], errors: [] });
      })
      .catch(err => {
        logger.error(err);
        reject(generateError(500, 'Error retrieving records'));
      });
  });
}

/** success returns an object containing the fileswid and an array of errors */
function addSingleFqc (fqc) {
  return new Promise((resolve, reject) => {
    pg
      .task('add-one', t => {
        // wrapping in a transaction for error handling
        const insert = pgp.helpers.insert(fqc, fqcCols) + ' RETURNING fileqcid';
        return t.one(insert);
      })
      .then(data => {
        data['errors'] = [];
        resolve(data);
      })
      .catch(err => {
        logger.error(err);
        reject(generateError(500, 'Failed to create FileQC record'));
      });
  });
}

const fqcCols = new pgp.helpers.ColumnSet(
  ['filepath', 'qcpassed', 'username', 'comment', 'fileswid', 'project'],
  { table: 'fileqc' }
);

function addFqcs (fqcs) {
  return new Promise((resolve, reject) => {
    pg
      .task('add-many', t => {
        // wrapping in a transaction for error handling
        const insert = pgp.helpers.insert(fqcs, fqcCols);
        return t.none(insert);
      })
      .then(() => {
        const returnInfo = fqcs.sort((a, b) => {
          return parseInt(a.fileswid) - parseInt(b.fileswid);
        });
        return resolve({ fileqcs: returnInfo, errors: [] });
      })
      .catch(err => {
        logger.error(err);
        reject(generateError(500, 'Failed to create FileQC records'));
      });
  });
}

const deleteFqcs = (fileQcIds, username) => {
  const extraValidUserName = validateUsername(username);
  const fqcPlaceholders = getIndexedPlaceholders(fileQcIds);
  return new Promise((resolve, reject) => {
    const delete_stmt = `UPDATE FileQC SET deleted = TRUE, 
      comment = CONCAT(comment, '. Deleted by ${extraValidUserName} at ${new Date()}')
      WHERE fileqcid IN (${fqcPlaceholders}) RETURNING fileqcid`;
    pg
      .any(delete_stmt, fileQcIds)
      .then(data => {
        data = data.map(d => d.fileqcid);
        const unfound = fileQcIds.filter(id => data.indexOf(id) == -1);
        const yay = data.length
          ? [`Deleted FileQC(s) ${data.join(', ')}. `]
          : [];
        const nay = unfound.length
          ? [`Failed to delete FileQC(s) ${unfound.join(', ')}.`]
          : [];
        return resolve({ success: yay, errors: nay });
      })
      .catch(err => {
        logger.error(err.error);
        return reject(generateError(500, 'Failed to delete FileQC records'));
      });
  });
};

const getAllFileQcSwids = () => {
  return new Promise((resolve, reject) => {
    pg
      .any('SELECT fileswid FROM fileqc', [])
      .then(data => resolve(data))
      .catch(err => reject(generateError(500, err)));
  });
};

const getFqcResultsByProjAndQcStatus = (proj, qcpassed) => {
  // if project is represented with both long and short names, need to search by both names
  const params = getAllProjectNames(proj);
  let select =
    'SELECT * FROM FileQC WHERE project IN (' +
    getIndexedPlaceholders(params) +
    ')' +
    ' AND qcpassed = $' +
    (params.length + 1) +
    ' ORDER BY fileswid ASC';
  return new Promise((resolve, reject) => {
    pg
      .any(select, params.concat([qcpassed]))
      .then(data => resolve(data))
      .catch(err => reject(generateError(500, err)));
  });
};

const getFprsNotInFileQc = (proj, workflow, fileQcSwids) => {
  // if project is represented with both long and short names, need to search by both names
  const projectNames = getAllProjectNames(proj);
  const select =
    'SELECT * FROM fpr WHERE fileswid NOT IN (' +
    fileQcSwids.join() +
    ')' +
    ' AND project IN (' +
    getQuestionMarkPlaceholders(projectNames) +
    ')' +
    (workflow == null
      ? ''
      : ' AND workflow IN (' + getQuotedPlaceholders(workflow) + ')') +
    ' ORDER BY fileswid ASC';
  return new Promise((resolve, reject) => {
    fpr.all(select, projectNames, (err, data) => {
      if (err) reject(generateError(500, err));
      resolve(data);
    });
  });
};

/** returns the union of the non-null fields of a File Provenance Report object and a FileQC object */
function mergeOneFileResult (fpr, fqc) {
  if (!fpr.fileswid && !fqc.fileswid) {
    throw new ValidationError(
      'Cannot find any matching record in either file provenance or FileQC.'
    );
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
  for (let i = 0, j = 0; i <= fprs.length && j <= fqcs.length; ) {
    if (
      i < fprs.length &&
      (j >= fqcs.length || fprs[i].fileswid < fqcs[j].fileswid)
    ) {
      // File Provenance record has no corresponding FileQC record
      merged.push(yesFprNoFqc(fprs[i]));
      i++;
    } else if (
      j < fqcs.length &&
      (i >= fprs.length || fprs[i].fileswid > fqcs[j].fileswid)
    ) {
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
  fqc.qcstatus = fqc.qcpassed == true ? 'PASS' : 'FAIL';
  delete fqc.qcpassed;
  delete fqc.deleted;
  if (!fqc.comment) delete fqc.comment;
  fqc.fileswid = parseInt(fqc.fileswid);
  return fqc;
}

/** If a record is in both the File Provenance Report and FileQC databases,
 * merge the relevant info */
function yesFprYesFqc (fpr, fqc) {
  if (fpr.fileswid != fqc.fileswid)
    throw new Error('Cannot merge non-matching files');
  const merged = Object.assign({}, fpr);
  merged.upstream = parseUpstream(merged.upstream);
  merged.qcstatus = fqc.qcpassed == true ? 'PASS' : 'FAIL';
  merged.username = fqc.username;
  if (fqc.comment) merged.comment = fqc.comment;
  merged.qcdate = fqc.qcdate;
  merged.fileqcid = fqc.fileqcid;
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
  getAvailableConstants: getAvailableConstants,
  deleteFileQcs: deleteManyFileQcs,
  getMostRecentFprImportTime: getMostRecentFprImportTime
};
