'use strict';

const JSONStream = require('JSONStream');
const moment = require('moment');
const fileQcDao = require('./fileQcDao');
const fprDao = require('../fpr/fprDao');
const log = require('../../utils/logger');
const logger = log.logger;

/* some projects are represented with two different names. This contains only the duplicates,
 * and maps the long name to the short name */
const project_mappings = require('./project_mappings');

/** set up custom error if bad params are given */
function ValidationError (message) {
  this.name = 'ValidationError';
  this.message = message || '';
}
ValidationError.prototype = Error.prototype;

const getAvailableConstants = async (req, res, next) => {
  try {
    const results = await Promise.all([
      fprDao.listProjects(),
      fprDao.listWorkflows(),
    ]);
    res.status(200).json({ projects: results[0], workflows: results[1] });
    next();
  } catch (e) {
    handleErrors(e, 'Error getting projects and workflows', next);
  }
};

/** returns a Stream of FileQC results */
const streamFileQcs = async (req, res, next) => {
  try {
    const streamed = await fileQcDao.streamAllFileQcs((stream) => {
      res.status(200);
      stream.pipe(JSONStream.stringify()).pipe(res);
    });
    logger.info({
      streamRowsProcessed: streamed.processed,
      streamingDuration: streamed.duration,
      method: 'streamFileQcs',
    });
    next();
  } catch (e) {
    handleErrors(e, 'Error streaming FileQCs', next);
  }
};

const getFileQcs = async (req, res, next) => {
  try {
    let proj, fileids, swids, run, workflow, qcStatus, showAll;
    const validQueryParams = [
      'project',
      'fileids',
      'fileswids',
      'workflow',
      'qcstatus',
      'run',
      'showall',
    ];
    validateQueryParams(validQueryParams, req.body);
    proj = nullifyIfBlank(validateProject(req.body.project));
    qcStatus = nullifyIfBlank(req.body.qcstatus);
    workflow = nullifyIfBlank(req.body.workflow);
    fileids = nullifyIfBlank(req.body.fileids);
    swids = validateIntegers(req.body.fileswids, 'fileswid');
    run = nullifyIfBlank(req.body.run);
    showAll = validateShowAll(req.body.showall);

    const projects = getAllProjectNames(proj);
    let fqcResults = await fileQcDao.getFileQcs(
      projects,
      qcStatus,
      workflow,
      fileids,
      swids
    );
    let fprResults;
    if ((fileids && fileids.length > 0) || (swids && swids.length > 0)) {
      // search by IDs
      fprResults = await fprDao.getByIds(swids, fileids);
    } else {
      // search by projects, workflows
      fprResults = await fprDao.getByProjects(projects, workflow);
    }
    // TODO: filter by run
    const fileqcs = maybeReduceToMostRecent(fqcResults, showAll);
    const merged = mergeFprsAndFqcs(fprResults, fileqcs, false);
    res.status(200).json({ fileqcs: merged });
    next();
  } catch (e) {
    handleErrors(e, 'Error getting records', next);
  }
};

const getByRun = async (run) => {
  // validate run name
  if (!/^[\w-]+$/.test(run)) {
    generateError(400, `'${run}' is not recognized as a valid run name`);
  }
  const fprs = await fprDao.getByRun(run);
  const swids = fprs.map((fpr) => fpr.fileswid);
  const fqcResult = await fileQcDao.getBySwids(swids);
  return mergeFprsAndFqcs(fprs, fqcResult.fileqcs, true);
};

const hydrateFqcsPreSave = (fprs, fqcs) => {
  // fprHash: { fileid: indexInFprArray }
  const fprHash = {};
  fprs.map((fpr, index) => (fprHash[fpr.fileid] = index));
  return fqcs.map((fqc) => {
    const correspondingFpr = fprs[fprHash[fqc.fileid]] || {};
    fqc.project = correspondingFpr.project;
    fqc.filepath = correspondingFpr.filepath;
    fqc.md5sum = correspondingFpr.md5sum;
    return fqc;
  });
};

