'use strict';

const AuthenticationError = require('./controllerUtils').AuthenticationError;
const { handleErrors } = require('./controllerUtils');
const { db, pgp } = require('./dbUtils');
const logger = require('./logger').logger;
const crypto = require('crypto');
const { Buffer } = require('buffer');

const qrec = pgp.errors.queryResultErrorCode;

const tokenColsCreate = new pgp.helpers.ColumnSet(
  ['auth_token', 'auth_id', 'username'],
  {
    table: 'token',
  }
);

const addNewKey = async (req, res, next) => {
  try {
    let empty = await checkIfEmpty();

    //if no keys are in the database add one without authenticating
    if (!empty) {
      //authenticate api-key from header before continuing
      let apiKey = req.header('X-API-KEY');
      const keyExists = await authenticateKey(apiKey);
    }

    const newKey = await genAPIKey(req.body.username);

    const returnKey = {
      'X-API-KEY': newKey,
    };
    return res.status(201).json(returnKey);
  } catch (e) {
    handleErrors(e, 'Error adding sign-off', logger, next);
  }
};

const genAPIKey = async (user) => {
  //create a base-36 string that contains 30 chars in a-z,0-9
  const APIstring = [...Array(30)]
    .map((e) => ((Math.random() * 36) | 0).toString(36))
    .join('');

  const APIident = [...Array(30)]
    .map((e) => ((Math.random() * 36) | 0).toString(36))
    .join('');

  const APItoken = await hash(APIstring);

  const tokenData = {
    auth_token: APItoken,
    auth_id: APIident,
    username: user,
  };

  const tokenInsert = pgp.helpers.insert(tokenData, tokenColsCreate, 'token');

  const insertQuery = tokenInsert + ';';

  return new Promise((resolve, reject) => {
    db.none(insertQuery)
      .then(() => {
        resolve(APIident + '-' + APIstring);
      })
      .catch((err) => {
        reject(new Error(err));
      });
  });
};

const authenticateKey = async (apiKey) => {
  try {
    const [identifier, token] = apiKey.split('-');
    const getQuery = getKeyQuery(identifier);

    return new Promise((resolve, reject) => {
      db.one(getQuery)
        .then((hashKey) => {
          verifyHash(token, hashKey).then((matches) => {
            if (matches) {
              resolve(); //return nothing
            } else {
              reject(
                new AuthenticationError('Unable to authenticate submission')
              );
            }
          });
        })
        .catch((err) => standardCatch(err, reject));
    });
  } catch (e) {
    throw new AuthenticationError('Unable to authenticate submission');
  }
};

const checkIfEmpty = () => {
  return new Promise((resolve, reject) => {
    db.one('SELECT COUNT(*) FROM "token";')
      .then((count) => {
        resolve(count == 0);
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

const getKeyQuery = (apiIdent) => {
  let query = 'SELECT auth_token FROM "token"';
  query = query + ' WHERE auth_id=\'' + apiIdent + '\';';
  return query;
};

const hash = async (apikey) => {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(8).toString('hex');

    crypto.scrypt(apikey, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(salt + ':' + derivedKey.toString('hex'));
    });
  });
};

const verifyHash = async (apikey, apikeyHash) => {
  return new Promise((resolve, reject) => {
    const [salt, hashKey] = apikeyHash.authToken.split(':');

    const hashKeyBuff = Buffer.from(hashKey, 'hex');
    crypto.scrypt(apikey, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(crypto.timingSafeEqual(hashKeyBuff, derivedKey));
    });
  });
};

module.exports = {
  addNewKey: addNewKey,
  authenticateKey: authenticateKey,
};
