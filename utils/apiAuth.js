'use strict';

const AuthenticationError = require('./controllerUtils').AuthenticationError;
const { handleErrors } = require('./controllerUtils');
const { db, pgp } = require('./dbUtils');
const logger = require('./logger').logger;

const qrec = pgp.errors.queryResultErrorCode;

const tokenColsCreate = new pgp.helpers.ColumnSet(['auth_token', 'username'], {
  table: 'token',
});

const addNewKey = async (req, res, next) => {
  try {
    //authenticate api-key from header before continuing
    let apiKey = req.header('X-API-KEY');
    const keyExists = await authenticateKey(apiKey);

    console.log('key in header good');

    const newKey = await genAPIKey(req.body.username);

    const returnKey = {
      'X-API-KEY': newKey.authToken,
    };
    return res.status(201).json(returnKey);
  } catch (e) {
    handleErrors(e, 'Error adding sign-off', logger, next);
  }
};

const genAPIKey = (user) => {
  //create a base-36 string that contains 30 chars in a-z,0-9
  const APItoken = [...Array(30)]
    .map((e) => ((Math.random() * 36) | 0).toString(36))
    .join('');

  console.log(APItoken);

  const tokenData = {
    auth_token: APItoken,
    username: user,
  };

  const tokenInsert = pgp.helpers.insert(tokenData, tokenColsCreate, 'token');

  const insertQuery = tokenInsert + ' RETURNING auth_token;';

  return new Promise((resolve, reject) => {
    db.one(insertQuery)
      .then((data) => {
        resolve(data);
      })
      .catch((err) => {
        reject(new Error(err));
      });
  });
};

const authenticateKey = (apiKey) => {
  const getQuery = getKeyQuery(apiKey);

  return new Promise((resolve, reject) => {
    db.one(getQuery)
      .then((data) => {
        resolve(data);
      })
      .catch((err) => standardCatch(err, reject));
  });
};

const standardCatch = (err, reject) => {
  if (err.code === qrec.noData) {
    reject(new AuthenticationError('Unable to authenticate submission'));
  } else {
    logger.log(err);
    reject(new Error(err));
  }
};

const getKeyQuery = (apiKey) => {
  let query = 'SELECT * FROM "token"';
  query = query + ' WHERE auth_token=\'' + apiKey + '\';';
  return query;
};

module.exports = {
  addNewKey: addNewKey,
  authenticateKey: authenticateKey,
};
