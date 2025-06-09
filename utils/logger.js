'use strict';

const uid = require('uid').uid;
const { createLogger, format, transports } = require('winston');
const logLocation = process.env.LOG_LOCATION || 'logs';


const fileTransports = [
  new transports.File({
    name: 'combined-log',
    filename: `${logLocation}/combined.log`,
    level: 'info',
    handleException: true,
    humanReadableUnhandledException: true,
  }),
  new transports.File({
    name: 'error-log',
    filename: `${logLocation}/error.log`,
    level: 'error',
    handleException: true,
    humanReadableUnhandledException: true,
  }),
];

const testingTransport = [
  new transports.Console({
    name: 'consoleTest',
    level: 'debug',
    humanReadableUnhandledException: true,
  }),
];

const transportsForEnvironment =
  process.env.NODE_ENV == 'test' ? testingTransport : fileTransports;

const logger = createLogger({
  format: format.combine(
    format.errors({stack: true}),
    format.timestamp(),
    format.printf(({timestamp, level, message, stack}) => {
      const text = `${timestamp} ${level.toUpperCase()} ${JSON.stringify(message)}`;
      return stack ? text + '\n' + stack : text;
    })
  ),
  transports: transportsForEnvironment,
});

if (process.env.NODE_ENV !== 'production' && process.env.LOG_LEVEL != 'prod') {
  logger.add(new transports.Console(), {
    level: 'debug',
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
  logger.info({
    uid: req.uid,
    method: req.method,
    url: req.originalUrl,
    origin: remoteAddress,
  });
  next();
};

module.exports = {
  logger: logger,
  addUID: addUID,
  logRequestInfo: logRequestInfo,
};
