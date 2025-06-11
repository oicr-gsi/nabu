'use strict';

const caseDao = require('./caseDao');
const JSONStream = require('JSONStream');
const {
  handleErrors,
  ValidationError,
  ConflictingDataError,
} = require('../../utils/controllerUtils');
const logger = require('../../utils/logger').logger;
const urls = require('../../utils/urlSlugs');
const authenticator = require('../../utils/apiAuth');
const prometheus = require('../../utils/prometheus').prometheus;


const caseArchiveStopProcessing = new prometheus.Gauge({
  name: 'nabu_case_archive_stop_processing',
  help: 'The case was set to stop processing',
  labelNames: ['caseIdentifier'],
})

function arraysEquals (array1, array2) {
  array1 = array1 || [];
  array2 = array2 || [];
  return (
    array1.every((item) => array2.includes(item)) &&
    array2.every((item) => array1.includes(item))
  );
}

const getCaseArchive = async (req, res, next) => {
  try {
    const cardeaCase = await caseDao.getByCaseIdentifier(
      req.params.caseIdentifier,
      req.query.includeVidarrMetadata ? req.query.includeVidarrMetadata : false
    );
    if (cardeaCase && cardeaCase.length) {
      res.status(200).json(cardeaCase);
    } else {
      res.status(404).end();
    }
  } catch (e) {
    handleErrors(e, `Error getting case ${req.params.caseIdentifier}`, logger, next);
  }
};

/**
 * Request all case archives.
 * Can optionally filter for items that are "not" at a certain state of archiving: 'copied-to-staging', 'sent-offsite', 'sent-to-vidarr-archival', 'unloaded'
 */
const allCaseArchives = async (req, res, next) => {
  try {
    const query = req.query.not;
    let cases;
    if (query) {
      if (query == urls.filesCopiedToOffsiteStagingDir) {
        cases = await caseDao.getByFilesNotCopiedToOffsiteStagingDir();
        res.status(200).send(cases);
      } else if (query == urls.filesSentOffsite) {
        cases = await caseDao.getByFilesNotSentOffsite();
        res.status(200).send(cases);
      } else if (query == urls.filesLoadedIntoVidarrArchival) {
        cases = await caseDao.getByFilesNotLoadedIntoVidarrArchival();
        res.status(200).send(cases);
      } else if (query == urls.caseFilesUnloaded) {
        cases = await caseDao.getByFilesNotUnloaded();
        res.status(200).send(cases);
      }
    } else {
      cases = await caseDao.streamAllCases((stream) => {
        res.status(200);
        stream.pipe(JSONStream.stringify()).pipe(res);
        stream.on('error', (err) => {
          // log the error and prematurely end the response
          logger.error(err);
          res.end();
        });
      });
      logger.info({
        streamRowsProcessedCases: cases.processed,
        streamingDurationCases: cases.duration,
        method: '',
      });
    }
    next();
  } catch (e) {
    handleErrors(e, 'Error getting cases', logger, next);
  }
};

const isCompletelyArchived = (kase) => {
  return (
    kase.filesCopiedToOffsiteArchiveStagingDir != null &&
    kase.commvaultBackupJobId != null &&
    kase.filesLoadedIntoVidarrArchival != null &&
    kase.caseFilesUnloaded != null
  );
};

const hasArchivingStarted = (kase) => {
    return kase.filesCopiedToOffsiteArchiveStagingDir != null;
};

const addCaseArchive = async (req, res, next) => {
  try {
    //authenticate api-key from header before continuing
    await authenticator.authenticateRequest(req);

    const existingCases = await caseDao.getByCaseIdentifier(
      req.body.caseIdentifier
    );
    if (existingCases == null || !existingCases.length) {
      await upsert(req.body, true);
      res.status(201).end();
    } else {
      for (let existingCase of existingCases) {
        // check for conflicting changes
        let errors = [];
        let caseStoppedProcessing = false;
        if (existingCase.requisitionId != req.body.requisitionId) {
          errors.push(`Requisition (${req.body.requisitionId}) from request does not match requisition ${existingCase.requisitionId} for case ${req.body.caseIdentifier}`);
        }
        if (!arraysEquals(existingCase.limsIds, req.body.limsIds)) {
          errors.push(`LIMS IDs (${req.body.limsIds}) from request do not match LIMS IDs ${existingCase.limsIds} for case ${req.body.caseIdentifier}`);
        }
        if (hasArchivingStarted(existingCase)) {
          if (!arraysEquals(
            existingCase.workflowRunIdsForOffsiteArchive,
            req.body.workflowRunIdsForOffsiteArchive
          )) {
            errors.push(`Requested offsite archive files list ${req.body.workflowRunIdsForOffsiteArchive} does not match offsite files archive list ${existingCase.workflowRunIdsForOffsiteArchive} for case ${existingCase.caseIdentifier}`);
            await caseDao.setCaseArchiveDoNotProcess(existingCase.caseIdentifier);
            caseStoppedProcessing = true;
          }
          if (!arraysEquals(
            existingCase.workflowRunIdsForVidarrArchival,
            req.body.workflowRunIdsForVidarrArchival
          )) {
            errors.push(`Requested onsite archive files list ${req.body.workflowRunIdsForVidarrArchival} does not match onsite archive files list ${existingCase.workflowRunIdsForVidarrArchival} for case ${existingCase.caseIdentifier}`);
            await caseDao.setCaseArchiveDoNotProcess(existingCase.caseIdentifier);
            caseStoppedProcessing = true;
          }
          if (!arraysEquals(existingCase.archiveWith, req.body.archiveWith)) {
            errors.push(`Requested archive_with=${req.body.archiveWith} from request does not match archive_with=${existingCase.archiveWith} for case ${req.body.caseIdentifier}`);
            await caseDao.setCaseArchiveDoNotProcess(existingCase.caseIdentifier);
            caseStoppedProcessing = true;
          }
          if (existingCase.archiveTarget != req.body.archiveTarget) {
            errors.push(`Archive target '${req.body.archiveTarget}' from request does not match archive target '${existingCase.archiveTarget}' for case ${req.body.caseIdentifier}`);
            await caseDao.setCaseArchiveDoNotProcess(existingCase.caseIdentifier);
            caseStoppedProcessing = true;
          }
        }
        if (caseStoppedProcessing) {
          caseArchiveStopProcessing.inc({'caseIdentifier': existingCase.caseIdentifier});
        }
        if (errors.length) {
          for (const e of errors) {
            logger.error(e);
          }
          throw new ConflictingDataError(errors.join("\n"));
        }
        if (!hasArchivingStarted(existingCase)) {
          // can modify a case that hasn't been archived if there are no errors
          await upsert(req.body, false);
          let updatedCase = await caseDao.getByCaseIdentifier(req.body.caseIdentifier, false);
          res.status(200).send(updatedCase);
          return true;
        } else {
          // if case has started archiving, can only modify case metadata
          await caseDao.updateMetadata(req.params.caseIdentifier, req.body.metadata);
          let updatedCase = await caseDao.getByCaseIdentifier(req.body.caseIdentifier, false);
          res.status(200).send(updatedCase);
          return true;
        }
        /* NOTE: if we keep encountering HALP actions that don't require any further fixing other than
           hitting the case/<caseIdentifier>/resume-archiving endpoint because the underlying discrepancy
           gets resolved upstream, we might want to adjust these last two conditions to also clear the
           do-not-process flag */
      }
    }
  } catch (e) {
    handleErrors(e, `Error adding case ${req.body.caseIdentifier}`, logger, next);
  }
};

