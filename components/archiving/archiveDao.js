'use strict';

const { db, pgp, NotFoundError } = require('../../utils/dbUtils');
const logger = require('../../utils/logger').logger;
const queryStream = require('pg-query-stream');
const qrec = pgp.errors.queryResultErrorCode;

// archiveEntity info
const id = 'id';
const created = 'created';
const modified = 'modified';
const archiveEntityId = 'archive_entity_id';
const archiveType = 'entity_type';
const entityIdentifierColumn = 'entity_identifier';
const requisitionId = 'requisition_id';
const limsIds = 'lims_ids';

// archive info
const wfrIdsForOffsite = 'workflow_run_ids_for_offsite_archive';
const unloadFileForOffsite = 'unload_file_for_offsite_archive';
const filesCopiedToOffsiteStagingDir =
  'files_copied_to_offsite_archive_staging_dir';
const commvaultJobId = 'commvault_backup_job_id';
const wfrIdsForVidarrArchival = 'workflow_run_ids_for_vidarr_archival';
const unloadFileForVidarrArchival = 'unload_file_for_vidarr_archival';
const filesLoadedIntoVidarrArchival = 'files_loaded_into_vidarr_archival';
const filesUnloaded = 'files_unloaded';
const metadata = 'metadata';
const archiveWith = 'archive_with';
const archiveTarget = 'archive_target';
const batchId = 'batch_id';
const stopProcessing = 'stop_processing';

const entityCols = [
  id,
  entityIdentifierColumn,
  requisitionId,
  limsIds,
  archiveType,
];
const archiveCols = [
  id,
  created,
  modified,
  archiveEntityId,
  wfrIdsForOffsite,
  unloadFileForOffsite,
  filesCopiedToOffsiteStagingDir,
  commvaultJobId,
  wfrIdsForVidarrArchival,
  unloadFileForVidarrArchival,
  filesLoadedIntoVidarrArchival,
  filesUnloaded,
  metadata,
  archiveWith,
  archiveTarget,
  batchId,
  stopProcessing,
];

const entityColsCreate = new pgp.helpers.ColumnSet(
  [entityIdentifierColumn, requisitionId, limsIds, archiveType],
  { table: 'archive_entity' }
);
const archiveColsCreate = [
  archiveEntityId,
  wfrIdsForOffsite,
  wfrIdsForVidarrArchival,
  metadata,
  archiveTarget,
  archiveWith,
];
const archiveColsAddBatchId = [archiveEntityId, batchId];
const archiveColsCopyToOffsiteStagingDir = [
  archiveEntityId,
  unloadFileForOffsite,
  filesCopiedToOffsiteStagingDir,
  batchId,
];
const archiveColsOffsiteArchiveComplete = [archiveEntityId, commvaultJobId];
const archiveColsLoadIntoVidarrArchival = [
  archiveEntityId,
  unloadFileForVidarrArchival,
  filesLoadedIntoVidarrArchival,
];
const archiveColsFilesUnloaded = [archiveEntityId, filesUnloaded];

const addArchiveEntity = (kase, newArchive = true, entityType) => {
  return new Promise((resolve, reject) => {
    db.task('add-archives', async (tx) => {
      const archiveEntityData = {
        entity_identifier: kase.archiveEntityIdentifier,
        requisition_id: kase.requisitionId,
        lims_ids: kase.limsIds,
        entity_type: entityType,
      };

      const archiveEntityInsert = pgp.helpers.insert(
        archiveEntityData,
        entityColsCreate,
        'archive_entity'
      );
      const onConflict =
        ' ON CONFLICT(' +
        entityIdentifierColumn +
        ') DO UPDATE SET ' +
        entityColsCreate.assignColumns({
          from: 'EXCLUDED',
          skip: [entityIdentifierColumn, requisitionId, entityType],
        });
      const returning = ' RETURNING id';
      const archiveEntityQuery = archiveEntityInsert + onConflict + returning;
      await tx.one(archiveEntityQuery).then(async (data) => {
        const archiveData = {
          archive_entity_id: data.id,
          workflow_run_ids_for_offsite_archive:
            kase.workflowRunIdsForOffsiteArchive,
          workflow_run_ids_for_vidarr_archival:
            kase.workflowRunIdsForVidarrArchival,
          metadata: kase.metadata,
          archive_target: kase.archiveTarget,
          archive_with: kase.archiveWith,
        };

        let archiveQuery;
        if (newArchive) {
          archiveQuery = pgp.helpers.insert(
            archiveData,
            archiveColsCreate,
            'archive'
          );
        } else {
          archiveQuery = pgp.helpers.update(
            archiveData,
            archiveColsCreate,
            'archive'
          );
          archiveQuery =
            archiveQuery + ` WHERE ${archiveEntityId} = ${data.id};`;
        }
        await tx.none(archiveQuery);
        return;
      });
    })
      .then(() => {
        resolve();
      })
      .catch((err) => {
        reject(new Error(err));
      });
  });
};

