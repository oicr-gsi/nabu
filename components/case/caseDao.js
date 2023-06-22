'use strict';

const pgp = require('pg-promise');
const connectionConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PW,
};
const pgOptions = {
  receive: (e) => {
    camelizeColumns(e.data);
  },
};
const camelizeColumns = (data) => {
  const template = data[0];
  for (let prop in template) {
    const camel = pgp.utils.camelize(prop);
    if (!(camel in template)) {
      for (let i = 0; i < data.length; i++) {
        let d = data[i];
        d[camel] = d[prop];
        delete d[prop];
      }
    }
  }
};
const pgPackage = pgp(pgOptions);
const pg = pgPackage(connectionConfig);

const caseCols = new pgPackage.helpers.ColumnSet(
  ['id', 'case_identifier', 'requisition_id', 'lims_ids'],
  { table: 'cardea_case' }
);

const addCase = (cardeaCase) => {
  return new Promise((resolve, reject) => {
    pg.task('add-case', (tx) => {
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

const getByCaseIdentifier = (caseIdentifier) => {
  let query = 'SELECT * FROM cardea_case WHERE case_identifier = $1';
  return new Promise((resolve, reject) => {
    pg.one(query, caseIdentifier)
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