const upsert = (caseInfo, createNewArchive) => {
  return caseDao.addCase(caseInfo, createNewArchive);
};

const upsertArchive = (caseInfo) => {
  return caseDao.addCaseArchiveOnly(caseInfo);
};

const filesCopiedToOffsiteStagingDir = async (req, res, next) => {
  try {
    let errors = [];
    if (!req.body.copyOutFile) {
      errors.push(
        'Must provide a copyOutFile in request body'
      );
    }
    if (!req.body.batchId) {
      errors.push('Must provide a batchId')
    }
    if (errors.length) {
      throw new ValidationError(errors.join("\n"));
    }
    const updatedCase = await caseDao.updateFilesCopiedToOffsiteStagingDir(
      req.params.caseIdentifier,
      req.body.batchId,
      JSON.stringify(req.body.copyOutFile)
    );
    if (updatedCase && updatedCase.length) {
      res.status(200).json(updatedCase);
    } else {
      res.status(404).end();
    }
  } catch (e) {
    handleErrors(e, `Error updating case ${req.params.caseIdentifier}`, logger, next);
  }
};

const filesLoadedIntoVidarrArchival = async (req, res, next) => {
  try {
    if (!req.body) {
      throw new ValidationError(
        'Must provide an unload file\'s contents in request body'
      );
    }
    const updatedCase = await caseDao.updateFilesLoadedIntoVidarrArchival(
      req.params.caseIdentifier,
      JSON.stringify(req.body)
    );
    if (updatedCase && updatedCase.length) {
      res.status(200).json(updatedCase);
    } else {
      res.status(404).end();
    }
  } catch (e) {
    handleErrors(e, `Error updating case ${req.params.caseIdentifier}`, logger, next);
  }
};

const filesSentOffsite = async (req, res, next) => {
  try {
    const updatedCase = await caseDao.updateFilesSentOffsite(
      req.params.caseIdentifier,
      req.body.commvaultBackupJobId
    );
    if (updatedCase && updatedCase.length) {
      res.status(200).json(updatedCase);
    } else {
      res.status(404).end();
    }
  } catch (e) {
    handleErrors(e, `Error updating case ${req.params.caseIdentifier}`, logger, next);
  }
};

const caseFilesUnloaded = async (req, res, next) => {
  try {
    const updatedCase = await caseDao.updateFilesUnloaded(
      req.params.caseIdentifier
    );
    if (updatedCase && updatedCase.length) {
      res.status(200).json(updatedCase);
    } else {
      res.status(404).end();
    }
  } catch (e) {
    handleErrors(e, `Error updating case ${req.params.caseIdentifier}`, logger, next);
  }
};

const resumeCaseArchiveProcessing = async (req, res, next) => {
  try {
    await caseDao.resumeCaseArchiveProcessing(req.params.caseIdentifier);
    caseArchiveStopProcessing.set({'caseIdentifier': req.params.caseIdentifier}, 0);
    const caseArchive = await caseDao.getByCaseIdentifier(req.params.caseIdentifier, false);
    res.status(200).json(caseArchive);
  } catch (e) {
    handleErrors(e, `Error resuming processing for case ${req.params.caseIdentifier}`, logger, next);
  }
}

module.exports = {
  allCaseArchives: allCaseArchives,
  addCaseArchive: addCaseArchive,
  getCaseArchive: getCaseArchive,
  caseFilesUnloaded: caseFilesUnloaded,
  filesCopiedToOffsiteStagingDir: filesCopiedToOffsiteStagingDir,
  filesLoadedIntoVidarrArchival: filesLoadedIntoVidarrArchival,
  filesSentOffsite: filesSentOffsite,
  resumeCaseArchiveProcessing: resumeCaseArchiveProcessing,
};
