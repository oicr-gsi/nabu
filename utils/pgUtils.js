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

console.log(pgPackage.helpers);

function getIndexedPlaceholders (items, offset = 0) {
  return items.map((item, index) => '$' + (index + offset + 1)).join(', ');
}

module.exports = {
  db: pg,
  pgPkg: pgPackage,
  getIndexedPlaceholders: getIndexedPlaceholders,
};