const addFileQcs = async (req, res, next) => {
  try {
  if (!Array.isArray(req.body.fileqcs))
      throw generateError(400, 'Error: request body must contain array of file QCs');
    const validationResults = validateObjectsFromUser(req.body.fileqcs);
    if (validationResults.errors.length)
      throw new ValidationError(validationResults.errors);
    const toSave = validationResults.validated;
    const fileids = toSave.map((record) => record.fileid);
    const fprs = await fprDao.getByIds([], fileids);
    const hydratedFqcs = hydrateFqcsPreSave(fprs, toSave);
    const fqcInserts = await fileQcDao.addFileQcs(hydratedFqcs);
    if (fqcInserts.errors && fqcInserts.errors.length)
      throw generateError(500, fqcInserts.errors);
    // otherwise, merge the results
console.log("what got inserted:")
console.log(fqcInserts)
console.log("what's in db after insertion:")
let fqcResults = await fileQcDao.getFileQcs(
      [],
      null,
      null,
      fileids,
      []
    );
console.log(fqcResults)

    const merged = mergeFprsAndFqcs(fprs, fqcInserts, false);
    res.status(201).json({ fileqcs: merged });
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
      (fqcId) => validateInteger(fqcId, 'fileQc ID', true),
      'fileqcid'
    );
    const username = validateUsername(req.body.username);

    const result = await fileQcDao.deleteFileQcs(fqcIds, username);
    res.status(200).json(result);
    next();
  } catch (e) {
    handleErrors(e, 'Error deleting records', next);
  }
};

/** success returns the last time that the File Provenance Report was imported into SQLite */
const getMostRecentFprImportTime = (req, res, next) => {
  try {
    const importTime = fprDao.getMostRecentImportTime();
    res.status(200).json(importTime);
    next();
  } catch (e) {
    handleErrors(e, 'Error getting most recent import time', next);
  }
};