const getByIdentifierQuery = `SELECT id FROM archive_entity WHERE ${entityIdentifierColumn} = $1;`;

const addArchiveOnly = (kase) => {
  return new Promise((resolve, reject) => {
    db.task('add-archive', async (tx) => {
      const archiveEntityQuery = getByIdentifierQuery;
      await tx.one(archiveEntityQuery).then(async (data) => {
        const archiveData = {
          archive_entity_id: data.id,
          workflow_run_ids_for_offsite_archive:
            kase.workflowRunIdsForOffsiteArchive,
          workflow_run_ids_for_vidarr_archival:
            kase.workflowRunIdsForVidarrArchival,
          metadata: kase.metadata,
          archive_target: kase.archiveTarget,
          archive_with: kase.archiveWith,
        };

        const archiveQuery = pgp.helpers.insert(
          archiveData,
          archiveColsCreate,
          'archive'
        );
        await tx.none(archiveQuery);
        return;
      });
    })
      .then(() => {
        resolve();
      })
      .catch((err) => {
        reject(new Error(err));
      });
  });
};

const archiveEntityArchiveDataQueryWithoutUnloadFiles = `SELECT c.${entityIdentifierColumn}, c.${requisitionId}, c.${limsIds}, c.${archiveType}, a.${created}, a.${modified}, a.${wfrIdsForOffsite}, a.${filesCopiedToOffsiteStagingDir}, a.${commvaultJobId}, a.${wfrIdsForVidarrArchival}, a.${filesLoadedIntoVidarrArchival}, a.${filesUnloaded}, a.${metadata}, a.${archiveTarget}, a.${archiveWith}, a.${batchId}, a.${stopProcessing} FROM archive_entity c JOIN archive a ON c.${id} = a.${archiveEntityId}`;
const archiveEntityArchiveDataQueryWithUnloadFiles = `SELECT c.${entityIdentifierColumn}, c.${requisitionId}, c.${limsIds}, c.${archiveType}, a.${created}, a.${modified}, a.${wfrIdsForOffsite}, a.${unloadFileForOffsite}, a.${filesCopiedToOffsiteStagingDir}, a.${commvaultJobId}, a.${wfrIdsForVidarrArchival}, a.${unloadFileForVidarrArchival}, a.${filesLoadedIntoVidarrArchival}, a.${filesUnloaded}, a.${metadata}, a.${archiveTarget}, a.${archiveWith}, a.${batchId}, a.${stopProcessing} FROM archive_entity c JOIN archive a ON c.${id} = a.${archiveEntityId}`;

const getArchiveQuery = (includeUnloadFiles = false, entityType) => {
  let query;
  if (includeUnloadFiles) {
    query = archiveEntityArchiveDataQueryWithUnloadFiles;
  } else {
    query = archiveEntityArchiveDataQueryWithoutUnloadFiles;
  }
  query += ` WHERE ${entityIdentifierColumn} = $1 AND ${archiveType} = '${entityType}'`;
  return query;
};

const getByArchiveEntityIdentifier = (
  archiveEntityIdentifier,
  includeUnloadFiles = false,
  entityType
) => {
  const query = getArchiveQuery(includeUnloadFiles, entityType);
  return new Promise((resolve, reject) => {
    db.manyOrNone(query, archiveEntityIdentifier)
      .then((data) => {
        resolve(data);
      })
      .catch((err) => {
        if (err.code === qrec.noData) {
          // no data found
          resolve([]);
        } else {
          reject(new Error(err));
        }
      });
  });
};

/** Return data or NotFoundError */
const getByFilesNotCopiedToOffsiteStagingDir = (entityType) => {
  const query =
    archiveEntityArchiveDataQueryWithoutUnloadFiles +
    ` WHERE ${filesCopiedToOffsiteStagingDir} IS NULL AND ${archiveType} = '${entityType}'`;
  return new Promise((resolve, reject) => {
    db.any(query)
      .then((data) => {
        resolve(data);
      })
      .catch((err) => standardCatch(err, reject));
  });
};

