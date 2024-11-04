'use strict';

const signoffDao = require('./signoffDao');
const {
  handleErrors,
  ValidationError,
} = require('../../utils/controllerUtils');
const logger = require('../../utils/logger').logger;
const authenticator = require('../../utils/apiAuth');

const getSignoff = async (req, res, next) => {
  try {
    //authenticate api-key from header before continuing
    await authenticator.authenticateRequest(req);

    const signoffs = await signoffDao.getByCaseIdentifier(
      req.params.caseIdentifier
    );
    res.status(200).json(signoffs);
    next();
  } catch (e) {
    handleErrors(e, 'Error getting signoff(s) for case', logger, next);
  }
};

const getAllSignoffs = async (req, res, next) => {
  try {
    //authenticate api-key from header before continuing
    await authenticator.authenticateRequest(req);

    const signoffs = await signoffDao.getSignoffs();
    res.status(200).json(signoffs);
    next();
  } catch (e) {
    handleErrors(e, 'Error getting signoff(s) for case', logger, next);
  }
};

const addSignoff = async (req, res, next) => {
  try {
    //authenticate api-key from header before continuing
    await authenticator.authenticateRequest(req);

    const existingSignoffs = await signoffDao.getByCaseConstraint(
      req.params.caseIdentifier,
      req.body.signoffStepName,
      req.body.deliverableType,
      req.body.deliverable
    );

    let createdSignoff;
    const validationResults = validateObjectsFromUser(req.body);
    if (existingSignoffs == null || !existingSignoffs.length) {
      createdSignoff = await upsert(
        req.params.caseIdentifier,
        validationResults
      );
    } else {
      // signoff step + deliverable are same, delete the old signoff record and add new one
      createdSignoff = await upsert(
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

const addBatchSignoffs = async (req, res, next) => {
  try {
    //authenticate api-key from header before continuing
    await authenticator.authenticateRequest(req);

    let responses = [];
    const allCaseIds = req.body.caseIdentifiers;

    for (const caseId of allCaseIds) {
      try {
        const existingSignoffs = await signoffDao.getByCaseConstraint(
          caseId,
          req.body.signoffStepName,
          req.body.deliverableType,
          req.body.deliverable
        );

        const validationResults = validateObjectsFromUser(req.body);
        if (existingSignoffs == null || !existingSignoffs.length) {
          const createdSignoff = await upsert(caseId, validationResults);
          responses.push(createdSignoff);
        } else {
          // signoff step + deliverable are same, delete the old signoff record and add new one
          const createdSignoff = await upsert(
            caseId,
            validationResults,
            existingSignoffs[0].id
          );
          responses.push(createdSignoff);
        }
      } catch (e) {
        handleErrors(e, 'Error adding sign-off ' + caseId, logger, next);
      }
    }
    return res.status(201).json(responses);
  } catch (e) {
    handleErrors(e, 'Error adding multiple sign-offs', logger, next);
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

function validateDeliverable (param, step) {
  let deliverable = nullifyIfBlank(param);
  //A deliverable (in addition to deliverableType) is required
  //for the release sign-off but shouldn't be provided for the other sign-offs
  if (step == 'RELEASE') {
    if (deliverable == null) {
      return new ValidationError(
        'Sign-off associated with the RELEASE step must have a deliverable provided.'
      );
    }
    deliverable = decodeURIComponent(deliverable.replace(/\+/g, ' '));
  } else {
    if (deliverable !== null) {
      return new ValidationError(
        'Sign-off associated with ANALYSIS_REVIEW or RELEASE_APPROVAL step cannot have a deliverable.'
      );
    }
  }
  return deliverable;
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
  let stepname = validateStepName(unvalidated.signoffStepName);
  let fromUser = {
    qcPassed: nullifyIfBlank(unvalidated.qcPassed),
    username: validateUsername(unvalidated.username),
    deliverableType: validateDeliverableType(unvalidated.deliverableType),
    signoffStepName: stepname,
    deliverable: validateDeliverable(unvalidated.deliverable, stepname),
    comment: validateComment(unvalidated.comment),
    release: nullifyIfBlank(unvalidated.release),
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
  addBatchSignoffs: addBatchSignoffs,
  getAllSignoffs: getAllSignoffs,
};
