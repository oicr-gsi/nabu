'use strict';

const archiveDao = require('./archiveDao');
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
const projectEntityType = 'PROJECT';

const projectArchiveStopProcessing = new prometheus.Gauge({
  name: 'nabu_project_archive_stop_processing',
  help: 'The project was set to stop processing',
  labelNames: ['projectIdentifier'],
});

function arraysEquals (array1, array2) {
  array1 = array1 || [];
  array2 = array2 || [];
  return (
    array1.every((item) => array2.includes(item)) &&
    array2.every((item) => array1.includes(item))
  );
}

const getProjectArchive = async (req, res, next) => {
  try {
    const cardeaProject = await archiveDao.getByArchiveEntityIdentifier(
      req.params.projectIdentifier,
      req.query.includeVidarrMetadata ? req.query.includeVidarrMetadata : false,
      projectEntityType
    );
    if (cardeaProject && cardeaProject.length) {
      res.status(200).json(replaceGenericKeyName(cardeaProject));
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
        let errors = [];
        let projectStoppedProcessing = false;
        if (existingProject.requisitionId != req.body.requisitionId) {
          errors.push(
            `Requisition (${req.body.requisitionId}) from request does not match requisition ${existingProject.requisitionId} for project ${req.body.projectIdentifier}`
          );
          projectStoppedProcessing = true;
        }
        if (!arraysEquals(existingProject.limsIds, req.body.limsIds)) {
          errors.push(
            `LIMS IDs (${req.body.limsIds}) from request do not match LIMS IDs ${existingProject.limsIds} for project ${req.body.projectIdentifier}`
          );
          projectStoppedProcessing = true;
        }
        if (
          !arraysEquals(
            existingProject.workflowRunIdsForOffsiteArchive,
            req.body.workflowRunIdsForOffsiteArchive
          )
        ) {
          errors.push(
            `Requested offsite archive files list ${req.body.workflowRunIdsForOffsiteArchive} does not match offsite files archive list ${existingProject.workflowRunIdsForOffsiteArchive} for project ${existingProject.entityIdentifier}`
          );
          projectStoppedProcessing = true;
        }
        if (
          !arraysEquals(
            existingProject.workflowRunIdsForVidarrArchival,
            req.body.workflowRunIdsForVidarrArchival
          )
        ) {
          errors.push(
            `Requested onsite archive files list ${req.body.workflowRunIdsForVidarrArchival} does not match onsite archive files list ${existingProject.workflowRunIdsForVidarrArchival} for project ${existingProject.entityIdentifier}`
          );
          projectStoppedProcessing = true;
        }
        if (!arraysEquals(existingProject.archiveWith, req.body.archiveWith)) {
          errors.push(
            `Requested archive_with=${req.body.archiveWith} from request does not match archive_with=${existingProject.archiveWith} for project ${req.body.projectIdentifier}`
          );
          projectStoppedProcessing = true;
        }
        if (existingProject.archiveTarget != req.body.archiveTarget) {
          errors.push(
            `Archive target '${req.body.archiveTarget}' from request does not match archive target '${existingProject.archiveTarget}' for project ${req.body.projectIdentifier}`
          );
          projectStoppedProcessing = true;
        }
        if (projectStoppedProcessing) {
          await archiveDao.setEntityArchiveDoNotProcess(
            existingProject.entityIdentifier
          );
          projectArchiveStopProcessing.inc({
            projectIdentifier: existingProject.entityIdentifier,
          });
        }
        if (errors.length) {
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

const upsertArchive = (projectInfo) => {
  return archiveDao.addArchiveOnly(replaceProjectKeyName(projectInfo));
};

const filesCopiedToOffsiteStagingDir = async (req, res, next) => {
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

const filesLoadedIntoVidarrArchival = async (req, res, next) => {
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

const filesSentOffsite = async (req, res, next) => {
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

const filesUnloaded = async (req, res, next) => {
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

const { Transform } = require('stream');
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
  filesUnloaded: filesUnloaded,
  filesCopiedToOffsiteStagingDir: filesCopiedToOffsiteStagingDir,
  filesLoadedIntoVidarrArchival: filesLoadedIntoVidarrArchival,
  filesSentOffsite: filesSentOffsite,
  resumeProjectArchiveProcessing: resumeProjectArchiveProcessing,
};
