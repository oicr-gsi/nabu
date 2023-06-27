'use strict';

const dbUtils = require('../../utils/pgUtils');
const db = dbUtils.db;
const pgp = dbUtils.pgPkg;
const qrec = pgp.errors.queryResultErrorCode;
const NotFoundError = dbUtils.NotFoundError;

const id = 'id';
const created = 'created';
const modified = 'modified';
const caseId = 'case_id';
const caseIdentifier = 'case_identifier';
const reqId = 'requisition_id';
const limsIds = 'lims_ids';
const wfrIdsForOffsite = 'workflow_run_ids_for_offsite_archive';
const unloadFileForOffsite = 'unload_file_for_offsite';
const filesMovedToOffsiteStagingDir = 'files_moved_to_offsite_dir';
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
  filesMovedToOffsiteStagingDir,
  commvaultJobId,
  wfrIdsForVidarrArchival,
  unloadFileForVidarrArchival,
  filesLoadedIntoVidarrArchival,
  caseFilesUnloaded,
];

const caseColsGet = new pgp.helpers.ColumnSet(caseCols, {
  table: 'cardea_case',
});
const caseColsCreate = new pgp.helpers.ColumnSet(
  [caseIdentifier, reqId, limsIds],
  { table: 'cardea_case' }
);
const archiveColsGet = new pgp.helpers.ColumnSet(archiveCols, {
  table: 'archive',
});
const archiveColsCreate = [caseId, wfrIdsForOffsite, wfrIdsForVidarrArchival];
const archiveColsCopyToOffsiteStagingDir = [
  caseId,
  unloadFileForOffsite,
  filesMovedToOffsiteStagingDir,
];
const archiveColsBackupComplete = [caseId, commvaultJobId];
const archiveColsLoadIntoVidarrArchival = [
  caseId,
  unloadFileForVidarrArchival,
  filesLoadedIntoVidarrArchival,
];
const archiveColsCaseFilesUnloaded = [caseId, caseFilesUnloaded];

const addCases = (cases) => {
  return new Promise((resolve, reject) => {
    let cardeaCases = Array.isArray(cases) ? cases : [cases];
    db.task('add-cases', async (tx) => {
      for (let c of cardeaCases) {
        const caseData = {
          case_identifier: c.caseIdentifier,
          requisition_id: c.requisitionId,
          lims_ids: c.limsIds,
        };

        const caseQuery =
          pgp.helpers.insert(caseData, caseColsCreate, 'cardea_case') +
          ' RETURNING id';
        await tx.one(caseQuery).then(async (data) => {
          const archiveData = {
            case_id: data.id,
            workflow_run_ids_for_offsite_archive:
              c.workflowRunIdsForOffsiteArchive,
            workflow_run_ids_for_vidarr_archival:
              c.workflowRunIdsForVidarrArchival,
          };

          const archiveQuery = pgp.helpers.insert(
            archiveData,
            archiveColsCreate,
            'archive'
          );
          await tx.none(archiveQuery);
          return;
        });
      }
    })
      .then(() => {
        resolve();
      })
      .catch((err) => {
        reject(new Error(err));
      });
  });
};

const allCaseArchiveDataQuery =
  'SELECT c.id, c.case_identifier, c.requisition_id, c.lims_ids, a.created, a.modified, a.workflow_run_ids_for_offsite_archive, a.unload_file_for_offsite_archive, a.files_moved_to_offsite_archive_staging_dir, a.commvault_backup_job_id, a.workflow_run_ids_for_vidarr_archival, a.unload_file_for_vidarr_archival, a.files_loaded_into_vidarr_archival, a.case_files_unloaded FROM cardea_case c JOIN archive a ON c.id = a.case_id';

const getByCaseIdentifier = (caseIdentifier) => {
  let query = allCaseArchiveDataQuery + ' WHERE case_identifier = $1';
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

module.exports = {
  addCases: addCases,
  getByCaseIdentifier: getByCaseIdentifier,
};
