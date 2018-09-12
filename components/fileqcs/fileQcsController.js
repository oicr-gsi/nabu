'use strict';

const pgp = require('pg-promise')({});
const pg = pgp(process.env.DB_CONNECTION);
const queryStream = require('pg-query-stream');
const JSONStream = require('JSONStream');
const basesqlite3 = require('sqlite3');
const sqlite3 =
  (process.env.DEBUG || 'false') === 'true'
    ? basesqlite3.verbose()
    : basesqlite3;
const fpr = new sqlite3.Database(
  process.env.SQLITE_LOCATION + '/fpr.db',
  sqlite3.OPEN_READWRITE
);
const logger = require('../../utils/logger');

/* some projects are represented with two different names. This contains only the duplicates,
 * and maps the long name to the short name */
const project_mappings = require('./project_mappings');

// configure SQLite connection so that reading from and writing to are non-blocking
fpr.run('PRAGMA journal_mode = WAL;');

/** set up custom error if bad params are given */
function ValidationError (message) {
  this.name = 'ValidationError';
  this.message = message || '';
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

/** returns a Stream of FileQC results */
const getAllBareFileQcs = async (req, res, next) => {
  const query = new queryStream('SELECT * FROM FileQC');

  try {
    const streamed = await pg.stream(query, stream => {
      res.status(200);
      stream.pipe(JSONStream.stringify()).pipe(res);
    });
    logger.info({
      streamRowsProcessed: streamed.processed,
      streamingDuration: streamed.duration,
      method: 'getAllBareFileQcs'
    });
    next();
  } catch (e) {
    handleErrors(e, 'Error streaming FileQCs', next);
  }
};

/**
 * Get all FileQCs for a single File SWID
 */
const getFileQcBySwid = async (req, res, next) => {
  try {
    const swid = validateInteger(req.params.identifier, 'fileswid', true);
    const showAll = validateShowAll(req.query.showall);

    const results = await Promise.all([
      getSingleFprResult(swid),
      getFqcsBySwid(swid)
    ]);
    if (results[1].errors && results[1].errors.length)
      throw generateError(500, results[1].errors[0]);
    const fileqcs = maybeReduceToMostRecent(results[1].fileqcs, showAll);
    const mergedFileQcs = mergeFprsAndFqcs(results[0], fileqcs);
    res.status(200).json({ fileqcs: mergedFileQcs });
    next();
  } catch (e) {
    handleErrors(e, 'Error getting FileQCs for SWID', next);
  }
};

/**
 * Get all FileQCs restricted by Project, QC Status, and/or Workflow, or File SWIDs
 */
const getAllFileQcs = async (req, res, next) => {
  try {
    let proj, swids, workflow, qcStatus, showAll;
    const validQueryParams = [
      'project',
      'fileswids',
      'workflow',
      'qcstatus',
      'showall'
    ];
    validateQueryParams(validQueryParams, req.query);
    proj = nullifyIfBlank(validateProject(req.query.project));
    swids = validateIntegers(req.query.fileswids, 'fileswid');
    workflow = nullifyIfBlank(req.query.workflow);
    qcStatus = nullifyIfBlank(req.query.qcstatus);
    showAll = validateShowAll(req.query.showall);

    let results;
    if (qcStatus !== null && proj !== null) {
      results = await getByProjAndQcStatus(proj, qcStatus, showAll);
    } else if (proj !== null) {
      results = await getByProjAndMaybeWorkflow(proj, workflow, showAll);
    } else if (swids !== null) {
      results = await getBySwids(swids, showAll);
    } else {
      throw new ValidationError('Must supply either project or fileswids');
    }

    res.status(200).json({ fileqcs: results });
    next();
  } catch (e) {
    handleErrors(e, 'Error getting records', next);
  }
};

const getBySwids = async (swids, showAll) => {
  try {
    const results = await Promise.all([
      getFprResultsBySwids(swids),
      getFqcResultsBySwids(swids)
    ]);
    // merge the results from the File Provenance report and the FileQC database
    const fileqcs = maybeReduceToMostRecent(results[1].fileqcs, showAll);
    return mergeFprsAndFqcs(results[0], fileqcs);
  } catch (e) {
    throw e;
  }
};

const getByProjAndMaybeWorkflow = async (proj, workflow, showAll) => {
  try {
    const results = await Promise.all([
      getFprResultsByProject(proj, workflow),
      getFqcResultsByProject(proj)
    ]);
    const fileqcs = maybeReduceToMostRecent(results[1].fileqcs, showAll);
    return mergeFprsAndFqcs(results[0], fileqcs);
  } catch (e) {
    throw e;
  }
};

const getByProjAndQcStatus = async (proj, qcStatus, showAll) => {
  try {
    qcStatus = validateQcStatus(qcStatus);
    const fqcs = await getFqcResultsByProjAndQcStatus(proj, qcStatus);
    const fileqcs = maybeReduceToMostRecent(fqcs, showAll);
    const swids = fileqcs.map(record => record.fileswid);
    let fprs;
    if ('PENDING' == qcStatus) {
      // want both the FPR records with no FileQCs, as well as
      // the FPR records with PENDING FileQCs and no PASS or FAIL FileQCs
      qcStatus = convertQcStatusToBoolean(qcStatus);
      const passedFqcs = await getFqcResultsByProjAndQcStatus(proj, 'PASS');
      const passedFqcSwids = passedFqcs.map(fqc => fqc.fileswid);
      const failedFqcs = await getFqcResultsByProjAndQcStatus(proj, 'FAIL');
      const failedFqcSwids = failedFqcs.map(fqc => fqc.fileswid);
      const allFprsForProj = await getFprResultsByProject(proj);
      fprs = allFprsForProj.filter(fpr => {
        return (
          !passedFqcSwids.includes(fpr.fileswid) &&
          !failedFqcSwids.includes(fpr.fileswid)
        );
      });
    } else {
      // get only the FPRs for the PASS/FAIL records requested
      fprs = await getFprResultsBySwids(swids);
    }
    return mergeFprsAndFqcs(fprs, fileqcs);
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
      qcpassed: validateQcStatus(req.query.qcstatus)
    };

    const fpr = await getSingleFprResult(fqc.fileswid);
    if (!fpr.length) fpr[0] = {};
    const hydratedFqc = hydrateOneFqcPreSave(fpr[0], fqc);
    const fqcInsert = await addSingleFqc(hydratedFqc);
    if (fqcInsert.errors && fqcInsert.errors.length)
      throw generateError(500, fqcInsert.errors[0]);
    // otherwise, merge the results
    const merged = mergeOneFileResult(fpr[0] || null, hydratedFqc);
    res.status(201).json({ fileqc: merged });
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
    logger.error({
      error: `[${req.uid}]: ended up with ${fprs.length -
        fqcs.length} more FPR records than FQCs submitted.`,
      method: 'hydrateFqcsPreSave'
    });
    throw new Error(
      'Error: multiple File Provenance records match a given File QC'
    );
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
    if (fqcInserts.errors && fqcInserts.errors.length)
      throw generateError(500, fqcInserts.errors);
    // otherwise, merge the results
    const merged = mergeFprsAndFqcs(fprs, fqcInserts.fileqcs);
    res.status(200).json({ fileqcs: merged });
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
    if (!req.body.fileqcids || !req.body.fileqcids.length)
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

function validateQcStatus (param) {
  let status = nullifyIfBlank(param);
  if (status !== 'undefined' && status !== null && status.length) {
    status = status.toUpperCase();
  }
  let validStatuses = ['PASS', 'FAIL', 'PENDING'];
  if (!validStatuses.includes(status)) {
    throw new ValidationError(
      'FileQC must be saved with QC status "PASS", "FAIL" or "PENDING"'
    );
  }
  const qcPassed = convertQcStatusToBoolean(status);
  return qcPassed;
}

function validateShowAll (param) {
  let showAll = nullifyIfBlank(param);
  if (showAll == null || showAll == 'false') return false;
  if (showAll == 'true') return true;
  throw new ValidationError(
    `Unknown value "${param}" for parameter showall. Expected values are: "true", "false", empty string`
  );
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
    throw new ValidationError(
      'Unknown QC status ' +
        value +
        '. QC status must be one of "PASS", "FAIL", or "PENDING"'
    );
  return statusToBool[value];
}

function convertBooleanToQcStatus (value) {
  const boolToStatus = {
    true: 'PASS',
    false: 'FAIL',
    null: 'PENDING'
  };
  if (typeof boolToStatus[value] === 'undefined') return 'PENDING';
  const status = boolToStatus[value];
  if (status === 'undefined')
    throw new ValidationError(
      'Cannot convert QC status ' + value + ' to "PASS", "FAIL", or "PENDING".'
    );
  return status;
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
    logger.info({ error: e.errors });
    return next(e); // generateError has already been called, usually because it's a user error
  } else if (defaultMessage) {
    logger.error({ error: e, method: 'handleErrors' });
    next(generateError(500, defaultMessage));
  } else {
    logger.error({ error: e, method: 'handleErrors' });
    next(generateError(500, 'Error'));
  }
}

/** returns an object { validated: {}, errors: [] } */
function validateObjectsFromUser (unvalidatedObjects) {
  let validationErrors = [];
  let validatedParams = unvalidatedObjects.map(unvalidated => {
    try {
      return {
        project: validateProject(unvalidated.project),
        qcpassed: validateQcStatus(unvalidated.qcstatus),
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
      resolve(data ? [data] : []);
    });
  });
}

/** success returns a single FileQC result */
function getFqcsBySwid (swid) {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM FileQc WHERE fileswid = $1 AND deleted = FALSE';
    pg
      .any(sql, [swid])
      .then(data => {
        if (!data || data.length == 0) resolve({ fileqcs: [], errors: [] });
        if (Array.isArray(data)) {
          resolve({ fileqcs: data, errors: [] });
        }
        resolve({ fileqcs: [data], errors: [] });
      })
      .catch(err => {
        logger.error({ error: err, method: `getFqcsBySwid: ${swid}` });
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
        logger.error({
          error: err,
          method: `getFqcResultsByProject:${project}`
        });
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
        logger.error({ error: err, method: 'getFqcResultsBySwids' });
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
        logger.error({ error: err, method: `addSingleFqc:${fqc.fileswid}` });
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
        logger.error({ error: err, method: 'addFqcs' });
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
        const undeleted = fileQcIds.filter(id => data.indexOf(id) == -1);
        const yay = [];
        if (data.length) {
          yay.push(`Deleted FileQC(s) ${data.join(', ')}. `);
        }
        const nay = [];
        if (undeleted.length) {
          nay.push(`Failed to delete FileQC(s) ${undeleted.join(', ')}.`);
          pg
            .any(
              `SELECT fileqcid FROM FileQC WHERE fileqcid IN (${undeleted.join(
                ','
              )})`
            )
            .then(data => {
              const notInDb = undeleted.filter(id => !data.includes(id));
              if (notInDb.length) {
                nay.push(`FileQC ID(s) do not exist: ${notInDb.join(', ')}`);
              }
              return resolve({ success: yay, errors: nay });
            })
            .catch(err => {
              logger.error({ error: err, method: 'deleteFqcs' });
              return resolve({ success: yay, errors: nay });
            });
        } else {
          return resolve({ success: yay, errors: nay });
        }
      })
      .catch(err => {
        logger.error({ error: err, method: `deleteFqcs:${username}` });
        return reject(generateError(500, 'Failed to delete FileQC records'));
      });
  });
};

