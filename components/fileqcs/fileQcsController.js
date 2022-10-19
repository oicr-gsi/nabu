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
    let proj, fileids, swids, run, workflow, qcStatus;
    const validQueryParams = [
      'project',
      'fileids',
      'fileswids',
      'workflow',
      'qcstatus',
      'run',
    ];
    validateQueryParams(validQueryParams, req.body);
    proj = nullifyIfBlank(validateProject(req.body.project));
    qcStatus = convertQcStatusToBoolean(nullifyIfBlank(req.body.qcstatus));
    workflow = nullifyIfBlank(req.body.workflow);
    fileids = nullifyIfBlank(req.body.fileids);
    swids = validateIntegers(req.body.fileswids, 'fileswid');
    run = nullifyIfBlank(req.body.run);

    const projects = getAllProjectNames(proj);
    let fqcResults = await fileQcDao.getFileQcs(
      projects,
      workflow,
      qcStatus,
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
    const merged = mergeFprsAndFqcs(
      fprResults,
      fqcResults,
      false,
      req.body.qcstatus
    );
    res.status(200).json({ fileqcs: merged });
    next();
  } catch (e) {
    handleErrors(e, 'Error getting records', next);
  }
};

const hydrateFqcsPreSave = (fprs, fqcs) => {
  // fprHash: { fileid: indexInFprArray }
  const fprHash = {};
  fprs.map((fpr, index) => (fprHash[fpr.fileid] = index));
  const noFprEntryFound = [];
  let hydrated = fqcs.map((fqc) => {
    const correspondingFpr = fprs[fprHash[fqc.fileid]];
    if (correspondingFpr == null) {
      noFprEntryFound.push(fqc.fileid);
      return;
    }
    fqc.project = correspondingFpr.project;
    fqc.workflow = correspondingFpr.workflow;
    fqc.filepath = correspondingFpr.filepath;
    fqc.md5sum = correspondingFpr.md5sum;
    return fqc;
  });
  if (noFprEntryFound.length) {
    let errorMessage =
      'Cannot create FileQCs for files that are not in file provenance. No files were found for the following fileids:  ' +
      noFprEntryFound.join(' , ');
    throw new ValidationError(errorMessage);
  }
  return hydrated;
};

