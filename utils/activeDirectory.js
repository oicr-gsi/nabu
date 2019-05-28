'use strict';

const ActiveDirectory = require('activedirectory2').promiseWrapper;

const ad = getActiveDirectory();

function getActiveDirectory () {
  if (process.env.AD_URL) {
    return new ActiveDirectory({
      url: process.env.AD_URL,
      username: process.env.AD_BIND_USER,
      password: process.env.AD_BIND_PW,
      baseDN: 'ou=OICR,DC=ad,DC=oicr,DC=on,DC=ca'
    });
  } else {
    return null;
  }
}

function AuthenticationError (statusCode, message) {
  this.name = 'AuthenticationError';
  this.errors = [message];
  this.status = statusCode;
}
AuthenticationError.prototype = Error.prototype;

const authenticateADUser = async (req, res, next) => {
  if (ad === null) {
    return next(
      new AuthenticationError(
        400,
        'Active Directory is not configured so QCs cannot be created from the run report page.'
      )
    );
  }
  const userPrincipalName = req.body.username + '@ad.oicr.on.ca';
  ad.authenticate(userPrincipalName, req.body.password, async (err, auth) => {
    if (err && err.name == 'InvalidCredentialsError') {
      return next(new AuthenticationError(401, 'Authentication failed'));
    } else if (err) {
      return next(err);
    } else if (auth) {
      return next();
    } else {
      return next(new AuthenticationError(401, 'Authentication failed'));
    }
  });
};

const isUserAuthorized = async (req, res, next) => {
  if (ad === null) {
    return next(
      new AuthenticationError(
        400,
        'Active Directory is not configured so QCs cannot be created from the run report page.'
      )
    );
  }
  const authorizedRoles = process.env.RR_AUTHORIZED_GROUP;
  const userPrincipalName = req.body.username + '@ad.oicr.on.ca';
  ad.isUserMemberOf(userPrincipalName, authorizedRoles, (err, isMember) => {
    if (err) {
      return next(err);
    }
    if (!isMember) {
      return next(
        new AuthenticationError(
          401,
          'User is not authorized to create QCs from the Run Report page'
        )
      );
    } else {
      next();
    }
  });
};

module.exports = {
  authenticateADUser: authenticateADUser,
  isUserAuthorized: isUserAuthorized
};
