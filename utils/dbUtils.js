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

function getIndexedPlaceholders (items, offset = 0) {
  return items.map((item, index) => '$' + (index + offset + 1)).join(', ');
}

/** set up custom error if data is not found */
class NotFoundError extends Error {
  constructor (message = '', ...args) {
    super(message, ...args);
    this.name = 'NotFoundError';
    this.message = message || '';
  }
}

module.exports = {
  db: pg,
  pgp: pgPackage,
  getIndexedPlaceholders: getIndexedPlaceholders,
  NotFoundError: NotFoundError,
};
