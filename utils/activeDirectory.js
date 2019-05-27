'use strict';

const ActiveDirectory = require('activedirectory2').promiseWrapper;

const ad = getActiveDirectory();

function getActiveDirectory () {
  if (process.env.AD_URL) {
    return new ActiveDirectory({
      url: process.env.AD_URL
      //				username: process.env.AD_BIND_USER,
      //				password: process.env.AD_BIND_PW
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

const authorizeADUser = async (req, res, next) => {
  if (ad === null) {
    return next(
      new AuthenticationError(
        400,
        'Active Directory is not configured so QCs cannot be created from the run report page.'
      )
    );
  }
  const allowedUsers = process.env.RR_AUTHORIZED_USERS.split(',');
  if (!allowedUsers.includes(req.body.username)) {
    return next(
      new AuthenticationError(
        400,
        `User ${req.body.username} may not create QCs from the run report page.`
      )
    );
  }
  const userPrincipalName = req.body.username + '@ad.oicr.on.ca';
  try {
    ad.authenticate(userPrincipalName, req.body.password, async (err, auth) => {
      if (err && err.name == 'InvalidCredentialsError') {
        return next(new AuthenticationError(401, 'Authentication failed'));
      } else if (err) {
        console.log(err);
        return next(new AuthenticationError(500, 'Error authenticating user'));
      } else if (auth) {
        return next();
      } else {
        return next(new AuthenticationError(401, 'Authentication failed'));
      }
    });
  } catch (e) {
    return next(e);
  }
};

module.exports = {
  authorizeADUser: authorizeADUser
};
