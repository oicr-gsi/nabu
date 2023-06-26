'use strict';

const NotFoundError = require('./pgUtils').NotFoundError;

/** set up custom error if bad params are given */
class ValidationError extends Error {
  constructor (message = '', ...args) {
    super(message, ...args);
    this.name = 'ValidationError';
    this.message = message || '';
  }
}

function generateError (statusCode, errorMessage) {
  const err = {
    status: statusCode,
  };
  if (errorMessage) {
    err.errors = [errorMessage];
  }
  return err;
}

function handleErrors (e, defaultMessage, logger, next) {
  /* eslint-disable */
  if (e instanceof ValidationError) {
    logger.info(e.message);
    next(generateError(400, e.message));
  } else if (e instanceof NotFoundError) {
    if (process.env.DEBUG == 'true') console.log(e);
    next(generateError(404, null));
  } else if (e.status) {
    logger.info({ error: e.errors });
    return next(e); // generateError has already been called, usually because it's a user error
  } else {
    console.log(e);
    logger.debug(e);
    logger.error({ error: e, method: 'handleErrors' });
    next(generateError(500, defaultMessage || 'Error'));
  }
  /* eslint-enable */
}

module.exports = {
  ValidationError: ValidationError,
  generateError: generateError,
  handleErrors: handleErrors,
};