const validateQueryParams = (validParams, actualParams) => {
  for (let key in actualParams) {
    if (
      Object.prototype.hasOwnProperty.call(actualParams, key) &&
      validParams.indexOf(key) == -1
    ) {
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

/** Expects an array of File SWIDs and returns the valid numbers within */
function validateIntegers (param, paramLabel) {
  if (nullifyIfBlank(param) == null || param.length == 0) return null;
  if (Array.isArray(param)) {
    return param
      .map((num) => validateInteger(num, paramLabel))
      .filter((num) => !Number.isNaN(num));
  } else {
    // TODO: delete me
    return param
      .split(',')
      .map((num) => validateInteger(num, paramLabel))
      .filter((num) => !Number.isNaN(num));
  }
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
  if (showAll == null || showAll == 'false' || showAll == false) return false;
  if (showAll == 'true' || showAll == true) return true;
  throw new ValidationError(
    `Unknown value "${param}" for parameter showall. Expected values are: true, false, empty string`
  );
}

function validateFileId (param) {
  let fileid = nullifyIfBlank(param);
  if (fileid === 'undefined' || fileid === null || fileid.length == 0) {
    throw new ValidationError(
      'FileQC must have a valid fileid'
    );
  }
  return fileid;
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
    pending: null,
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
    null: 'PENDING',
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
    errors: [errorMessage],
  };
  return err;
}

function handleErrors (e, defaultMessage, next) {
  /* eslint-disable */
  if (e instanceof ValidationError) {
    if (process.env.DEBUG == 'true') console.log(e);
    logger.info(e);
    next(generateError(400, e.message));
  } else if (e.status) {
    logger.info({ error: e.errors });
    return next(e); // generateError has already been called, usually because it's a user error
  } else if (defaultMessage) {
    if (process.env.DEBUG == 'true') console.log(e);
    logger.error({ error: e, method: 'handleErrors' });
    next(generateError(500, defaultMessage));
  } else {
    if (process.env.DEBUG == 'true') console.log(e);
    logger.error({ error: e, method: 'handleErrors' });
    next(generateError(500, 'Error'));
  }
  /* eslint-enable */
}

/** returns an object { validated: {}, errors: [] } */
function validateObjectsFromUser (unvalidatedObjects) {
  let validationErrors = [];
  let validatedParams = unvalidatedObjects.map((unvalidated) => {
    try {
      return {
        project: validateProject(unvalidated.project),
        qcpassed: validateQcStatus(unvalidated.qcstatus),
        username: validateUsername(unvalidated.username),
        comment: validateComment(unvalidated.comment),
        fileswid: validateInteger(unvalidated.fileswid, 'fileswid', false),
        fileid: validateFileId(unvalidated.fileid),
      };
    } catch (e) {
      if (e instanceof ValidationError) {
        validationErrors.push({
          fileid: unvalidated.fileid,
          error: e.message,
        });
        return null;
      } else {
        throw e;
      }
    }
  });

  return { validated: validatedParams, errors: validationErrors };
}

function getAllProjectNames (proj) {
  const ary = [proj];
  if (Object.keys(project_mappings).indexOf(proj) != -1)
    ary.push(project_mappings[proj]);
  return ary;
}

/**
 * if `showAll`, the no reduction happens. Otherwise, it returns a set of
 * FileQcs which are unique by fileswid, returning the one with the most
 * recent qcdate.
 */
function maybeReduceToMostRecent (fqcs, showAll = false) {
  if (showAll || !fqcs.length) {
    return fqcs || [];
  } else {
    console.log("maybe reduce to most recent")
    let thing = [];
 fqcs.map((f) => thing.push({"file id": f.fileid,"status": f.qcpassed, "date": f.qcdate}));
console.log(thing)
    // get only the most recent FileQC for each swid;
    const mostRecent = {};
    for (let fqc of fqcs) {
      if (!mostRecent[fqc.fileid]) {
        // add the entry
        mostRecent[fqc.fileid] = fqc;
      } else {
        // update the entry if necessary
        const existingDate = mostRecent[fqc.fileid].qcdate;
        const currentDate = fqc.qcdate;
        if (
          new Date(currentDate).getTime() > new Date(existingDate).getTime()
        ) {
          mostRecent[fqc.fileid] = fqc;
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

/** combines the results from FPR and FileQC queries then merges them on the file id if appropriate */
function mergeFprsAndFqcs (fprs, fqcs, includeRunInfo) {
console.log("in merge")
console.log("FPRs")
console.log(fprs)
console.log("fqcs")
console.log(fqcs)
  // first, remove run info if necessary
  fprs = fprs.map((fpr) => maybeRemoveRunInfo(includeRunInfo, fpr));
  // merge the FileQCs with FPRs first...
  const fileids = fqcs.map(fqc => fqc.fileid);
  const mergedFqcs = fqcs.map((fqc) => {
    const filteredFprs = fprs.filter(fpr => fpr.fileid == fqc.fileid);
    return maybeMergeResult(filteredFprs, [fqc], fqc.fileid);
  });
  // ...then the requested FPRs with no associated FileQCs...
  const bareFprs = fprs
    .filter(fpr => !fileids.includes(fpr.fileid))
    .map(fpr => yesFprNoFqc(fpr));
  const all = mergedFqcs.concat(bareFprs);
  //...then order them all by date
  all.sort(sortByDate);
  return all;
}

// We will usually want to delete the run name and lane number before returning
// the FPR record to the user
function maybeRemoveRunInfo (keepRunInfo, fpr) {
  if (keepRunInfo === true) {
    return fpr;
  } else {
    delete fpr.run;
    delete fpr.lane;
    delete fpr.library;
    return fpr;
  }
}

function maybeMergeResult (fprs, fqcs, fileid) {
  if (fprs.length && fqcs.length) {
    return yesFprYesFqc(fprs[0], fqcs[0]);
  } else if (!fprs.length && fqcs.length) {
    return noFprYesFqc(fqcs[0]);
  } else if (fprs.length && !fqcs.length) {
    return yesFprNoFqc(fprs[0]);
  } else {
    // panic
    throw new ValidationError(
      `Error merging file results for file ID ${fileid}; no file provenance or FileQC data found`
    );
  }
}

function sortByDate (a, b) {
  return a.qcdate < b.qcdate ? -1 : 1;
}

/** If a record is in the File Provenance Report database but not in the FileQC database,
 * then its QC status is 'PENDING' */
function yesFprNoFqc (fpr) {
  fpr.upstream = parseUpstream(fpr.upstream);
  fpr.fileswid = parseInt(fpr.fileswid);
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
  if (fqc.fileswid) fqc.fileswid = parseInt(fqc.fileswid);
  fqc.qcdate = moment(fqc.qcdate).format('YYYY-MM-DD HH:mm');
  return fqc;
}

/** If a record is in both the File Provenance Report and FileQC databases,
 * merge the relevant info */
function yesFprYesFqc (fpr, fqc) {
  if (fpr.fileid != fqc.fileid)
    throw new Error('Error: tried to merge non-matching files');
  const merged = Object.assign({}, fpr);
  merged.upstream = parseUpstream(merged.upstream);
  merged.qcstatus = convertBooleanToQcStatus(fqc.qcpassed);
  merged.username = fqc.username;
  if (fqc.comment) merged.comment = fqc.comment;
  merged.qcdate = moment(fqc.qcdate).format('YYYY-MM-DD HH:mm');
  merged.fileqcid = fqc.fileqcid;
  if (fqc.fileswid) merged.fileswid = parseInt(fqc.fileswid);
  return merged;
}

/** comes out of the db as "vidarr:research/file/abc;vidarr:research/file/124" */
function parseUpstream (upstream) {
  if (typeof upstream == 'undefined' || upstream == null) {
    return [];
  } else if (Array.isArray(upstream)) {
    return upstream;
  } else {
    return upstream.split(';');
  }
}

module.exports = {
  getFileQcs: getFileQcs,
  streamFileQcs: streamFileQcs,
  addFileQcs: addFileQcs,
  getAvailableConstants: getAvailableConstants,
  deleteFileQcs: deleteManyFileQcs,
  getMostRecentFprImportTime: getMostRecentFprImportTime,
};