const getFqcResultsByProjAndQcStatus = (proj, qcpassed) => {
  // if project is represented with both long and short names, need to search by both names
  const params = getAllProjectNames(proj);
  let select =
    'SELECT * FROM FileQC WHERE project IN (' +
    getIndexedPlaceholders(params) +
    ')' +
    ' AND qcpassed ' +
    (qcpassed == null ? 'IS NULL' : '= $' + (params.length + 1)) +
    ' ORDER BY fileswid ASC';
  return new Promise((resolve, reject) => {
    pg
      .any(select, params.concat([qcpassed]))
      .then(data => resolve(data))
      .catch(err => reject(generateError(500, err)));
  });
};

/**
 * if `showAll`, the no reduction happens. Otherwise, it returns a set of
 * FileQcs which are unique by fileswid, returning the one with the most
 * recent qcdate.
 */
function maybeReduceToMostRecent (fqcs, showAll = false) {
  if (showAll || !fqcs.length) {
    return fqcs || [];
  } else {
    // get only the most recent FileQC for each swid;
    const mostRecent = {};
    for (let fqc of fqcs) {
      if (!mostRecent[fqc.fileswid]) {
        // add the entry
        mostRecent[fqc.fileswid] = fqc;
      } else {
        // update the entry if necessary
        const existingDate = mostRecent[fqc.fileswid].qcdate;
        const currentDate = fqc.qcdate;
        if (
          new Date(currentDate).getTime() > new Date(existingDate).getTime()
        ) {
          mostRecent[fqc.fileswid] = fqc;
        }
      }
    }
    return Object.values(mostRecent);
  }
}

