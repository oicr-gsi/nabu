'use strict';

const archiveDao = require('./archiveDao');
const JSONStream = require('JSONStream');
const { Transform } = require('stream');

const {
  handleErrors,
  ValidationError,
  ConflictingDataError,
  arrayDiff,
} = require('../../utils/controllerUtils');
const logger = require('../../utils/logger').logger;
const urls = require('../../utils/urlSlugs');
const authenticator = require('../../utils/apiAuth');
const prometheus = require('../../utils/prometheus').prometheus;
const caseEntityType = 'CASE';

const caseArchiveStopProcessing = new prometheus.Gauge({
  name: 'nabu_case_archive_stop_processing',
  help: 'The case was set to stop processing',
  labelNames: ['caseIdentifier'],
});

const getCaseArchive = async (req, res, next) => {
  try {
    let cardeaCase = await archiveDao.getByArchiveEntityIdentifier(
      req.params.caseIdentifier,
      req.query.includeVidarrMetadata ? req.query.includeVidarrMetadata : false,
      caseEntityType
    );
    if (cardeaCase && cardeaCase.length) {
      res.status(200).json(replaceGenericKeyName(cardeaCase));
    } else {
      res.status(404).end();
    }
  } catch (e) {
    handleErrors(
      e,
      `Error getting case ${req.params.caseIdentifier}`,
      logger,
      next
    );
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
        cases = await archiveDao.getByFilesNotCopiedToOffsiteStagingDir(
          caseEntityType
        );
        res.status(200).send(replaceGenericKeyName(cases));
      } else if (query == urls.filesSentOffsite) {
        cases = await archiveDao.getByFilesNotSentOffsite(caseEntityType);
        res.status(200).send(replaceGenericKeyName(cases));
      } else if (query == urls.filesLoadedIntoVidarrArchival) {
        cases = await archiveDao.getByFilesNotLoadedIntoVidarrArchival(
          caseEntityType
        );
        res.status(200).send(replaceGenericKeyName(cases));
      } else if (query == urls.filesUnloaded) {
        cases = await archiveDao.getByFilesNotUnloaded(caseEntityType);
        res.status(200).send(replaceGenericKeyName(cases));
      }
    } else {
      cases = await archiveDao.streamAllCases((stream) => {
        res.status(200);
        stream
          .pipe(createCaseKeyReplacementStream())
          .pipe(JSONStream.stringify())
          .pipe(res);
        stream.on('error', (err) => {
          // log the error and prematurely end the response
          logger.error(err);
          res.status(500).end();
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
    kase.filesUnloaded != null
  );
};

const hasArchivingStarted = (kase) => {
  return kase.filesCopiedToOffsiteArchiveStagingDir != null;
};

const getErrorsForConflictingChanges = (existingCase, newCase) => {
  let errors = [];
  if (existingCase.requisitionId != newCase.requisitionId) {
    errors.push(
      `Requisition (${newCase.requisitionId}) from request does not match requisition ${existingCase.requisitionId} for case ${newCase.caseIdentifier}.`
    );
  }
  const [limsIdsNotInRequest, extraLimsIdsInRequest] = arrayDiff(
    existingCase.limsIds,
    newCase.limsIds
  );
  if (limsIdsNotInRequest.length != 0) {
    errors.push(
      `The existing case ${newCase.caseIdentifier} contains LIMS IDs: (${limsIdsNotInRequest}) which are not present in the request.`
    );
  }
  if (extraLimsIdsInRequest.length != 0) {
    errors.push(
      `The existing case ${newCase.caseIdentifier} does not contain LIMS IDs: (${extraLimsIdsInRequest}) which are present in the request.`
    );
  }
  const [
    workflowRunIdsForOffsiteArchiveNotInRequest,
    extraWorkflowRunIdsForOffsiteArchiveInRequest,
  ] = arrayDiff(
    existingCase.workflowRunIdsForOffsiteArchive,
    newCase.workflowRunIdsForOffsiteArchive
  );
  if (workflowRunIdsForOffsiteArchiveNotInRequest.length != 0) {
    errors.push(
      `The existing case ${newCase.caseIdentifier} contains offsite archive files: (${workflowRunIdsForOffsiteArchiveNotInRequest}) which are not present in the request.`
    );
  }
  if (extraWorkflowRunIdsForOffsiteArchiveInRequest.length != 0) {
    errors.push(
      `The existing case ${newCase.caseIdentifier} does not contain offsite archive files: (${extraWorkflowRunIdsForOffsiteArchiveInRequest}) which are present in the request.`
    );
  }
  const [
    workflowRunIdsForVidarrArchivalNotInRequest,
    extraWorkflowRunIdsForVidarrArchivalInRequest,
  ] = arrayDiff(
    existingCase.workflowRunIdsForVidarrArchival,
    newCase.workflowRunIdsForVidarrArchival
  );
  if (workflowRunIdsForOffsiteArchiveNotInRequest.length != 0) {
    errors.push(
      `The existing case ${newCase.caseIdentifier} contains offsite archive files: (${workflowRunIdsForVidarrArchivalNotInRequest}) which are not present in the request.`
    );
  }
  if (extraWorkflowRunIdsForVidarrArchivalInRequest.length != 0) {
    errors.push(
      `The existing case ${newCase.caseIdentifier} does not contain offsite archive files: (${extraWorkflowRunIdsForVidarrArchivalInRequest}) which are present in the request.`
    );
  }
  const [archiveWithNotInRequest, extraArchiveWithInRequest] = arrayDiff(
    existingCase.archiveWith,
    newCase.archiveWith
  );
  if (workflowRunIdsForOffsiteArchiveNotInRequest.length != 0) {
    errors.push(
      `The existing case ${newCase.caseIdentifier} contains offsite archive files: (${archiveWithNotInRequest}) which are not present in the request.`
    );
  }
  if (extraArchiveWithInRequest.length != 0) {
    errors.push(
      `The existing case ${newCase.caseIdentifier} does not contain offsite archive files: (${extraArchiveWithInRequest}) which are present in the request.`
    );
  }
  if (existingCase.archiveTarget != newCase.archiveTarget) {
    errors.push(
      `Archive target '${newCase.archiveTarget}' from request does not match archive target '${existingCase.archiveTarget}' for case ${newCase.caseIdentifier}.`
    );
  }
  return errors;
};

const addCaseArchive = async (req, res, next) => {
  try {
    //authenticate api-key from header before continuing
    await authenticator.authenticateRequest(req);

    let caseIdentifier = req.body.caseIdentifier
    const existingCases = await archiveDao.getByArchiveEntityIdentifier(
      caseIdentifier,
      false,
      caseEntityType
    );
    if (existingCases == null || !existingCases.length) {
      await upsert(req.body, true);
      res.status(201).end();
    } else {
      for (let existingCase of existingCases) {
        // check for conflicting changes
        let errors = getErrorsForConflictingChanges(existingCase, req.body);
        if (errors.length) {
          await archiveDao.setEntityArchiveDoNotProcess(
            existingCase.entityIdentifier
          );
          caseArchiveStopProcessing.inc({
            caseIdentifier: existingCase.entityIdentifier,
          });
          for (const e of errors) {
            logger.error(e);
          }
          throw new ConflictingDataError(errors.join('\n'));
        }
        if (!hasArchivingStarted(existingCase)) {
          // can modify a case that hasn't been archived if there are no errors
          await upsert(req.body, false);  // this mutates req.body
          let updatedCase = await archiveDao.getByArchiveEntityIdentifier(
            caseIdentifier,
            false,
            caseEntityType
          );
          res.status(200).send(replaceGenericKeyName(updatedCase));
          return true;
        } else {
          // if case has started archiving, can only modify case metadata
          await archiveDao.updateMetadata(
            caseIdentifier,
            req.body.metadata
          );
          let updatedCase = await archiveDao.getByArchiveEntityIdentifier(
            caseIdentifier,
            false,
            caseEntityType
          );
          res.status(200).send(replaceGenericKeyName(updatedCase));
          return true;
        }
        /* NOTE: if we keep encountering HALP actions that don't require any further fixing other than
           hitting the case/<caseIdentifier>/resume-archiving endpoint because the underlying discrepancy
           gets resolved upstream, we might want to adjust these last two conditions to also clear the
           do-not-process flag */
      }
    }
  } catch (e) {
    handleErrors(
      e,
      `Error adding case ${req.body.caseIdentifier}`,
      logger,
      next
    );
  }
};

const upsert = (caseInfo, createNewArchive) => {
  return archiveDao.addArchiveEntity(
    replaceCaseKeyName(caseInfo),
    createNewArchive,
    caseEntityType
  );
};

const setFilesCopiedToOffsiteStagingDir = async (req, res, next) => {
  try {
    let errors = [];
    if (!req.body.copyOutFile) {
      errors.push('Must provide a copyOutFile in request body');
    }
    if (!req.body.batchId) {
      errors.push('Must provide a batchId');
    }
    if (errors.length) {
      throw new ValidationError(errors.join('\n'));
    }
    const updatedCase = await archiveDao.updateFilesCopiedToOffsiteStagingDir(
      req.params.caseIdentifier,
      caseEntityType,
      req.body.batchId,
      JSON.stringify(req.body.copyOutFile)
    );
    if (updatedCase && updatedCase.length) {
      res.status(200).json(replaceGenericKeyName(updatedCase));
    } else {
      res.status(404).end();
    }
  } catch (e) {
    handleErrors(
      e,
      `Error updating case ${req.params.caseIdentifier}`,
      logger,
      next
    );
  }
};

const setFilesLoadedIntoVidarrArchival = async (req, res, next) => {
  try {
    if (!req.body) {
      throw new ValidationError(
        'Must provide an unload file\'s contents in request body'
      );
    }
    const updatedCase = await archiveDao.updateFilesLoadedIntoVidarrArchival(
      req.params.caseIdentifier,
      JSON.stringify(req.body),
      caseEntityType
    );
    if (updatedCase && updatedCase.length) {
      res.status(200).json(replaceGenericKeyName(updatedCase));
    } else {
      res.status(404).end();
    }
  } catch (e) {
    handleErrors(
      e,
      `Error updating case ${req.params.caseIdentifier}`,
      logger,
      next
    );
  }
};

const setFilesSentOffsite = async (req, res, next) => {
  try {
    const updatedCase = await archiveDao.updateFilesSentOffsite(
      req.params.caseIdentifier,
      req.body.commvaultBackupJobId,
      caseEntityType
    );
    if (updatedCase && updatedCase.length) {
      res.status(200).json(replaceGenericKeyName(updatedCase));
    } else {
      res.status(404).end();
    }
  } catch (e) {
    handleErrors(
      e,
      `Error updating case ${req.params.caseIdentifier}`,
      logger,
      next
    );
  }
};

const setFilesUnloaded = async (req, res, next) => {
  try {
    const updatedCase = await archiveDao.updateFilesUnloaded(
      req.params.caseIdentifier,
      caseEntityType
    );
    if (updatedCase && updatedCase.length) {
      res.status(200).json(replaceGenericKeyName(updatedCase));
    } else {
      res.status(404).end();
    }
  } catch (e) {
    handleErrors(
      e,
      `Error updating case ${req.params.caseIdentifier}`,
      logger,
      next
    );
  }
};

const resumeCaseArchiveProcessing = async (req, res, next) => {
  try {
    await archiveDao.resumeEntityArchiveProcessing(req.params.caseIdentifier);
    caseArchiveStopProcessing.set(
      { caseIdentifier: req.params.caseIdentifier },
      0
    );
    const caseArchive = await archiveDao.getByArchiveEntityIdentifier(
      req.params.caseIdentifier,
      false,
      caseEntityType
    );
    res.status(200).json(replaceGenericKeyName(caseArchive));
  } catch (e) {
    handleErrors(
      e,
      `Error resuming processing for case ${req.params.caseIdentifier}`,
      logger,
      next
    );
    res.status(404).end();
  }
};

function replaceCaseKeyName (originalCase) {
  if (originalCase.hasOwnProperty('caseIdentifier')) {
    originalCase.archiveEntityIdentifier = originalCase.caseIdentifier;
    delete originalCase.caseIdentifier;
  }
  return originalCase;
}

function replaceGenericKeyName (caseResponse) {
  caseResponse.forEach((item) => {
    if (item.hasOwnProperty('entityIdentifier')) {
      item.caseIdentifier = item.entityIdentifier;
      delete item.entityIdentifier;
    }
  });
  return caseResponse;
}

// This is the stream equivalent of replaceGenericKeyName
const createCaseKeyReplacementStream = () => {
  return new Transform({
    objectMode: true,
    transform (chunk, encoding, callback) {
      const originalCase = chunk;
      const newCase = {};
      for (const key of Object.keys(originalCase)) {
        if (key === 'entityIdentifier') {
          newCase.caseIdentifier = originalCase[key];
        } else {
          newCase[key] = originalCase[key];
        }
      }
      // push the modified object to the next stage of the stream
      this.push(newCase);
      callback();
    },
  });
};

module.exports = {
  allCaseArchives: allCaseArchives,
  addCaseArchive: addCaseArchive,
  getCaseArchive: getCaseArchive,
  setFilesUnloaded: setFilesUnloaded,
  setFilesCopiedToOffsiteStagingDir: setFilesCopiedToOffsiteStagingDir,
  setFilesLoadedIntoVidarrArchival: setFilesLoadedIntoVidarrArchival,
  setFilesSentOffsite: setFilesSentOffsite,
  resumeCaseArchiveProcessing: resumeCaseArchiveProcessing,
};
