'use strict';

const uid = require('uid');
const winston = require('winston');
const logLocation = process.env.LOG_LOCATION || 'logs';

const ignoreFrom = process.env.IGNORE_ADDRESS || ''; // skip logging of requests from IT's security server

const logger = new winston.Logger({
  transports: [
    new winston.transports.File({
      name: 'combined-log',
      filename: `${logLocation}/combined.log`,
      level: 'info',
      handleException: true,
      humanReadableUnhandledException: true,
      colorize: true,
      timestamp: 'tsFormat'
    }),
    new winston.transports.File({
      name: 'error-log',
      filename: `${logLocation}/error.log`,
      level: 'error',
      handleException: true,
      humanReadableUnhandledException: true,
      colorize: true,
      timestamp: 'tsFormat'
    })
  ]
});

if (process.env.NODE_ENV !== 'production' || process.env.LOG_LEVEL != 'prod') {
  logger.add(winston.transports.Console, {
    level: 'debug',
    colorize: true,
    timestamp: 'tsFormat'
  });
}

const addUID = (req, res, next) => {
  // have to manually set this because there's no guarantee it'll be called this in future versions of Express
  req._startTime = new Date();
  // generate a unique identifier for each request, if one hasn't already been set
  if (!req.uid) req.uid = uid();
  res.uid = req.uid;
  next();
};

const logRequestInfo = (req, res, next) => {
  // If request comes from behind a proxy, `req.connection.remoteAddress` will be undefined.
  // Make a best guess at getting the remote address.
  const remoteAddress =
    (req.headers['x-forwarded-for']
      ? req.headers['x-forwarded-for'].split(',')[0]
      : req.connection && req.connection.remoteAddress) || 'unknown';
  if (
    (ignoreFrom.length == 0 || !remoteAddress.matches(ignoreFrom)) &&
    req.originalUrl != '/metrics'
  ) {
    logger.info({
      uid: req.uid,
      method: req.method,
      url: req.originalUrl,
      origin: remoteAddress
    });
  }
  next();
};

module.exports = {
  logger: logger,
  addUID: addUID,
  logRequestInfo: logRequestInfo
};
