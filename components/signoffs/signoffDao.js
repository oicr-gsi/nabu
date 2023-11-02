'use strict';

const { ValidationError } = require('../../utils/controllerUtils');
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
const comment = 'comment';

const signoffCols = [
  id,
  created,
  caseIdentifier,
  username,
  qcPassed,
  signoffStepName,
  deliverableType,
  comment,
];

const signoffColsCreate = new pgp.helpers.ColumnSet(
  [
    caseIdentifier,
    username,
    qcPassed,
    signoffStepName,
    deliverableType,
    comment,
  ],
  { table: 'signoff' }
);

const addSignoff = (caseId, signed, oldSignoffId = null) => {
  return new Promise((resolve, reject) => {
    const signoffData = {
      case_identifier: caseId,
      username: signed.username,
      qc_passed: signed.qcPassed,
      signoff_step_name: signed.signoffStepName,
      deliverable_type: signed.deliverableType,
      comment: signed.comment,
    };

    const signoffInsert = pgp.helpers.insert(
      signoffData,
      signoffColsCreate,
      'signoff'
    );

    const signoffDelete = 'DELETE FROM signoff WHERE id=' + oldSignoffId + ';';

    const signoffQuery = signoffInsert + ' RETURNING *';

    // delete matching sign-off if already exists
    // create new sign-off
    db.tx('delete-and-add', (tx) => {
      return tx
        .oneOrNone(signoffDelete)
        .then((gone) => {
          tx.one(signoffQuery)
            .then((data) => {
              return resolve(data);
            })
            .catch((err) => {
              reject(new Error(err));
            });
        })
        .catch((err) => {
          reject(new Error(err));
        });
    });
  });
};

const addBatchSignoffs = (caseIds, signed, oldSignoffIds = []) => {};

const getCaseSignoffQueryById = (id) => {
  let query = 'SELECT * FROM "signoff"';
  query = query + ' WHERE case_identifier=\'' + id + '\';';
  return query;
};

const getCaseSignoffQueryByConstraint = (
  id,
  signoffStepName,
  deliverableType
) => {
  let query = 'SELECT * FROM "signoff"';
  query =
    query +
    ' WHERE case_identifier=\'' +
    id +
    '\' AND' +
    ' signoff_step_name=\'' +
    signoffStepName +
    '\' AND' +
    ' deliverable_type=\'' +
    deliverableType +
    '\';';
  return query;
};

const getByCaseIdentifier = (caseIdentifier) => {
  const query = getCaseSignoffQueryById(caseIdentifier);

  return new Promise((resolve, reject) => {
    db.any(query)
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

const getByCaseConstraint = (
  caseIdentifier,
  signoffStepName,
  deliverableType
) => {
  const query = getCaseSignoffQueryByConstraint(
    caseIdentifier,
    signoffStepName,
    deliverableType
  );

  return new Promise((resolve, reject) => {
    db.any(query)
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
  addSignoff: addSignoff,
  getByCaseIdentifier: getByCaseIdentifier,
  getByCaseConstraint: getByCaseConstraint,
  addBatchSignoffs: addBatchSignoffs,
};
