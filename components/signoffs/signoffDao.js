'use strict';

const { db, pgp } = require('../../utils/dbUtils');
const qrec = pgp.errors.queryResultErrorCode;

const id = 'id';
const created = 'created';
const caseIdentifier = 'case_identifier';
const username = 'username';
const qcPassed = 'qc_passed';
const signoffStepName = 'signoff_step_name';
const deliverableType = 'deliverable_type';
const deliverable = 'deliverable';
const comment = 'comment';
const release = 'release';

const signoffColsCreate = new pgp.helpers.ColumnSet(
  [
    caseIdentifier,
    username,
    qcPassed,
    signoffStepName,
    deliverableType,
    deliverable,
    comment,
    release,
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
      deliverable: signed.deliverable,
      comment: signed.comment,
      release: signed.release,
    };

    const signoffInsert = pgp.helpers.insert(
      signoffData,
      signoffColsCreate,
      'signoff'
    );

    const signoffQuery = signoffInsert + ' RETURNING *;';

    // create new sign-off
    db.one(signoffQuery)
      .then((data) => {
        return resolve(data);
      })
      .catch((err) => {
        reject(new Error(err));
      });
  });
};

const getCaseSignoffQueryById = (id) => {
  let query =
    'SELECT DISTINCT ON (case_identifier, signoff_step_name, deliverable_type, deliverable) * FROM "signoff"';
  query =
    query +
    ' WHERE case_identifier=\'' +
    id +
    '\'' +
    ' ORDER BY case_identifier, signoff_step_name, deliverable_type, deliverable, created DESC;';
  return query;
};

const getCaseSignoffQueryByConstraint = (
  id,
  signoffStepName,
  deliverableType,
  deliverable
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
    '\' AND ' +
    (deliverable ? `deliverable='${deliverable}'` : 'deliverable IS NULL');
  query = query + ' ORDER BY created DESC LIMIT 1;';
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

const getSignoffs = () => {
  const query =
    'SELECT DISTINCT ON (case_identifier, signoff_step_name, deliverable_type, deliverable) * FROM "signoff"' +
    ' ORDER BY case_identifier, signoff_step_name, deliverable_type, deliverable, created DESC;';
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
  deliverableType,
  deliverable
) => {
  const query = getCaseSignoffQueryByConstraint(
    caseIdentifier,
    signoffStepName,
    deliverableType,
    deliverable
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
  getSignoffs: getSignoffs,
  getByCaseIdentifier: getByCaseIdentifier,
  getByCaseConstraint: getByCaseConstraint,
};
