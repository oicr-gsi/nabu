'use strict';

const dbConnectionString = `postgres://${process.env.DB_USER}:${process.env.DB_PW}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
const pgp = require('pg-promise')({});
const pg = pgp(dbConnectionString);
const queryStream = require('pg-query-stream');
const logger = require('../../utils/logger').logger;

function generateError (statusCode, errorMessage) {
  const err = {
    status: statusCode,
    errors: [errorMessage],
  };
  return err;
}

function getIndexedPlaceholders (items, offset = 0) {
  return items.map((item, index) => '$' + (index + offset + 1)).join(', ');
}

const fqcCols = new pgp.helpers.ColumnSet(
  [
    'filepath',
    'qcpassed',
    'username',
    'comment',
    'fileswid',
    'project',
    'md5sum',
  ],
  { table: 'fileqc' }
);

const streamAllFileQcs = (fn) => {
  const query = new queryStream(
    'SELECT fileQcId, qcDate, fileswid, project, filepath, CASE qcpassed WHEN TRUE THEN \'PASS\' WHEN FALSE THEN \'FAIL\' ELSE \'PENDING\' END AS qcpassed, username, COALESCE(comment, \'\') FROM FileQC WHERE deleted = FALSE'
  );
  return pg.stream(query, fn);
};

const addFileQc = (fileqcs) => {
  return new Promise((resolve, reject) => {
    pg.task('add-many', (tx) => {
      // wrapping in a transaction for error handling
      const insert = pgp.helpers.insert(fileqcs, fqcCols);
      return tx.none(insert);
    })
      .then(() => {
        return resolve(fileqcs);
      })
      .catch((err) => {
        reject(err);
      });
  });
};

const addFileQcs = (fileqcs) => {
  return new Promise((resolve, reject) => {
    pg.task('add-many', (tx) => {
      // wrapping in a transaction for error handling
      const insert = pgp.helpers.insert(fileqcs, fqcCols);
      return tx.none(insert);
    })
      .then(() => {
        return resolve(fileqcs);
      })
      .catch((err) => {
        reject({ errors: err });
      });
  });
};

const deleteFileQcs = (fileQcIds, username) => {
  const fqcPlaceholders = getIndexedPlaceholders(fileQcIds);
  return new Promise((resolve, reject) => {
    const delete_stmt = `UPDATE FileQC SET deleted = TRUE,
      comment = CONCAT(comment, '. Deleted by ${username} at ${new Date()}')
      WHERE fileqcid IN (${fqcPlaceholders}) RETURNING fileqcid`;
    pg.any(delete_stmt, fileQcIds)
      .then((data) => {
        data = data.map((d) => d.fileqcid);
        const undeleted = fileQcIds.filter((id) => data.indexOf(id) == -1);
        const yay = [];
        if (data.length) {
          yay.push(`Deleted FileQC(s) ${data.join(', ')}. `);
        }
        const nay = [];
        if (undeleted.length) {
          nay.push(`Failed to delete FileQC(s) ${undeleted.join(', ')}.`);
          pg.any(
            `SELECT fileqcid FROM FileQC WHERE fileqcid IN (${undeleted.join(
              ','
            )})`
          )
            .then((data) => {
              const notInDb = undeleted.filter((id) => !data.includes(id));
              if (notInDb.length) {
                nay.push(`FileQC ID(s) do not exist: ${notInDb.join(', ')}`);
              }
              return resolve({ success: yay, errors: nay });
            })
            .catch((err) => {
              logger.error({ error: err, method: 'deleteFqcs' });
              return resolve({ success: yay, errors: nay });
            });
        } else {
          return resolve({ success: yay, errors: nay });
        }
      })
      .catch((err) => {
        logger.error({ error: err, method: `deleteFqcs:${username}` });
        return reject(generateError(500, 'Failed to delete FileQC records'));
      });
  });
};

const getByProject = (projects) => {
  const select =
    'SELECT * FROM FileQC WHERE project IN (' +
    getIndexedPlaceholders(projects) +
    ')' +
    ' AND deleted = FALSE' +
    ' ORDER BY fileswid ASC';
  return new Promise((resolve, reject) => {
    pg.any(select, projects)
      .then((data) => {
        resolve({ fileqcs: data ? data : [], errors: [] });
      })
      .catch((err) => {
        logger.error({
          error: err,
          method: `getFqcResultsByProject:${projects}`,
        });
        reject(generateError(500, 'Error retrieving records'));
      });
  });
};

const getByProjectAndQcStatus = (projects, qcpassed) => {
  let select =
    'SELECT * FROM FileQC WHERE project IN (' +
    getIndexedPlaceholders(projects) +
    ')' +
    ' AND qcpassed ' +
    (qcpassed == null ? 'IS NULL' : '= $' + (projects.length + 1)) +
    ' ORDER BY fileswid ASC';
  return new Promise((resolve, reject) => {
    pg.any(select, projects.concat([qcpassed]))
      .then((data) => resolve(data))
      .catch((err) => reject(generateError(500, err)));
  });
};

const getBySwid = (swid) => {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM FileQc WHERE fileswid = $1 AND deleted = FALSE';
    pg.any(sql, [swid])
      .then((data) => {
        if (!data || data.length == 0) resolve({ fileqcs: [], errors: [] });
        if (Array.isArray(data)) {
          resolve({ fileqcs: data, errors: [] });
        }
        resolve({ fileqcs: [data], errors: [] });
      })
      .catch((err) => {
        logger.error({ error: err, method: `getFqcsBySwid: ${swid}` });
        reject(generateError(500, 'Error retrieving record'));
      });
  });
};

const getBySwids = (swids) => {
  return new Promise((resolve, reject) => {
    if (!swids.length) {
      resolve({ fileqcs: [], errors: [] });
    }
    const sql =
      'SELECT * FROM FileQC WHERE fileswid in (' +
      swids.join() +
      ')' +
      ' AND deleted = FALSE' +
      ' ORDER BY fileswid ASC';
    pg.any(sql)
      .then((data) => {
        resolve({ fileqcs: data ? data : [], errors: [] });
      })
      .catch((err) => {
        logger.error({ error: err, method: 'getFqcResultsBySwids' });
        reject(generateError(500, 'Error retrieving records'));
      });
  });
};

module.exports = {
  streamAllFileQcs: streamAllFileQcs,
  getByProject: getByProject,
  getByProjectAndQcStatus: getByProjectAndQcStatus,
  getBySwid: getBySwid,
  getBySwids: getBySwids,
  addFileQc: addFileQc,
  addFileQcs: addFileQcs,
  deleteFileQcs: deleteFileQcs,
};
