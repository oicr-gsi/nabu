'use strict';

/** set up custom error if bad params are given */
function ValidationError (message) {
  this.name = 'ValidationError';
  this.message = message || '';
}
ValidationError.prototype = Error.prototype;

function generateError (statusCode, errorMessage) {
  const err = {
    status: statusCode,
    errors: [errorMessage],
  };
  return err;
}

function handleErrors (e, defaultMessage, logger, next) {
  /* eslint-disable */
  if (e instanceof ValidationError) {
    if (process.env.DEBUG == 'true') console.log(e);
    logger.info(e);
    next(generateError(400, e.message));
  } else if (e.status) {
    logger.debug(e);
    logger.info({ error: e.errors });
    return next(e); // generateError has already been called, usually because it's a user error
  } else {
    logger.debug(e);
    logger.error({ error: e, method: 'handleErrors' });
    next(generateError(500, defaultMessage || 'Error'));
  }
  /* eslint-enable */
}

module.exports = {
  ValidationError: ValidationError,
  handleErrors: handleErrors,
};
