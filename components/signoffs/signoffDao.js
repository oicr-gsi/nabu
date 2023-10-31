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

const addSignoff = (signed) => {
  return new Promise((resolve, reject) => {
    const signoffData = {
      case_identifier: signed.caseIdentifier,
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

    const signoffColsCreateExtended = signoffColsCreate.extend([created]);

    const onConflict =
      ' ON CONFLICT(case_identifier, signoff_step_name, deliverable_type)' +
      ' DO UPDATE SET ' +
      signoffColsCreateExtended.assignColumns({
        from: 'EXCLUDED',
        skip: [caseIdentifier, signoffStepName, deliverableType],
      });

    const returning = ' RETURNING *';
    const signoffQuery = signoffInsert + onConflict + returning;

    return db
      .one(signoffQuery)
      .then((data) => {
        resolve(data);
      })
      .catch((err) => {
        reject(new Error(err));
      });
  });
};

const getCaseSignoffQuery = (id) => {
  let query = 'SELECT * FROM "signoff"';
  query = query + ' WHERE case_identifier=\'' + id + '\';';
  return query;
};

const getByCaseIdentifier = (caseIdentifier) => {
  const query = getCaseSignoffQuery(caseIdentifier);

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
};