const getByFilesNotLoadedIntoVidarrArchival = (entityType) => {
  const query =
    archiveEntityArchiveDataQueryWithoutUnloadFiles +
    ` WHERE ${filesLoadedIntoVidarrArchival} IS NULL AND ${archiveType} = '${entityType}'`;
  return new Promise((resolve, reject) => {
    db.any(query)
      .then((data) => {
        resolve(data);
      })
      .catch((err) => standardCatch(err, reject));
  });
};

const getByFilesNotSentOffsite = (entityType) => {
  const query =
    archiveEntityArchiveDataQueryWithoutUnloadFiles +
    ` WHERE ${filesCopiedToOffsiteStagingDir} IS NOT NULL AND ${commvaultJobId} IS NULL AND ${archiveType} = '${entityType}'`;
  return new Promise((resolve, reject) => {
    db.any(query)
      .then((data) => {
        resolve(data ? data : []);
      })
      .catch((err) => standardCatch(err, reject));
  });
};

const getByFilesNotUnloaded = (entityType) => {
  const query =
    archiveEntityArchiveDataQueryWithoutUnloadFiles +
    ` WHERE ${commvaultJobId} IS NOT NULL AND ${filesLoadedIntoVidarrArchival} IS NOT NULL AND ${filesUnloaded} IS NULL AND ${archiveType} = '${entityType}'`;
  return new Promise((resolve, reject) => {
    db.any(query)
      .then((data) => {
        resolve(data);
      })
      .catch((err) => standardCatch(err, reject));
  });
};

const getEntityArchiveData = (
  archiveEntityIdentifier,
  includeUnloadFiles = false,
  entityType,
  resolve,
  reject
) => {
  const query = getArchiveQuery(includeUnloadFiles, entityType);
  db.manyOrNone(query, archiveEntityIdentifier)
    .then((data) => {
      resolve(data);
    })
    .catch((err) => standardCatch(err, reject));
};

const stopProcessingQuery = `UPDATE archive SET ${stopProcessing} = true WHERE ${archiveEntityId} = (SELECT ${id} FROM archive_entity WHERE ${entityIdentifierColumn} = $1)`;
const setEntityArchiveDoNotProcess = (archiveEntityIdentifier) => {
  return new Promise((resolve, reject) => {
    db.none(stopProcessingQuery, archiveEntityIdentifier)
      .then(() => {
        resolve();
      })
      .catch((err) => standardCatch(err, reject));
  });
};

const resumeProcessingQuery = `UPDATE archive SET ${stopProcessing} = false WHERE ${archiveEntityId} = (SELECT ${id} FROM archive_entity WHERE ${entityIdentifierColumn} = $1)`;
const resumeEntityArchiveProcessing = (archiveEntityIdentifier) => {
  return new Promise((resolve, reject) => {
    db.none(resumeProcessingQuery, archiveEntityIdentifier)
      .then(() => resolve())
      .catch((err) => standardCatch(err, reject));
  });
};

const updateMetadataQuery = `UPDATE archive SET ${metadata} = $1 WHERE ${archiveEntityId} = (SELECT ${id} FROM archive_entity WHERE ${entityIdentifierColumn} = $2)`;

const updateMetadata = (archiveEntityIdentifier, metadata) => {
  return new Promise((resolve, reject) => {
    db.none(updateMetadataQuery, [metadata, archiveEntityIdentifier])
      .then(() => resolve())
      .catch((err) => standardCatch(err, reject));
  });
};

const filesCopiedToStagingDirQuery = `UPDATE archive SET ${filesCopiedToOffsiteStagingDir} = NOW(), ${unloadFileForOffsite} = $1, ${batchId} = $2 WHERE ${archiveEntityId} = (SELECT ${id} FROM archive_entity WHERE ${entityIdentifierColumn} = $3) AND ${filesCopiedToOffsiteStagingDir} IS NULL`;

const updateFilesCopiedToOffsiteStagingDir = (
  archiveEntityIdentifier,
  entityType,
  batchId,
  unloadFile
) => {
  return new Promise((resolve, reject) => {
    db.none(filesCopiedToStagingDirQuery, [
      unloadFile,
      batchId,
      archiveEntityIdentifier,
    ])
      .then(() => {
        getEntityArchiveData(
          archiveEntityIdentifier,
          false,
          entityType,
          resolve,
          reject
        );
      })
      .catch((err) => standardCatch(err, reject));
  });
};

