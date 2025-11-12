'use strict';

const basesqlite3 = require('sqlite3');
const sqlite3 =
  (process.env.DEBUG || 'false') === 'true'
    ? basesqlite3.verbose()
    : basesqlite3;
const fpr = new sqlite3.Database(
  process.env.SQLITE_LOCATION + '/fpr.db',
  sqlite3.OPEN_READWRITE
);
// configure SQLite connection so that reading from and writing to are non-blocking
fpr.run('PRAGMA journal_mode = WAL;');

function generateError (statusCode, errorMessage) {
  const err = {
    status: statusCode,
    errors: [errorMessage],
  };
  return err;
}

// for SQLite
function getQuestionMarkPlaceholders (items) {
  return items.map(() => '?').join(', ');
}

function getQuotedPlaceholders (workflowNames) {
  return workflowNames
    .split(',')
    .map((wf) => '\'' + wf + '\'')
    .join(', ');
}

const listProjects = () => {
  return new Promise((resolve, reject) => {
    fpr.all(
      'SELECT DISTINCT project FROM fpr ORDER BY project ASC',
      [],
      (err, data) => {
        if (err) reject(err);
        resolve(data ? data.map((fpRecord) => fpRecord.project) : []);
      }
    );
  });
};

const listWorkflows = () => {
  return new Promise((resolve, reject) => {
    fpr.all(
      'SELECT DISTINCT workflow FROM fpr ORDER BY workflow ASC',
      [],
      (err, data) => {
        if (err) reject(err);
        resolve(data ? data.map((fpRecord) => fpRecord.workflow) : []);
      }
    );
  });
};

const getByProjects = (projects, workflows) => {
  let select = 'SELECT * FROM fpr';
  if (projects.length == 0 && (workflows == undefined || workflows == null))
    return Promise.resolve([]);
  else if (projects.length > 0)
    select =
      select +
      ' WHERE project IN (' +
      getQuestionMarkPlaceholders(projects) +
      ')' +
      (workflows == undefined || workflows == null
        ? ''
        : ' AND workflow IN (' + getQuotedPlaceholders(workflows) + ')');
  else
    select =
      select +
      (workflows == undefined || workflows == null
        ? ''
        : ' WHERE workflow IN (' + getQuotedPlaceholders(workflows) + ')');
  select = select + ';';
  return new Promise((resolve, reject) => {
    fpr.all(select, projects, (err, data) => {
      if (err) reject(err);
      resolve(data ? data : []);
    });
  });
};

const getByRun = (run) => {
  return new Promise((resolve, reject) => {
    const select =
      'SELECT * FROM fpr WHERE run = \'' +
      run +
      '\' AND workflow = \'BamQC\'' +
      ' ORDER BY fileswid ASC';
    fpr.all(select, (err, data) => {
      if (err) reject(err);
      resolve(data ? data : []);
    });
  });
};

const getByIds = (swids = [], fileids = []) => {
  let query = 'SELECT * FROM fpr ';
  let queryParts = [];
  let realValues = [];
  let buildQuery = (param, appendFn) => {
    if (param) {
      queryParts.push(appendFn());
      realValues.push(param);
    }
  };
  buildQuery(swids, () => {
    return ' fileswid IN (' + getQuestionMarkPlaceholders(swids) + ') ';
  });
  buildQuery(fileids, () => {
    return ' fileid IN (' + getQuestionMarkPlaceholders(fileids) + ') ';
  });
  const fullQuery =
    query + ' WHERE ' + queryParts.filter((a) => a).join(' OR ');
  return new Promise((resolve, reject) => {
    fpr.all(
      fullQuery,
      realValues.flatMap((a) => a),
      (err, data) => {
        if (err) reject(generateError(500, err));
        resolve(data ? data : []);
      }
    );
  });
};

const getMostRecentImportTime = () => {
  return new Promise((resolve, reject) => {
    fpr.get(
      'SELECT * FROM fpr_import_time ORDER BY lastimported DESC LIMIT 1',
      [],
      (err, data) => {
        if (err) reject(generateError(500, err));
        resolve(new Date(data.lastimported).getTime());
      }
    );
  });
};

module.exports = {
  getByProjects: getByProjects,
  getByRun: getByRun,
  getByIds: getByIds,
  listProjects: listProjects,
  listWorkflows: listWorkflows,
  getMostRecentImportTime: getMostRecentImportTime,
};
