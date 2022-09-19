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

const addFileQcs = (fileqcs) => {
  return new Promise((resolve, reject) => {
    pg.task('add-many', (tx) => {
      // wrapping in a transaction for error handling
 let fileids = fileqcs.map(f => f.fileid)
 console.log("before add to db")
 pg.any("select * from fileqc where fileid in " + getIndexedPlaceholders(fileids), fileids)
  .then(data => {console.log("selcet before insert"); console.log(data)});
 console.log("here's what should be added to the database:")
console.log(fileqcs)
console.log("adding it to the database")
      let query = pgp.helpers.insert(fileqcs, fqcCols) + ' ON CONFLICT ON CONSTRAINT '
      const insert = pgp.helpers.insert(fileqcs, fqcCols);
      return tx.none(insert);
    })
      .then(() => {
 let fileids = fileqcs.map(f => f.fileid)
 console.log("AFTER add to db")
 pg.any("select * from fileqc where fileid in " + getIndexedPlaceholders(fileids), fileids)
  .then(data => {console.log("select after insert"); console.log(data)});
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

const get = (projects, qcStatus, workflow, fileids, swids) => {
  let offset = 0;
  let query = 'SELECT * FROM fileqc ';
  let queryParts = [];
  let realValues = [];
  let buildQuery = (param, appendFn) => {
    // don't run if param is falsey
    if (Array.isArray(param)) {
      if (param.length > 0) {
        // only operate on non-null array members
        let nonNull = param.filter((p) => p);
        if (nonNull.length == 0) return;

        queryParts.push(appendFn(nonNull));
        nonNull.forEach((p) => realValues.push(p));
        offset += nonNull.length;
      }
    } else if (param) {
      queryParts.push(appendFn());
      realValues.push(param);
      offset += 1;
    }
    // do nothing if param isn't really present
  };
  buildQuery(projects, (nonNullProjects) => {
    return (
      ' project IN (' + getIndexedPlaceholders(nonNullProjects, offset) + ') '
    );
  });
  buildQuery(qcStatus, () => {
    return ' qcStatus == \'' + getIndexedPlaceholders([qcStatus], offset) + '\' ';
  });
  buildQuery(workflow, () => {
    return ' workflow == \'' + getIndexedPlaceholders([workflow], offset) + '\' ';
  });
  buildQuery(fileids, (nonNullFileIds) => {
    return (
      ' fileid IN (' + getIndexedPlaceholders(nonNullFileIds, offset) + ') '
    );
  });
  buildQuery(swids, (nonNullFileSwids) => {
    return (
      ' fileswid IN (' + getIndexedPlaceholders(nonNullFileSwids, offset) + ') '
    );
  });
  const fullQuery =
    query + ' WHERE ' + queryParts.filter((a) => a).join(' AND ');
console.log("full query: " + fullQuery)
  if (realValues.length == 0) {
    // no data requested, no data returned
    return Promise.resolve([]);
  }

  return new Promise((resolve, reject) => {
    pg.any(
      fullQuery,
      realValues.flatMap((a) => a)
    )
      //.then((data) => resolve(data))
      .then((data) => {console.log(" get results from db: "); console.log(data); resolve(data);})
      .catch((err) => reject(generateError(500, err)));
  });
};
module.exports = {
  streamAllFileQcs: streamAllFileQcs,
  getFileQcs: get,
  addFileQcs: addFileQcs,
  deleteFileQcs: deleteFileQcs,
};