const filesLoadedIntoVidarrArchivalQuery = `UPDATE archive SET ${filesLoadedIntoVidarrArchival} = NOW(), ${unloadFileForVidarrArchival} = $1 WHERE ${archiveEntityId} = (SELECT ${id} FROM archive_entity WHERE ${entityIdentifierColumn} = $2) AND ${filesLoadedIntoVidarrArchival} IS NULL`;

const updateFilesLoadedIntoVidarrArchival = (
  archiveEntityIdentifier,
  unloadFile,
  entityType
) => {
  return new Promise((resolve, reject) => {
    db.none(filesLoadedIntoVidarrArchivalQuery, [
      unloadFile,
      archiveEntityIdentifier,
    ])
      .then(() => {
        getEntityArchiveData(
          archiveEntityIdentifier,
          false,
          entityType,
          resolve,
          reject
        );
      })
      .catch((err) => standardCatch(err, reject));
  });
};

const filesSentOffsiteQuery = `UPDATE archive SET ${commvaultJobId} = $1 WHERE ${archiveEntityId} = (SELECT ${id} FROM archive_entity WHERE ${entityIdentifierColumn} = $2) AND ${commvaultJobId} IS NULL`;

const updateFilesSentOffsite = (
  archiveEntityIdentifier,
  commvaultJobId,
  entityType
) => {
  return new Promise((resolve, reject) => {
    db.none(filesSentOffsiteQuery, [commvaultJobId, archiveEntityIdentifier])
      .then(() => {
        getEntityArchiveData(
          archiveEntityIdentifier,
          false,
          entityType,
          resolve,
          reject
        );
      })
      .catch((err) => standardCatch(err, reject));
  });
};

const filesUnloadedQuery = `UPDATE archive SET ${filesUnloaded} = NOW() WHERE ${archiveEntityId} = (SELECT ${id} FROM archive_entity WHERE ${entityIdentifierColumn} = $1) AND ${filesUnloaded} IS NULL`;

const updateFilesUnloaded = (archiveEntityIdentifier, entityType) => {
  return new Promise((resolve, reject) => {
    db.none(filesUnloadedQuery, [archiveEntityIdentifier])
      .then(() => {
        getEntityArchiveData(
          archiveEntityIdentifier,
          false,
          entityType,
          resolve,
          reject
        );
      })
      .catch((err) => standardCatch(err, reject));
  });
};

const standardCatch = (err, reject) => {
  if (err.code === qrec.noData) {
    reject(new NotFoundError());
  } else {
    logger.error(err);
    reject(new Error(err));
  }
};

const streamAllProjects = (fn) => {
  const query = new queryStream(
    archiveEntityArchiveDataQueryWithoutUnloadFiles +
      ` WHERE ${archiveType} = 'PROJECT' `
  );
  return db.stream(query, fn);
};

const streamAllCases = (fn) => {
  const query = new queryStream(
    archiveEntityArchiveDataQueryWithoutUnloadFiles +
      ` WHERE ${archiveType} = 'CASE' `
  );
  return db.stream(query, fn);
};

const streamAllArchiveEntities = (fn) => {
  const query = new queryStream(
    archiveEntityArchiveDataQueryWithoutUnloadFiles
  );
  return db.stream(query, fn);
};

module.exports = {
  addArchiveEntity: addArchiveEntity,
  addArchiveOnly: addArchiveOnly,
  getByArchiveEntityIdentifier: getByArchiveEntityIdentifier,
  updateFilesCopiedToOffsiteStagingDir: updateFilesCopiedToOffsiteStagingDir,
  updateFilesLoadedIntoVidarrArchival: updateFilesLoadedIntoVidarrArchival,
  updateFilesSentOffsite: updateFilesSentOffsite,
  updateFilesUnloaded: updateFilesUnloaded,
  streamAllArchiveEntities: streamAllArchiveEntities,
  streamAllCases: streamAllCases,
  streamAllProjects: streamAllProjects,
  getByFilesNotCopiedToOffsiteStagingDir:
    getByFilesNotCopiedToOffsiteStagingDir,
  getByFilesNotLoadedIntoVidarrArchival: getByFilesNotLoadedIntoVidarrArchival,
  getByFilesNotSentOffsite: getByFilesNotSentOffsite,
  getByFilesNotUnloaded: getByFilesNotUnloaded,
  setEntityArchiveDoNotProcess: setEntityArchiveDoNotProcess,
  resumeEntityArchiveProcessing: resumeEntityArchiveProcessing,
  updateMetadata: updateMetadata,
};
