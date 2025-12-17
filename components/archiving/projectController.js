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
const projectEntityType = 'PROJECT';

const projectArchiveStopProcessing = new prometheus.Gauge({
  name: 'nabu_project_archive_stop_processing',
  help: 'The project was set to stop processing',
  labelNames: ['projectIdentifier'],
});

const getProjectArchive = async (req, res, next) => {
  try {
    const projectArchive = await archiveDao.getByArchiveEntityIdentifier(
      req.params.projectIdentifier,
      req.query.includeVidarrMetadata ? req.query.includeVidarrMetadata : false,
      projectEntityType
    );
    if (projectArchive && projectArchive.length) {
      res.status(200).json(replaceGenericKeyName(projectArchive));
    } else {
      res.status(404).end();
    }
  } catch (e) {
    handleErrors(
      e,
      `Error getting project ${req.params.projectIdentifier}`,
      logger,
      next
    );
  }
};

/**
 * Request all project archives.
 * Can optionally filter for items that are "not" at a certain state of archiving: 'copied-to-staging', 'sent-offsite', 'sent-to-vidarr-archival', 'unloaded'
 */
const allProjectArchives = async (req, res, next) => {
  try {
    const query = req.query.not;
    let projects;
    if (query) {
      if (query == urls.filesCopiedToOffsiteStagingDir) {
        projects = await archiveDao.getByFilesNotCopiedToOffsiteStagingDir(
          projectEntityType
        );
        res.status(200).send(replaceGenericKeyName(projects));
      } else if (query == urls.filesSentOffsite) {
        projects = await archiveDao.getByFilesNotSentOffsite(projectEntityType);
        res.status(200).send(replaceGenericKeyName(projects));
      } else if (query == urls.filesLoadedIntoVidarrArchival) {
        projects = await archiveDao.getByFilesNotLoadedIntoVidarrArchival(
          projectEntityType
        );
        res.status(200).send(replaceGenericKeyName(projects));
      } else if (query == urls.filesUnloaded) {
        projects = await archiveDao.getByFilesNotUnloaded(projectEntityType);
        res.status(200).send(replaceGenericKeyName(projects));
      }
    } else {
      projects = await archiveDao.streamAllProjects((stream) => {
        res.status(200);
        stream
          .pipe(createProjectKeyReplacementStream())
          .pipe(JSONStream.stringify())
          .pipe(res);
        stream.on('error', (err) => {
          // log the error and prematurely end the response
          logger.error(err);
          res.end();
        });
      });
      logger.info({
        streamRowsProcessedProjects: projects.processed,
        streamingDurationProjects: projects.duration,
        method: '',
      });
    }
    next();
  } catch (e) {
    handleErrors(e, 'Error getting projects', logger, next);
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

const getErrorsForConflictingChanges = (existingProject, newProject) => {
  let errors = [];
  const [limsIdsNotInRequest, extraLimsIdsInRequest] = arrayDiff(
    existingProject.limsIds,
    newProject.limsIds
  );
  if (limsIdsNotInRequest.length != 0) {
    errors.push(
      `The existing project ${newProject.projectIdentifier} contains LIMS IDs: (${limsIdsNotInRequest}) which are not present in the request.`
    );
  }
  if (extraLimsIdsInRequest.length != 0) {
    errors.push(
      `The existing project ${newProject.projectIdentifier} does not contain LIMS IDs: (${extraLimsIdsInRequest}) which are present in the request.`
    );
  }
  const [
    workflowRunIdsForOffsiteArchiveNotInRequest,
    extraWorkflowRunIdsForOffsiteArchiveInRequest,
  ] = arrayDiff(
    existingProject.workflowRunIdsForOffsiteArchive,
    newProject.workflowRunIdsForOffsiteArchive
  );
  if (workflowRunIdsForOffsiteArchiveNotInRequest.length != 0) {
    errors.push(
      `The existing project ${newProject.projectIdentifier} contains offsite archive files: (${workflowRunIdsForOffsiteArchiveNotInRequest}) which are not present in the request.`
    );
  }
  if (extraWorkflowRunIdsForOffsiteArchiveInRequest.length != 0) {
    errors.push(
      `The existing project ${newProject.projectIdentifier} does not contain offsite archive files: (${extraWorkflowRunIdsForOffsiteArchiveInRequest}) which are present in the request.`
    );
  }
  const [
    workflowRunIdsForVidarrArchivalNotInRequest,
    extraWorkflowRunIdsForVidarrArchivalInRequest,
  ] = arrayDiff(
    existingProject.workflowRunIdsForVidarrArchival,
    newProject.workflowRunIdsForVidarrArchival
  );
  if (workflowRunIdsForOffsiteArchiveNotInRequest.length != 0) {
    errors.push(
      `The existing project ${newProject.projectIdentifier} contains offsite archive files: (${workflowRunIdsForVidarrArchivalNotInRequest}) which are not present in the request.`
    );
  }
  if (extraWorkflowRunIdsForVidarrArchivalInRequest.length != 0) {
    errors.push(
      `The existing project ${newProject.projectIdentifier} does not contain offsite archive files: (${extraWorkflowRunIdsForVidarrArchivalInRequest}) which are present in the request.`
    );
  }
  const [archiveWithNotInRequest, extraArchiveWithInRequest] = arrayDiff(
    existingProject.archiveWith,
    newProject.archiveWith
  );
  if (workflowRunIdsForOffsiteArchiveNotInRequest.length != 0) {
    errors.push(
      `The existing project ${newProject.projectIdentifier} contains offsite archive files: (${archiveWithNotInRequest}) which are not present in the request.`
    );
  }
  if (extraArchiveWithInRequest.length != 0) {
    errors.push(
      `The existing project ${newProject.projectIdentifier} does not contain offsite archive files: (${extraArchiveWithInRequest}) which are present in the request.`
    );
  }
  if (existingProject.archiveTarget != newProject.archiveTarget) {
    errors.push(
      `Archive target '${newProject.archiveTarget}' from request does not match archive target '${existingProject.archiveTarget}' for project ${newProject.projectIdentifier}.`
    );
  }
  return errors;
};

const addProjectArchive = async (req, res, next) => {
  try {
    //authenticate api-key from header before continuing
    await authenticator.authenticateRequest(req);

    const existingProjects = await archiveDao.getByArchiveEntityIdentifier(
      req.body.projectIdentifier,
      false,
      projectEntityType
    );
    if (existingProjects == null || !existingProjects.length) {
      await upsert(req.body, true);
      res.status(201).end();
    } else {
      for (let existingProject of existingProjects) {
        // check for conflicting changes
        let errors = getErrorsForConflictingChanges(existingProject, req.body);
        if (errors.length) {
          await archiveDao.setEntityArchiveDoNotProcess(
            existingProject.entityIdentifier
          );
          projectArchiveStopProcessing.inc({
            projectIdentifier: existingProject.entityIdentifier,
          });
          for (const e of errors) {
            logger.error(e);
          }
          throw new ConflictingDataError(errors.join('\n'));
        }
        if (!hasArchivingStarted(existingProject)) {
          // can modify a project that hasn't been archived if there are no errors
          await upsert(req.body, false);
          let updatedProject = await archiveDao.getByArchiveEntityIdentifier(
            req.body.projectIdentifier,
            false,
            projectEntityType
          );
          res.status(200).send(replaceGenericKeyName(updatedProject));
          return true;
        } else {
          // if project has started archiving, can only modify project metadata
          await archiveDao.updateMetadata(
            req.params.projectIdentifier,
            req.body.metadata
          );
          let updatedProject = await archiveDao.getByArchiveEntityIdentifier(
            req.body.projectIdentifier,
            false,
            projectEntityType
          );
          res.status(200).send(replaceGenericKeyName(updatedProject));
          return true;
        }
        /* NOTE: if we keep encountering HALP actions that don't require any further fixing other than
           hitting the project/<projectIdentifier>/resume-archiving endpoint because the underlying discrepancy
           gets resolved upstream, we might want to adjust these last two conditions to also clear the
           do-not-process flag */
      }
    }
  } catch (e) {
    handleErrors(
      e,
      `Error adding project ${req.body.projectIdentifier}`,
      logger,
      next
    );
  }
};

const upsert = (projectInfo, createNewArchive) => {
  return archiveDao.addArchiveEntity(
    replaceProjectKeyName(projectInfo),
    createNewArchive,
    projectEntityType
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
    const updatedProject =
      await archiveDao.updateFilesCopiedToOffsiteStagingDir(
        req.params.projectIdentifier,
        projectEntityType,
        req.body.batchId,
        JSON.stringify(req.body.copyOutFile)
      );
    if (updatedProject && updatedProject.length) {
      res.status(200).json(replaceGenericKeyName(updatedProject));
    } else {
      res.status(404).end();
    }
  } catch (e) {
    handleErrors(
      e,
      `Error updating project ${req.params.projectIdentifier}`,
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
    const updatedProject = await archiveDao.updateFilesLoadedIntoVidarrArchival(
      req.params.projectIdentifier,
      JSON.stringify(req.body),
      projectEntityType
    );
    if (updatedProject && updatedProject.length) {
      res.status(200).json(replaceGenericKeyName(updatedProject));
    } else {
      res.status(404).end();
    }
  } catch (e) {
    handleErrors(
      e,
      `Error updating project ${req.params.projectIdentifier}`,
      logger,
      next
    );
  }
};

const setFilesSentOffsite = async (req, res, next) => {
  try {
    const updatedProject = await archiveDao.updateFilesSentOffsite(
      req.params.projectIdentifier,
      req.body.commvaultBackupJobId,
      projectEntityType
    );
    if (updatedProject && updatedProject.length) {
      res.status(200).json(replaceGenericKeyName(updatedProject));
    } else {
      res.status(404).end();
    }
  } catch (e) {
    handleErrors(
      e,
      `Error updating project ${req.params.projectIdentifier}`,
      logger,
      next
    );
  }
};

const setFilesUnloaded = async (req, res, next) => {
  try {
    const updatedProject = await archiveDao.updateFilesUnloaded(
      req.params.projectIdentifier,
      projectEntityType
    );
    if (updatedProject && updatedProject.length) {
      res.status(200).json(replaceGenericKeyName(updatedProject));
    } else {
      res.status(404).end();
    }
  } catch (e) {
    handleErrors(
      e,
      `Error updating project ${req.params.projectIdentifier}`,
      logger,
      next
    );
  }
};

const resumeProjectArchiveProcessing = async (req, res, next) => {
  try {
    await archiveDao.resumeEntityArchiveProcessing(
      req.params.projectIdentifier
    );
    projectArchiveStopProcessing.set(
      { projectIdentifier: req.params.projectIdentifier },
      0
    );
    const projectArchive = await archiveDao.getByArchiveEntityIdentifier(
      req.params.projectIdentifier,
      false,
      projectEntityType
    );
    res.status(200).json(replaceGenericKeyName(projectArchive));
  } catch (e) {
    handleErrors(
      e,
      `Error resuming processing for project ${req.params.projectIdentifier}`,
      logger,
      next
    );
    res.status(404).end();
  }
};

function replaceProjectKeyName (originalProject) {
  const newProject = {};
  for (const key of Object.keys(originalProject)) {
    if (key === 'projectIdentifier') {
      newProject.archiveEntityIdentifier = originalProject[key];
    } else {
      newProject[key] = originalProject[key];
    }
  }
  return newProject;
}

function replaceGenericKeyName (projectResponse) {
  const updatedProjectResponse = [];
  for (let i = 0; i < projectResponse.length; i++) {
    const originalProject = projectResponse[i];
    const newProject = {};
    for (const key of Object.keys(originalProject)) {
      if (key === 'entityIdentifier') {
        newProject.projectIdentifier = originalProject[key];
      } else {
        newProject[key] = originalProject[key];
      }
    }
    updatedProjectResponse.push(newProject);
  }
  return updatedProjectResponse;
}

// This is the stream equivalent of replaceGenericKeyName
const createProjectKeyReplacementStream = () => {
  return new Transform({
    objectMode: true,
    transform (chunk, encoding, callback) {
      const originalProject = chunk;
      const newProject = {};
      for (const key of Object.keys(originalProject)) {
        if (key === 'entityIdentifier') {
          newProject.projectIdentifier = originalProject[key];
        } else {
          newProject[key] = originalProject[key];
        }
      }
      // push the modified object to the next stage of the stream
      this.push(newProject);
      callback();
    },
  });
};

module.exports = {
  allProjectArchives: allProjectArchives,
  addProjectArchive: addProjectArchive,
  getProjectArchive: getProjectArchive,
  setFilesUnloaded: setFilesUnloaded,
  setFilesCopiedToOffsiteStagingDir: setFilesCopiedToOffsiteStagingDir,
  setFilesLoadedIntoVidarrArchival: setFilesLoadedIntoVidarrArchival,
  setFilesSentOffsite: setFilesSentOffsite,
  resumeProjectArchiveProcessing: resumeProjectArchiveProcessing,
};
