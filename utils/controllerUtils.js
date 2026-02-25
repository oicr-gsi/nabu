'use strict';

const NotFoundError = require('./dbUtils').NotFoundError;

/** set up custom error if bad params are given */
class ValidationError extends Error {
  constructor (message) {
    super(message);
    this.name = 'ValidationError';
    this.message = message;
  }
}

class ConflictingDataError extends Error {
  constructor (message) {
    super(message);
    this.name = 'ConflictingDataError';
    this.message = message;
  }
}

class AuthenticationError extends Error {
  constructor (message) {
    super(message);
    this.name = 'AuthenticationError';
    this.message = message;
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
  logger.error(e);
  if (e instanceof ValidationError) {
    next(generateError(400, e.message));
  } else if (e instanceof NotFoundError) {
    next(generateError(404, null));
  } else if (e instanceof ConflictingDataError) {
    next(generateError(409, e.message));
  } else if (e instanceof AuthenticationError) {
    next(generateError(401, e.message));
  } else if (e.status) {
    return next(e); // generateError has already been called, usually because it's a user error
  } else {
    next(generateError(500, defaultMessage || 'Error'));
  }
  /* eslint-enable */
}

//returns elements present in first array but not second
function arrayDiff (array1, array2) {
  array1 = array1 || [];
  array2 = array2 || [];
  return [
    array1.filter((e) => !array2.includes(e)),
    array2.filter((e) => !array1.includes(e)),
  ];
}

const missingMsg = (entityType, entityIdentifier, whatIsMissing, missingItems) => {
  return `The request for ${entityType} ${entityIdentifier} is missing ${whatIsMissing} which are present in the existing ${entityType}: (${missingItems}).`;
}
const bonusMsg = (entityType, entityIdentifier, whatIsBonus, bonusItems) => {
  return `The request for ${entityType} ${entityIdentifier} contains extra ${whatIsBonus}: (${bonusItems}) compared to those which are present in the existing ${entityType}.`
}

module.exports = {
  ValidationError: ValidationError,
  ConflictingDataError: ConflictingDataError,
  AuthenticationError: AuthenticationError,
  arrayDiff: arrayDiff,
  generateError: generateError,
  handleErrors: handleErrors,
  missingMsg: missingMsg,
  bonusMsg: bonusMsg,
};
