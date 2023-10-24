'use strict';

const { db, pgp, NotFoundError } = require('../../utils/dbUtils');
const logger = require('../../utils/logger').logger;
const queryStream = require('pg-query-stream');
const qrec = pgp.errors.queryResultErrorCode;

const id = 'id';
const created = 'created';
const caseIdentifier = 'case_identifier';
const username = 'username';
const qcPassed = 'qc_passed';
const signoffStepName = 'signoff_step_name';
const deliverableType = 'deliverable_type';

const signoffCols = [
  id,
  created,
  caseIdentifier,
  username,
  qcPassed,
  signoffStepName,
  deliverableType,
];

const signoffColsCreate = new pgp.helpers.ColumnSet(
  [caseIdentifier, username, qcPassed, signoffStepName, deliverableType],
  { table: 'signoff' }
);

const addSignoff = (signed) => {
  return new Promise((resolve, reject) => {
    db.task('add-signoffs', async (tx) => {
      const signoffData = {
        case_identifier: signed.caseIdentifier,
        username: signed.username,
        qc_passed: signed.qcPassed,
        signoff_step_name: signed.signoffStepName,
        deliverable_type: signed.deliverableType,
      };

      const signoffInsert = pgp.helpers.insert(
        signoffData,
        signoffColsCreate,
        'signoff'
      );
      //add const onConflict here ?
      const returning = ' RETURNING id';
      const signoffQuery = signoffInsert + returning;
    })
      .then(() => {
        resolve();
      })
      .catch((err) => {
        reject(new Error(err));
      });
  });
};

/*
const getCaseSignoffQuery => {
  var query = 'SELECT created, case_identifier, username, qc_passed, signoff_step_name, deliverable_type, comment FROM signoff ;
  query += ' WHERE case_identifier = $1';
  return query;
};
*/

const getCaseSignoffQuery = (id) => {
  let query =
    'SELECT created, case_identifier, username, qc_passed, signoff_step_name, deliverable_type, comment FROM signoff;';
  return query;
};

const getByCaseIdentifier = (caseIdentifier) => {
  const query = getCaseSignoffQuery(caseIdentifier);

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

const deleteSignoff = (signoffId) => {
  return new Promise((resolve, reject) => {
    const delete_stmt =
      'DELETE FROM signoff WHERE id=' + signoffId + ' RETURNING id';
    db.manyOrNone(delete_stmt, signoffId)
      .then((data) => {
        resolve(data);
      })
      .catch((err) => {
        if (err.code === qrec.noData) {
          // no matching id found
          resolve([]);
        } else {
          reject(new Error(err));
        }
      });
  });
};

module.exports = {
  addSignoff: addSignoff,
  getByCaseIdentifier: getByCaseIdentifier,
};
