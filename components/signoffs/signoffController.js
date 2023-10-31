'use strict';

const signoffDao = require('./signoffDao');
const JSONStream = require('JSONStream');
const {
  handleErrors,
  ValidationError,
} = require('../../utils/controllerUtils');
const { signoff } = require('../../utils/urlSlugs');
const logger = require('../../utils/logger').logger;

const getSignoff = async (req, res, next) => {
  try {
    const signoffs = await signoffDao.getByCaseIdentifier(
      req.params.caseIdentifier
    );
    if (signoffs && signoffs.length) {
      res.status(200).json(signoffs);
      next();
    } else {
      res.status(404).end();
    }
  } catch (e) {
    handleErrors(e, 'Error getting signoff(s) for case', logger, next);
  }
};

const addSignoff = async (req, res, next) => {
  try {
    const existingSignoffs = await signoffDao.getByCaseIdentifier(
      req.body.caseIdentifier
    );

    const validationResults = validateObjectsFromUser(req.body);
    if (existingSignoffs == null || !existingSignoffs.length) {
      const createdSignoff = await upsert(validationResults);
      return res.status(201).json(createdSignoff);
    } else {
      for (const [, existingSignoff] of Object.entries(existingSignoffs)) {
        if (
          existingSignoff.signoffStepName ==
            validationResults.signoffStepName &&
          existingSignoff.deliverableType == validationResults.deliverableType
        ) {
          // signoff step is same, replace the old signoff record
          const createdSignoff = await upsert(validationResults);
          return res.status(200).json(createdSignoff);
        } else {
          // signoff data is different
          const createdSignoff = await upsert(validationResults);
          return res.status(201).json(createdSignoff);
        }
      }
    }
  } catch (e) {
    handleErrors(e, 'Error adding sign-off', logger, next);
  }
};

const upsert = (signoffInfo) => {
  return signoffDao.addSignoff(signoffInfo);
};

function validateUsername (param) {
  const user = nullifyIfBlank(param);
  if (user == null || !user.length)
    return new ValidationError('username must be provided');
  if (user.match(/\W+/))
    return new ValidationError('username must contain only letters');
  return user;
}

function validateComment (param) {
  let comment = nullifyIfBlank(param);
  if (comment !== null)
    comment = decodeURIComponent(comment.replace(/\+/g, ' '));
  return comment;
}

function nullifyIfBlank (value) {
  if (typeof value == 'undefined' || value === null || value.length == 0)
    value = null;
  return value;
}

function validateStepName (param) {
  let stepname = nullifyIfBlank(param); //required by endpoint so shouldn't ever nullify
  if (stepname !== 'undefined' && stepname !== null && stepname.length) {
    stepname = stepname.toUpperCase();
  }
  let validSteps = ['ANALYSIS REVIEW', 'RELEASE APPROVAL', 'RELEASE'];
  if (!validSteps.includes(stepname)) {
    return new ValidationError(
      'Sign-off must be associated with a valid step name: ' +
        validSteps.toString() +
        ', instead got ' +
        stepname
    );
  }
  return stepname;
}

function validateDeliverableType (param) {
  let pipeline = nullifyIfBlank(param); //required by endpoint so shouldn't ever nullify
  if (pipeline !== 'undefined' && pipeline !== null && pipeline.length) {
    pipeline = pipeline.toUpperCase();
  }
  let validPipes = ['DATA RELEASE', 'CLINICAL REPORT'];
  if (!validPipes.includes(pipeline)) {
    return new ValidationError(
      'Sign-off must be associated with a valid deliverable type: ' +
        validPipes.toString() +
        ', instead got ' +
        pipeline
    );
  }
  return pipeline;
}

/** returns an object with all fields valid or errors */
function validateObjectsFromUser (unvalidated) {
  let validationErrors = [];
  let singleEntryValidationErrors = [];
  let fromUser = {
    caseIdentifier: unvalidated.caseIdentifier,
    qcPassed: nullifyIfBlank(unvalidated.qcPassed),
    username: validateUsername(unvalidated.username),
    deliverableType: validateDeliverableType(unvalidated.deliverableType),
    signoffStepName: validateStepName(unvalidated.signoffStepName),
    comment: validateComment(unvalidated.comment),
  };
  for (const [, value] of Object.entries(fromUser)) {
    if (value instanceof ValidationError) {
      singleEntryValidationErrors.push(value);
    }
  }
  if (singleEntryValidationErrors.length) {
    let fullErrorMessage =
      fromUser.case_identifier +
      ' : ' +
      singleEntryValidationErrors.map((e) => e.message).join('. ');
    validationErrors.push(fullErrorMessage);
  } else {
    return fromUser;
  }
  if (validationErrors.length) {
    let allErrors = validationErrors.join('. ');
    throw new ValidationError(allErrors);
  }
  return fromUser;
}

module.exports = {
  addSignoff: addSignoff,
  getSignoff: getSignoff,
};
