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
    res.status(200).json(signoffs);
    next();
  } catch (e) {
    handleErrors(e, 'Error getting signoff(s) for case', logger, next);
  }
};

const addSignoff = async (req, res, next) => {
  try {
    const existingSignoffs = await signoffDao.getByCaseConstraint(
      req.params.caseIdentifier,
      req.body.signoffStepName,
      req.body.deliverableType
    );

    let createdSignoff;
    const validationResults = validateObjectsFromUser(req.body);
    if (existingSignoffs == null || !existingSignoffs.length) {
      let createdSignoff = await upsert(
        req.params.caseIdentifier,
        validationResults
      );
    } else {
      // signoff step + deliverable are same, delete the old signoff record and add new one
      let createdSignoff = await upsert(
        req.params.caseIdentifier,
        validationResults,
        existingSignoffs[0].id
      );
    }
    return res.status(201).json(createdSignoff);
  } catch (e) {
    handleErrors(e, 'Error adding sign-off', logger, next);
  }
};

const upsert = (caseIdentifier, signoffInfo, oldSignoffId) => {
  return signoffDao.addSignoff(caseIdentifier, signoffInfo, oldSignoffId);
};

function validateUsername (param) {
  const user = nullifyIfBlank(param);
  if (user == null || !user.length)
    return new ValidationError('username must be provided');
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
  let validSteps = ['ANALYSIS_REVIEW', 'RELEASE_APPROVAL', 'RELEASE'];
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
  let deliverable = nullifyIfBlank(param); //required by endpoint so shouldn't ever nullify
  if (
    deliverable !== 'undefined' &&
    deliverable !== null &&
    deliverable.length
  ) {
    deliverable = deliverable.toUpperCase();
  }
  let validDeliverables = ['DATA_RELEASE', 'CLINICAL_REPORT'];
  if (!validDeliverables.includes(deliverable)) {
    return new ValidationError(
      'Sign-off must be associated with a valid deliverable type: ' +
        validDeliverables.toString() +
        ', instead got ' +
        deliverable
    );
  }
  return deliverable;
}

/** returns an object with all fields valid or errors */
function validateObjectsFromUser (unvalidated) {
  let validationErrors = [];
  let singleEntryValidationErrors = [];
  let fromUser = {
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
