'use strict';

const dbUtils = require('../../utils/pgUtils');
const db = dbUtils.db;
const pgp = dbUtils.pgPkg;

const caseCols = new pgp.helpers.ColumnSet(
  ['id', 'case_identifier', 'requisition_id', 'lims_ids'],
  { table: 'cardea_case' }
);

const archiveCols = new pgp.helpers.ColumnSet(
  [
    'id',
    'created',
    'modified',
    'case_id',
    'commvault_backup_job_id',
    'workflow_run_ids_for_offsite_archive',
    'unload_file_for_offsite',
    'files_moved_to_offsite_dir',
    'files_loaded_into_vidarr_archival',
    'workflow_run_ids_for_vidarr_archival',
    'unload_file_for_vidarr_archival',
    'case_files_unloaded',
  ],
  { table: 'archive' }
);

const addCase = (cardeaCase) => {
  return new Promise((resolve, reject) => {
    db.task('add-case', (tx) => {
      let query =
        pgp.helpers.insert(cardeaCase, caseCols) +
        ' ON CONFLICT (case_identifier) DO UPDATE SET ' +
        caseCols.assignColumns({
          from: 'EXCLUDED',
          skip: ['case_identifier'],
        });
      return tx.none(query);
    })
      .then((data) => {
        return resolve(data);
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
    db.one(query, caseIdentifier)
      .then((data) => {
        resolve(data);
      })
      .catch((err) => {
        reject(new Error(err));
      });
  });
};

module.exports = {
  addCase: addCase,
  getByCaseIdentifier: getByCaseIdentifier,
};
