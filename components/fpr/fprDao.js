'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const isDebug = (process.env.DEBUG || 'false') === 'true';
const fpr = new Database(path.join(process.env.SQLITE_LOCATION, 'fpr.db'), {
  verbose: isDebug ? console.log : null,
  fileMustExist: true, // Ensures it's OPEN_READWRITE
});
fpr.pragma('journal_mode = WAL'); // configure connection so that reading from and writing to are non-blocking

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

const listProjects = async () => {
  const data = fpr
    .prepare('SELECT DISTINCT project FROM fpr ORDER BY project ASC')
    .all();
  return data.map((fpRecord) => fpRecord.project);
};

const listWorkflows = async () => {
  const data = fpr
    .prepare('SELECT DISTINCT workflow FROM fpr ORDER BY workflow ASC')
    .all();
  return data.map((fpRecord) => fpRecord.workflow);
};

const getByProjects = async (projects, workflows) => {
  let select = 'SELECT * FROM fpr';
  let params = [...projects];

  if (projects.length == 0 && (workflows == undefined || workflows == null))
    return [];
  else if (projects.length > 0)
    select =
      select +
      ' WHERE project IN (' +
      getQuestionMarkPlaceholders(projects) +
      ')' +
      (workflows == undefined || workflows == null
        ? ''
        : ' AND workflow IN (' +
          getQuestionMarkPlaceholders(workflows.split(',')) +
          ')');
  else
    select =
      select +
      (workflows == undefined || workflows == null
        ? ''
        : ' WHERE workflow IN (' +
          getQuestionMarkPlaceholders(workflows.split(',')) +
          ')');

  select = select + ';';

  if (workflows) {
    params.push(...workflows.split(','));
  }

  return fpr.prepare(select).all(params);
};

const getByRun = async (run) => {
  const select =
    'SELECT * FROM fpr WHERE run = ? AND workflow = "BamQC" ORDER BY fileswid ASC';
  return fpr.prepare(select).all(run);
};

const getByIds = async (swids = [], fileids = []) => {
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
  try {
    const data = fpr.prepare(fullQuery).all(realValues.flatMap((a) => a));
    return data;
  } catch (err) {
    throw generateError(500, err);
  }
};

const getMostRecentImportTime = async () => {
  try {
    const data = fpr
      .prepare(
        'SELECT * FROM fpr_import_time ORDER BY lastimported DESC LIMIT 1'
      )
      .get();
    return new Date(data.lastimported).getTime();
  } catch (err) {
    throw generateError(500, err);
  }
};

module.exports = {
  getByProjects: getByProjects,
  getByRun: getByRun,
  getByIds: getByIds,
  listProjects: listProjects,
  listWorkflows: listWorkflows,
  getMostRecentImportTime: getMostRecentImportTime,
};
