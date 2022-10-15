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
    'fileid',
    'project',
    'md5sum',
  ],
  { table: 'fileqc' }
);

const streamAllFileQcs = (fn) => {
  const query = new queryStream(
    'SELECT fileQcId, qcDate, fileid, fileswid, project, filepath, CASE qcpassed WHEN TRUE THEN \'PASS\' WHEN FALSE THEN \'FAIL\' ELSE \'PENDING\' END AS qcpassed, username, COALESCE(comment, \'\') FROM FileQC WHERE deleted = FALSE'
  );
  return pg.stream(query, fn);
};

const addFileQcs = (fileqcs) => {
  return new Promise((resolve, reject) => {
    pg.task('add-many', (tx) => {
      // wrapping in a transaction for error handling
      let fileids = fileqcs.map(f => f.fileid)

// console.log("before add to db")
// pg.any("select * from fileqc where fileid in " + getIndexedPlaceholders(fileids), fileids)
//  .then(data => {console.log("selcet before insert"); console.log(data)});
// console.log("here's what should be added to the database:")
//console.log(fileqcs)
//console.log("adding it to the database")

      let query = pgp.helpers.insert(fileqcs, fqcCols) +
      ' ON CONFLICT (fileid) DO UPDATE SET ' +
      fqcCols.assignColumns({from: 'EXCLUDED', skip: ['fileid', 'project', 'fileswid']});
      //const insert = pgp.helpers.insert(fileqcs, fqcCols);

      console.log(query)
      return tx.none(query);
      console.log("done querying")
      //return tx.any("select * from fileqc where fileid in " + getIndexedPlaceholders(fileids), fileids);
    })
    .then(data => {
      return resolve(data);
    })
    .catch((err) => {
      console.log(err)
      throw new Error(err);
    });
  });
};

const deleteFileQcs = (fileQcIds, username) => {
  const fqcPlaceholders = getIndexedPlaceholders(fileQcIds);
  return new Promise((resolve, reject) => {
    const delete_stmt = `DELETE FROM FileQC WHERE fileqcid IN (${fqcPlaceholders}) RETURNING fileqcid`;
    pg.any(delete_stmt, fileQcIds)
      .then((data) => {
        data = data.map((d) => d.fileqcid);
        const undeleted = fileQcIds.filter((id) => data.indexOf(id) == -1);
        const yay = [];
        if (data.length) {
          yay.push(`Deleted: ${data.join(', ')}. `);
        }
        const nay = [];
        if (undeleted.length) {
          nay.push(`Not deleted: ${undeleted.join(', ')}.`);
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
              throw new Error(err);
            });
        } else {
          return resolve({ success: yay, errors: nay });
        }
      })
      .catch((err) => {
        logger.error({ error: err, method: `deleteFqcs:${username}` });
        throw new Error(err);
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
    .catch((err) => {
      throw new Error(err)
    });
  });
};
module.exports = {
  streamAllFileQcs: streamAllFileQcs,
  getFileQcs: get,
  addFileQcs: addFileQcs,
  deleteFileQcs: deleteFileQcs,
};
