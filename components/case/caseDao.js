'use strict';

const { db, pgp, NotFoundError } = require('../../utils/dbUtils');
const logger = require('../../utils/logger').logger;
const queryStream = require('pg-query-stream');
const qrec = pgp.errors.queryResultErrorCode;

// case info
const id = 'id';
const created = 'created';
const modified = 'modified';
const caseId = 'case_id';
const caseIdentifier = 'case_identifier';
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
const caseFilesUnloaded = 'case_files_unloaded';

const caseCols = [id, caseIdentifier, requisitionId, limsIds];
const archiveCols = [
  id,
  created,
  modified,
  caseId,
  wfrIdsForOffsite,
  unloadFileForOffsite,
  filesCopiedToOffsiteStagingDir,
  commvaultJobId,
  wfrIdsForVidarrArchival,
  unloadFileForVidarrArchival,
  filesLoadedIntoVidarrArchival,
  caseFilesUnloaded,
];

const caseColsCreate = new pgp.helpers.ColumnSet(
  [caseIdentifier, requisitionId, limsIds],
  { table: 'cardea_case' }
);
const archiveColsCreate = [caseId, wfrIdsForOffsite, wfrIdsForVidarrArchival];
const archiveColsCopyToOffsiteStagingDir = [
  caseId,
  unloadFileForOffsite,
  filesCopiedToOffsiteStagingDir,
];
const archiveColsBackupComplete = [caseId, commvaultJobId];
const archiveColsLoadIntoVidarrArchival = [
  caseId,
  unloadFileForVidarrArchival,
  filesLoadedIntoVidarrArchival,
];
const archiveColsCaseFilesUnloaded = [caseId, caseFilesUnloaded];