const addFileQcs = async (req, res, next) => {
  try {
    if (!Array.isArray(req.body.fileqcs))
      throw generateError(
        400,
        'Error: request body must contain array of \'fileqcs\''
      );
    const validationResults = validateObjectsFromUser(req.body.fileqcs);
    const toSave = validationResults;
    const fileids = toSave.map((record) => record.fileid);
    const fprs = await fprDao.getByIds([], fileids);
    const hydratedFqcs = hydrateFqcsPreSave(fprs, toSave);
    await fileQcDao.addFileQcs(hydratedFqcs);
    let saved = await fileQcDao.getFileQcs([], null, null, fileids, []);
    const fprResults = await fprDao.getByIds([], fileids);
    const merged = mergeFprsAndFqcs(fprResults, saved, false, false);

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
    if (!req.body.fileids || !req.body.fileids.length)
      throw generateError(400, 'Error: no "fileids" found in request body');
    const fileIds = req.body.fileids.map(
      (fileId) => validateFileId(fileId),
      'fileid'
    );
    const username = validateUsername(req.body.username);

    const result = await fileQcDao.deleteFileQcs(fileIds, username);
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
  if (nullifyIfBlank(param) == null) {
    return null;
  }
  param = param.trim();
  if (param.match(/[^a-zA-Z0-9-_']+/)) {
    return new ValidationError('project contains invalid characters');
  }
  // regrettably, `Catherine_O'Brien_Bug` is an existing project
  param = param.replace(/'/, '\'');
  return param;
}

function validateInteger (param, paramLabel, required) {
  if (nullifyIfBlank(param) == null) {
    if (required) {
      return new ValidationError(`${paramLabel} is a required field`);
    } else {
      return null;
    }
  }
  const swid = parseInt(param);
  if (Number.isNaN(swid))
    return new ValidationError(
      `Expected integer for ${paramLabel} but got ${param}`
    );
  return swid;
}

/** Expects an array of File SWIDs and returns the valid numbers within */
function validateIntegers (param, paramLabel) {
  if (nullifyIfBlank(param) == null || param.length == 0) return null;
  let arrayParam = param;
  if (!Array.isArray(param)) {
    arrayParam = [param];
  }
  return arrayParam
    .map((num) => validateInteger(num, paramLabel))
    .filter((num) => !Number.isNaN(num));
}

function validateUsername (param) {
  const user = nullifyIfBlank(param);
  if (user == null || !user.length)
    return new ValidationError('username must be provided');
  if (user.match(/\W+/))
    return new ValidationError('username must contain only letters');
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
    return new ValidationError(
      'FileQC must be saved with qcstatus "PASS", "FAIL" or "PENDING"'
    );
  }
  const qcPassed = convertQcStatusToBoolean(status);
  return qcPassed;
}

function validateFileId (param) {
  let fileid = nullifyIfBlank(param);
  if (fileid === 'undefined' || fileid === null || fileid.length == 0) {
    return new ValidationError('FileQC must have a valid fileid');
  }
  return `${fileid}`;
}

function nullifyIfBlank (value) {
  if (typeof value == 'undefined' || value === null || value.length == 0)
    value = null;
  return value;
}

/** Must deal with null qcStatus check elsewhere */
function convertQcStatusToBoolean (value) {
  if (value == null || value === true || value === false) {
    return value;
  }
  value = value.toLowerCase();
  const statusToBool = {
    pass: true,
    fail: false,
    pending: null,
  };
  if (typeof statusToBool[value] == 'undefined')
    throw new ValidationError(
      'Unknown qcstatus ' +
        value +
        '. qcstatus must be one of "PASS", "FAIL", or "PENDING"'
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
      'Cannot convert qcstatus ' + value + ' to "PASS", "FAIL", or "PENDING".'
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
    logger.debug(e);
    logger.info({ error: e.errors });
    return next(e); // generateError has already been called, usually because it's a user error
  } else {
    logger.debug(e);
    logger.error({ error: e, method: 'handleErrors' });
    next(generateError(500, defaultMessage || 'Error'));
  }
  /* eslint-enable */
}

/** returns an object { validated: {}, errors: [] } */
function validateObjectsFromUser (unvalidatedObjects) {
  let validationErrors = [];
  let validatedParams = unvalidatedObjects.map((unvalidated) => {
    let singleEntryValidationErrors = [];
    let fromUser = {
      project: validateProject(unvalidated.project),
      qcpassed: validateQcStatus(unvalidated.qcstatus),
      username: validateUsername(unvalidated.username),
      comment: validateComment(unvalidated.comment),
      fileswid: validateInteger(unvalidated.fileswid, 'fileswid', false),
      fileid: validateFileId(unvalidated.fileid),
    };
    if (fromUser.fileid instanceof ValidationError) {
      validationErrors.push(fromUser.fileid.message);
      return;
    }
    for (const [key, value] of Object.entries(fromUser)) {
      if (value instanceof ValidationError) {
        singleEntryValidationErrors.push(value);
      }
    }
    if (singleEntryValidationErrors.length) {
      let fullErrorMessage =
        fromUser.fileid +
        ' : ' +
        singleEntryValidationErrors.map((e) => e.message).join('. ');
      validationErrors.push(fullErrorMessage);
    } else {
      return fromUser;
    }
  });
  if (validationErrors.length) {
    let allErrors = validationErrors.join('. ');
    throw new ValidationError(allErrors);
  }
  return validatedParams;
}

function getAllProjectNames (proj) {
  const ary = [proj];
  if (Object.keys(project_mappings).indexOf(proj) != -1)
    ary.push(project_mappings[proj]);
  return ary;
}

/** combines the results from FPR and FileQC queries then merges them on the file id if appropriate */
function mergeFprsAndFqcs (
  fprs,
  fqcs,
  includeRunInfo,
  filterByQcStatus = false
) {
  // first, remove run info if necessary
  fprs = fprs.map((fpr) => maybeRemoveRunInfo(includeRunInfo, fpr));
  // merge the FileQCs with FPRs first...
  const fileids = fqcs.map((fqc) => fqc.fileid);
  const mergedFqcs = fqcs.map((fqc) => {
    const filteredFprs = fprs.filter((fpr) => fpr.fileid == fqc.fileid);
    return maybeMergeResult(filteredFprs, [fqc], fqc.fileid);
  });
  if (['PASS', 'FAIL'].includes(filterByQcStatus)) {
    // we only want records that are QCed
    return mergedFqcs;
  }
  // ...then the requested FPRs with no associated FileQCs...
  const bareFprs = fprs
    .filter((fpr) => !fileids.includes(fpr.fileid))
    .map((fpr) => yesFprNoFqc(fpr));
  if ('PENDING' == filterByQcStatus) {
    // we only want records that are not QCed
    return bareFprs;
  }
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
  if (fqc.md5sum != fpr.md5sum) {
    merged.alert = `Different md5sum! For QCed file: ${fqc.md5sum} For current FPR record: ${fpr.md5sum}`;
    merged.md5sum = fqc.md5sum;
  }
  return merged;
}

/** comes out of the db as "vidarr:research/file/abc;vidarr:research/file/124" */
function parseUpstream (upstream) {
  if (typeof upstream == 'undefined' || upstream == null) {
    return [];
  } else if (Array.isArray(upstream)) {
    return upstream;
  } else {
    return `${upstream}`.split(';');
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