/** returns the union of the non-null fields of a File Provenance Report object and a FileQC object */
function mergeOneFileResult (fpr, fqc) {
  if ((!fpr || !fpr.fileswid) && (!fqc || !fqc.fileswid)) {
    throw new ValidationError(
      'Cannot find any matching record in either file provenance or FileQC.'
    );
  } else if (fpr && fpr.fileswid && (!fqc || !fqc.fileswid)) {
    // file exists in file provenance but hasn't been QCed
    return yesFprNoFqc(fpr);
  } else if ((!fpr || !fpr.fileswid) && fqc && fqc.fileswid) {
    // this file is in the FileQC database but not in file provenance
    return noFprYesFqc(fqc);
  } else {
    // we have both file provenance and FileQC data, so merge them
    return yesFprYesFqc(fpr, fqc);
  }
}

/** combines the results from FPR and FileQC queries then merges them if appropriate
 * this returns all results sorted by fileswid */
function mergeFprsAndFqcs (fprs, fqcs) {
  // merge the FileQCs with FPRs first...
  const fqcswids = fqcs.map(fqc => parseInt(fqc.fileswid));
  const mergedFqcs = fqcs.map(fqc => {
    const filteredFprs = fprs.filter(fpr => fpr.fileswid == fqc.fileswid);
    return maybeMergeResult(filteredFprs, [fqc], fqc.fileswid);
  });
  // ...then the requested FPRs with no associated FileQCs...
  const bareFprs = fprs
    .filter(fpr => !fqcswids.includes(fpr.fileswid))
    .map(fpr => yesFprNoFqc(fpr));
  const all = mergedFqcs.concat(bareFprs);
  //...then order them all by swid (or date, if two swids have same date)
  all.sort(sortBySwidOrDate);
  return all;
}

function maybeMergeResult (fprs, fqcs, swid) {
  if (fprs.length && fqcs.length) {
    return yesFprYesFqc(fprs[0], fqcs[0]);
  } else if (!fprs.length && fqcs.length) {
    return noFprYesFqc(fqcs[0]);
  } else if (fprs.length && !fqcs.length) {
    return yesFprNoFqc(fprs[0]);
  } else {
    // panic
    throw new ValidationError(
      `Error merging file results for swid ${swid}; no file provenance or FileQC data found`
    );
  }
}

function sortBySwidOrDate (a, b) {
  if (a.fileswid < b.fileswid) return -1;
  if (a.fileswid > b.fileswid) return 1;
  return a.qcdate < b.qcdate ? -1 : 1;
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
  fqc.qcstatus = convertBooleanToQcStatus(fqc.qcpassed);
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
  merged.qcstatus = convertBooleanToQcStatus(fqc.qcpassed);
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
  getAllBareFileQcs: getAllBareFileQcs,
  addFileQc: addFileQc,
  addManyFileQcs: addManyFileQcs,
  getAvailableConstants: getAvailableConstants,
  deleteFileQcs: deleteManyFileQcs,
  getMostRecentFprImportTime: getMostRecentFprImportTime
};