const addCase = (kase, newArchive = true) => {
  return new Promise((resolve, reject) => {
    db.task('add-cases', async (tx) => {
      const caseData = {
        case_identifier: kase.caseIdentifier,
        requisition_id: kase.requisitionId,
        lims_ids: kase.limsIds,
      };

      const caseInsert = pgp.helpers.insert(
        caseData,
        caseColsCreate,
        'cardea_case'
      );
      const onConflict =
        ' ON CONFLICT(' +
        caseIdentifier +
        ') DO UPDATE SET ' +
        caseColsCreate.assignColumns({
          from: 'EXCLUDED',
          skip: [caseIdentifier, requisitionId],
        });
      const returning = ' RETURNING id';
      const caseQuery = caseInsert + onConflict + returning;
      await tx.one(caseQuery).then(async (data) => {
        const archiveData = {
          case_id: data.id,
          workflow_run_ids_for_offsite_archive:
            kase.workflowRunIdsForOffsiteArchive,
          workflow_run_ids_for_vidarr_archival:
            kase.workflowRunIdsForVidarrArchival,
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
          archiveQuery = archiveQuery + ` WHERE ${caseId} = ${data.id};`;
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

const addCaseArchiveOnly = (kase) => {
  return new Promise((resolve, reject) => {
    db.task('add-archive', async (tx) => {
      const caseQuery =
        'SELECT id FROM cardea_case WHERE case_identifier=\'' +
        kase.caseIdentifier +
        '\';';
      await tx.one(caseQuery).then(async (data) => {
        const archiveData = {
          case_id: data.id,
          workflow_run_ids_for_offsite_archive:
            kase.workflowRunIdsForOffsiteArchive,
          workflow_run_ids_for_vidarr_archival:
            kase.workflowRunIdsForVidarrArchival,
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

const caseArchiveDataQueryWithoutUnloadFiles = `SELECT c.${caseIdentifier}, c.${requisitionId}, c.${limsIds}, a.${created}, a.${modified}, a.${wfrIdsForOffsite}, a.${filesCopiedToOffsiteStagingDir}, a.${commvaultJobId}, a.${wfrIdsForVidarrArchival}, a.${filesLoadedIntoVidarrArchival}, a.${caseFilesUnloaded} FROM cardea_case c JOIN archive a ON c.${id} = a.${caseId}`;
const caseArchiveDataQueryWithUnloadFiles = `SELECT c.${caseIdentifier}, c.${requisitionId}, c.${limsIds}, a.${created}, a.${modified}, a.${wfrIdsForOffsite}, a.${unloadFileForOffsite}, a.${filesCopiedToOffsiteStagingDir}, a.${commvaultJobId}, a.${wfrIdsForVidarrArchival}, a.${unloadFileForVidarrArchival}, a.${filesLoadedIntoVidarrArchival}, a.${caseFilesUnloaded} FROM cardea_case c JOIN archive a ON c.${id} = a.${caseId}`;

const getCaseArchiveQuery = (includeUnloadFiles = false) => {
  let query;
  if (includeUnloadFiles) {
    query = caseArchiveDataQueryWithUnloadFiles;
  } else {
    query = caseArchiveDataQueryWithoutUnloadFiles;
  }
  query += ` WHERE ${caseIdentifier} = $1`;
  return query;
};

const getByCaseIdentifier = (caseIdentifier, includeUnloadFiles = false) => {
  const query = getCaseArchiveQuery(includeUnloadFiles);
  return new Promise((resolve, reject) => {
    db.manyOrNone(query, caseIdentifier)
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
const getByFilesNotCopiedToOffsiteStagingDir = () => {
  const query =
    caseArchiveDataQueryWithoutUnloadFiles +
    ` WHERE ${filesCopiedToOffsiteStagingDir} IS NULL`;
  return new Promise((resolve, reject) => {
    db.any(query)
      .then((data) => {
        resolve(data);
      })
      .catch((err) => standardCatch(err, reject));
  });
};

const getByFilesNotLoadedIntoVidarrArchival = () => {
  const query =
    caseArchiveDataQueryWithoutUnloadFiles +
    ` WHERE ${filesLoadedIntoVidarrArchival} IS NULL`;
  return new Promise((resolve, reject) => {
    db.any(query)
      .then((data) => {
        resolve(data);
      })
      .catch((err) => standardCatch(err, reject));
  });
};

const getByFilesNotSentOffsite = () => {
  const query =
    caseArchiveDataQueryWithoutUnloadFiles +
    ` WHERE ${filesCopiedToOffsiteStagingDir} IS NOT NULL AND ${commvaultJobId} IS NULL`;
  return new Promise((resolve, reject) => {
    db.any(query)
      .then((data) => {
        resolve(data ? data : []);
      })
      .catch((err) => standardCatch(err, reject));
  });
};

const getByFilesNotUnloaded = () => {
  const query =
    caseArchiveDataQueryWithoutUnloadFiles +
    ` WHERE ${commvaultJobId} IS NOT NULL AND ${filesLoadedIntoVidarrArchival} IS NOT NULL AND ${caseFilesUnloaded} IS NULL`;
  return new Promise((resolve, reject) => {
    db.any(query)
      .then((data) => {
        resolve(data);
      })
      .catch((err) => standardCatch(err, reject));
  });
};

const getCaseArchiveData = (
  caseIdentifier,
  includeUnloadFiles = false,
  resolve,
  reject
) => {
  const query = getCaseArchiveQuery(includeUnloadFiles);
  db.manyOrNone(query, caseIdentifier)
    .then((data) => {
      resolve(data);
    })
    .catch((err) => standardCatch(err, reject));
};

const filesCopiedToStagingDirQuery = `UPDATE archive SET ${filesCopiedToOffsiteStagingDir} = NOW(), ${unloadFileForOffsite} = $1 WHERE ${caseId} = (SELECT ${id} FROM cardea_case WHERE ${caseIdentifier} = $2) AND ${filesCopiedToOffsiteStagingDir} IS NULL`;

const updateFilesCopiedToOffsiteStagingDir = (caseIdentifier, unloadFile) => {
  return new Promise((resolve, reject) => {
    db.none(filesCopiedToStagingDirQuery, [unloadFile, caseIdentifier])
      .then(() => {
        getCaseArchiveData(caseIdentifier, false, resolve, reject);
      })
      .catch((err) => standardCatch(err, reject));
  });
};

const filesLoadedIntoVidarrArchivalQuery = `UPDATE archive SET ${filesLoadedIntoVidarrArchival} = NOW(), ${unloadFileForVidarrArchival} = $1 WHERE ${caseId} = (SELECT ${id} FROM cardea_case WHERE ${caseIdentifier} = $2) AND ${filesLoadedIntoVidarrArchival} IS NULL`;

const updateFilesLoadedIntoVidarrArchival = (caseIdentifier, unloadFile) => {
  return new Promise((resolve, reject) => {
    db.none(filesLoadedIntoVidarrArchivalQuery, [unloadFile, caseIdentifier])
      .then(() => {
        getCaseArchiveData(caseIdentifier, false, resolve, reject);
      })
      .catch((err) => standardCatch(err, reject));
  });
};

const filesSentOffsiteQuery = `UPDATE archive SET ${commvaultJobId} = $1 WHERE ${caseId} = (SELECT ${id} FROM cardea_case WHERE ${caseIdentifier} = $2) AND ${commvaultJobId} IS NULL`;

const updateFilesSentOffsite = (caseIdentifier, commvaultJobId) => {
  return new Promise((resolve, reject) => {
    db.none(filesSentOffsiteQuery, [commvaultJobId, caseIdentifier])
      .then(() => {
        getCaseArchiveData(caseIdentifier, false, resolve, reject);
      })
      .catch((err) => standardCatch(err, reject));
  });
};

const filesUnloadedQuery = `UPDATE archive SET ${caseFilesUnloaded} = NOW() WHERE ${caseId} = (SELECT ${id} FROM cardea_case WHERE ${caseIdentifier} = $1) AND ${caseFilesUnloaded} IS NULL`;

const updateFilesUnloaded = (caseIdentifier) => {
  return new Promise((resolve, reject) => {
    db.none(filesUnloadedQuery, [caseIdentifier])
      .then(() => {
        getCaseArchiveData(caseIdentifier, false, resolve, reject);
      })
      .catch((err) => standardCatch(err, reject));
  });
};

const standardCatch = (err, reject) => {
  if (err.code === qrec.noData) {
    reject(new NotFoundError());
  } else {
    logger.log(err);
    reject(new Error(err));
  }
};

const streamAllCases = (fn) => {
  const query = new queryStream(caseArchiveDataQueryWithoutUnloadFiles);
  return db.stream(query, fn);
};

module.exports = {
  addCase: addCase,
  addCaseArchiveOnly: addCaseArchiveOnly,
  getByCaseIdentifier: getByCaseIdentifier,
  updateFilesCopiedToOffsiteStagingDir: updateFilesCopiedToOffsiteStagingDir,
  updateFilesLoadedIntoVidarrArchival: updateFilesLoadedIntoVidarrArchival,
  updateFilesSentOffsite: updateFilesSentOffsite,
  updateFilesUnloaded: updateFilesUnloaded,
  streamAllCases: streamAllCases,
  getByFilesNotCopiedToOffsiteStagingDir:
    getByFilesNotCopiedToOffsiteStagingDir,
  getByFilesNotLoadedIntoVidarrArchival: getByFilesNotLoadedIntoVidarrArchival,
  getByFilesNotSentOffsite: getByFilesNotSentOffsite,
  getByFilesNotUnloaded: getByFilesNotUnloaded,
};
