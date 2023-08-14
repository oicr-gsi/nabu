'use strict';

const { db, pgp, NotFoundError } = require('../../utils/dbUtils');
const logger = require('../../utils/logger').logger;
const queryStream = require('pg-query-stream');
const qrec = pgp.errors.queryResultErrorCode;

const id = 'id';
const created = 'created';
const modified = 'modified';
const caseId = 'case_id';
const caseIdentifier = 'case_identifier';
const reqId = 'requisition_id';
const limsIds = 'lims_ids';
const wfrIdsForOffsite = 'workflow_run_ids_for_offsite_archive';
const unloadFileForOffsite = 'unload_file_for_offsite';
const filesCopiedToOffsiteStagingDir = 'files_copied_to_offsite_dir';
const commvaultJobId = 'commvault_backup_job_id';
const wfrIdsForVidarrArchival = 'workflow_run_ids_for_vidarr_archival';
const unloadFileForVidarrArchival = 'unload_file_for_vidarr_archival';
const filesLoadedIntoVidarrArchival = 'files_loaded_into_vidarr_archival';
const caseFilesUnloaded = 'case_files_unloaded';

const caseCols = [id, caseIdentifier, reqId, limsIds];
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
  [caseIdentifier, reqId, limsIds],
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

const addCase = (kase) => {
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
          skip: [caseIdentifier, reqId],
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

const caseArchiveDataQueryWithoutUnloadFiles =
  'SELECT c.case_identifier, c.requisition_id, c.lims_ids, a.created, a.modified, a.workflow_run_ids_for_offsite_archive, a.files_copied_to_offsite_archive_staging_dir, a.commvault_backup_job_id, a.workflow_run_ids_for_vidarr_archival, a.files_loaded_into_vidarr_archival, a.case_files_unloaded FROM cardea_case c JOIN archive a ON c.id = a.case_id';
const caseArchiveDataQueryWithUnloadFiles =
  'SELECT c.case_identifier, c.requisition_id, c.lims_ids, a.created, a.modified, a.workflow_run_ids_for_offsite_archive, a.unload_file_for_offsite_archive, a.files_copied_to_offsite_archive_staging_dir, a.commvault_backup_job_id, a.workflow_run_ids_for_vidarr_archival, a.unload_file_for_vidarr_archival, a.files_loaded_into_vidarr_archival, a.case_files_unloaded FROM cardea_case c JOIN archive a ON c.id = a.case_id';

const getCaseArchiveQuery = (includeUnloadFiles = false) => {
  let query;
  if (includeUnloadFiles) {
    query = caseArchiveDataQueryWithUnloadFiles;
  } else {
    query = caseArchiveDataQueryWithoutUnloadFiles;
  }
  query += ' WHERE case_identifier = $1';
  return query;
};

const getByCaseIdentifier = (caseIdentifier, includeUnloadFiles = false) => {
  const query = getCaseArchiveQuery(includeUnloadFiles);
  return new Promise((resolve, reject) => {
    db.oneOrNone(query, caseIdentifier)
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
const getCaseArchiveData = (
  caseIdentifier,
  includeUnloadFiles = false,
  resolve,
  reject
) => {
  const query = getCaseArchiveQuery(includeUnloadFiles);
  db.one(query, caseIdentifier)
    .then((data) => {
      resolve(data);
    })
    .catch((err) => standardCatch(err, reject));
};

const filesCopiedToStagingDirQuery =
  'UPDATE archive SET files_copied_to_offsite_archive_staging_dir = NOW(), unload_file_for_offsite_archive = $1 WHERE case_id = (SELECT id FROM cardea_case WHERE case_identifier = $2)';

const updateFilesCopiedToOffsiteStagingDir = (caseIdentifier, unloadFile) => {
  return new Promise((resolve, reject) => {
    db.none(filesCopiedToStagingDirQuery, [unloadFile, caseIdentifier])
      .then(() => {
        getCaseArchiveData(caseIdentifier, false, resolve, reject);
      })
      .catch((err) => standardCatch(err, reject));
  });
};

const filesLoadedIntoVidarrArchivalQuery =
  'UPDATE archive SET files_loaded_into_vidarr_archival = NOW(), unload_file_for_vidarr_archival = $1 WHERE case_id = (SELECT id FROM cardea_case WHERE case_identifier = $2)';

const updateFilesLoadedIntoVidarrArchival = (caseIdentifier, unloadFile) => {
  return new Promise((resolve, reject) => {
    db.none(filesLoadedIntoVidarrArchivalQuery, [unloadFile, caseIdentifier])
      .then(() => {
        getCaseArchiveData(caseIdentifier, false, resolve, reject);
      })
      .catch((err) => standardCatch(err, reject));
  });
};

const filesSentOffsiteQuery =
  'UPDATE archive SET commvault_backup_job_id = $1 WHERE case_id = (SELECT id FROM cardea_case WHERE case_identifier = $2)';

const updateFilesSentOffsite = (caseIdentifier, commvaultBackupJobId) => {
  return new Promise((resolve, reject) => {
    db.none(filesSentOffsiteQuery, [commvaultBackupJobId, caseIdentifier])
      .then(() => {
        getCaseArchiveData(caseIdentifier, false, resolve, reject);
      })
      .catch((err) => standardCatch(err, reject));
  });
};

const filesUnloadedQuery =
  'UPDATE archive SET case_files_unloaded = NOW() WHERE case_id = (SELECT id FROM cardea_case WHERE case_identifier = $1)';

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
  getByCaseIdentifier: getByCaseIdentifier,
  updateFilesCopiedToOffsiteStagingDir: updateFilesCopiedToOffsiteStagingDir,
  updateFilesLoadedIntoVidarrArchival: updateFilesLoadedIntoVidarrArchival,
  updateFilesSentOffsite: updateFilesSentOffsite,
  updateFilesUnloaded: updateFilesUnloaded,
  streamAllCases: streamAllCases,
};
