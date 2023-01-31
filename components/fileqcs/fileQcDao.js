'use strict';

const pgp = require('pg-promise')({});
const connectionConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PW,
};
const pg = pgp(connectionConfig);
const queryStream = require('pg-query-stream');
const logger = require('../../utils/logger').logger;

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
    'workflow',
  ],
  { table: 'fileqc' }
);
const deletionCols = new pgp.helpers.ColumnSet(['fileid', 'username'], {
  table: 'deletionlog',
});

const streamAllFileQcs = (fn) => {
  const query = new queryStream(
    'SELECT fileqcid, qcDate, fileid, fileswid, project, workflow, filepath, qcpassed, username, comment FROM FileQC'
  );
  return pg.stream(query, fn);
};

const addFileQcs = (fileqcs) => {
  return new Promise((resolve, reject) => {
    pg.task('add-many', (tx) => {
      let query =
        pgp.helpers.insert(fileqcs, fqcCols) +
        ' ON CONFLICT (fileid) DO UPDATE SET ' +
        fqcCols.assignColumns({
          from: 'EXCLUDED',
          skip: ['fileid', 'project'],
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

const getFileQcs = (projects, workflow, qcStatus, fileids, swids) => {
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
    if (qcStatus === null) {
      return ' qcpassed IS NULL ';
    }
    if (qcStatus !== true && qcStatus !== false)
      throw new Error('qcStatus is invalid');
    return ' qcpassed IS ' + getIndexedPlaceholders([qcStatus], offset) + ' ';
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
  buildQuery(workflow, (nonNullWorkflow) => {
    return (
      ' workflow = ' + getIndexedPlaceholders([nonNullWorkflow], offset) + ''
    );
  });
  const fullQuery =
    query + ' WHERE ' + queryParts.filter((a) => a).join(' AND ');
  if (realValues.length == 0) {
    // no data requested, no data returned
    return Promise.resolve([]);
  }

  return new Promise((resolve, reject) => {
    pg.any(
      fullQuery,
      realValues.flatMap((a) => a)
    )
      .then((data) => {
        resolve(data);
      })
      .catch((err) => {
        reject(new Error(err));
      });
  });
};

const logDeletion = (fileIds, username) => {
  const deletionLogObjects = fileIds.map((p) => {
    return { fileid: p, username: username };
  });
  const deletionQuery = pgp.helpers.insert(deletionLogObjects, deletionCols);
  pg.none(deletionQuery);
};

const deleteFileQcs = (fileIds, username) => {
  const fileIdPlaceholders = getIndexedPlaceholders(fileIds);
  return new Promise((resolve, reject) => {
    const delete_stmt = `DELETE FROM FileQC WHERE fileid IN (${fileIdPlaceholders}) RETURNING fileid`;
    pg.any(delete_stmt, fileIds)
      .then((data) => {
        data = data.map((d) => d.fileid);
        const undeleted = fileIds.filter((id) => data.indexOf(id) == -1);
        const yay = [];
        if (data.length) {
          yay.push(`Deleted: ${data.length}. `);
          if (data.length == fileIds.length) {
            logDeletion(data, username);
            return resolve({ success: yay, errors: [] });
          }
        }
        const nay = [];
        if (undeleted.length) {
          nay.push(`Not deleted: ${undeleted.join(', ')}. `);
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
              logger.error({ error: err, method: 'deleteFileQcs' });
              reject(new Error(err));
            });
        } else {
          return resolve({ success: yay, errors: nay });
        }
      })
      .catch((err) => {
        logger.error({ error: err, method: `deleteFqcs:${username}` });
        reject(new Error(err));
      });
  });
};

module.exports = {
  streamAllFileQcs: streamAllFileQcs,
  getFileQcs: getFileQcs,
  addFileQcs: addFileQcs,
  deleteFileQcs: deleteFileQcs,
};
