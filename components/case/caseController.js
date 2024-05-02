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

function arraysEquals (array1, array2) {
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
    handleErrors(e, 'Error getting case', logger, next);
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
          logger.log(err);
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

const isNotArchived = (kase) => {
  return (
    kase.filesCopiedToOffsiteArchiveStagingDir == null &&
    kase.commvaultBackupJobId == null &&
    kase.filesLoadedIntoVidarrArchival == null &&
    kase.caseFilesUnloaded == null
  );
};

const addCaseArchive = async (req, res, next) => {
  try {
    const existingCases = await caseDao.getByCaseIdentifier(
      req.body.caseIdentifier
    );
    if (existingCases == null || !existingCases.length) {
      await upsert(req.body, true);
      res.status(201).end();
    } else {
      for (let existingCase of existingCases) {
        if (
          existingCase.requisitionId == req.body.requisitionId &&
          arraysEquals(existingCase.limsIds, req.body.limsIds) &&
          arraysEquals(
            existingCase.workflowRunIdsForOffsiteArchive,
            req.body.workflowRunIdsForOffsiteArchive
          ) &&
          arraysEquals(
            existingCase.workflowRunIdsForVidarrArchival,
            req.body.workflowRunIdsForVidarrArchival
          )
        ) {
          // case data is same, no need to update
          res.status(200).end();
          return true;
        } else if (
          existingCase.requisitionId != req.body.requisitionId ||
          !arraysEquals(existingCase.limsIds, req.body.limsIds)
        ) {
          // data has changed
          throw new ConflictingDataError(
            `Cannot modify data for case ${existingCase.caseIdentifier}, requisition or lims identifier(s) do not matching existing data`
          );
        } else if (isNotArchived(existingCase)) {
          // no harm in modifying a case that hasn't yet been archived
          await upsert(req.body, false);
          res.status(201).end();
          return true;
        } else if (isCompletelyArchived(existingCase)) {
          // can add a new archive record for a case where ALL are completed
          continue;
        } else {
          // case data is different but files have already been copied to archiving directory / archiving may have begun
          throw new ConflictingDataError(
            `Cannot modify data for case ${existingCase.caseIdentifier} that's actively being archived`
          );
        }
      }
      upsertArchive(req.body);
      res.status(201).end();
      return true;
    }
  } catch (e) {
    handleErrors(e, 'Error adding cases', logger, next);
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
    if (!req.body) {
      throw new ValidationError(
        'Must provide an unload file\'s contents in request body'
      );
    }
    const updatedCase = await caseDao.updateFilesCopiedToOffsiteStagingDir(
      req.params.caseIdentifier,
      JSON.stringify(req.body)
    );
    if (updatedCase && updatedCase.length) {
      res.status(200).json(updatedCase);
    } else {
      res.status(404).end();
    }
  } catch (e) {
    handleErrors(e, 'Error updating case', logger, next);
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
    handleErrors(e, 'Error updating case', logger, next);
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
    handleErrors(e, 'Error updating case', logger, next);
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
    handleErrors(e, 'Error updating case', logger, next);
  }
};

module.exports = {
  allCaseArchives: allCaseArchives,
  addCaseArchive: addCaseArchive,
  getCaseArchive: getCaseArchive,
  caseFilesUnloaded: caseFilesUnloaded,
  filesCopiedToOffsiteStagingDir: filesCopiedToOffsiteStagingDir,
  filesLoadedIntoVidarrArchival: filesLoadedIntoVidarrArchival,
  filesSentOffsite: filesSentOffsite,
};
