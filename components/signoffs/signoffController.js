'use strict';

const signoffDao = require('./signoffDao');
const JSONStream = require('JSONStream');
const {
  handleErrors,
  ValidationError,
  ConflictingDataError,
} = require('../../utils/controllerUtils');
const { signoff } = require('../../utils/urlSlugs');
const logger = require('../../utils/logger').logger;

const getSignoff = async (req, res, next) => {
  try {
    const signoffs = await signoffDao.getByCaseIdentifier(
      req.params.caseIdentifier
    );
    if (signoffs) {
      res.status(200).json(signoffs);
    } else {
      res.status(404).end();
    }
  } catch (e) {
    handleErrors(e, 'Error getting signoff(s) for case', logger, next);
  }
};

const addSignoff = async (req, res, next) => {
  try {
    const existingSignoff = null;
    //const existingSignoff = await signoffDao.getByCaseIdentifier(
    //  req.body.caseIdentifier
    //);
    //const validationResults = validateObjectsFromUser(req.body);
    if (existingSignoff == null) {
      await upsert(req.body);
      res.status(201).end();
    } else if (
      existingSignoff.username == req.body.username &&
      existingSignoff.signoff_step_name == req.body.signoff_step_name &&
      existingSignoff.deliverable_type == req.body.deliverable_type
    ) {
      // signoff step is same, replace the old signoff record
      await upsert(req.body);
      res.status(201).end();
    } else {
      // signoff data is different
      await upsert(req.body);
      res.status(201).end();
    }
  } catch (e) {
    handleErrors(e, 'Error adding cases', logger, next);
  }
};

const upsert = (caseInfo) => {
  return signoffDao.addSignoff(caseInfo);
};

const deleteSignoff = async (req, res, next) => {
  try {
    if (!req.body.id)
      throw Error(400, 'Error: no "signoffId" provided request body');

    const username = validateUsername(req.body.username);

    const result = await signoffDao.deleteSignoff(req.body.id);
    res.status(200).json(result);
    next();
  } catch (e) {
    handleErrors(e, 'Error deleting records', logger, next);
  }
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
  let validSteps = [
    'CASE REVIEW',
    'ANALYSIS REVIEW',
    'RELEASE APPROVAL',
    'RELEASED',
  ];
  if (!validSteps.includes(stepname)) {
    return new ValidationError(
      'Sign-off must be associated with a valid step name: "CASE REVIEW", "ANALYSIS REVIEW", "RELEASE APPROVAL", or "RELEASED"'
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
      'Sign-off must be associated with a valid deliverable type: "DATA RELEASE" or "CLINICAL REPORT"'
    );
  }
  return pipeline;
}

/** returns an object { validated: {}, errors: [] } */
function validateObjectsFromUser (unvalidatedObjects) {
  let validationErrors = [];
  let validatedParams = unvalidatedObjects.map((unvalidated) => {
    let singleEntryValidationErrors = [];
    let fromUser = {
      case_identifier: unvalidated.case_identifier,
      qc_passed: unvalidated.qc_passed,
      username: validateUsername(unvalidated.username),
      comment: validateComment(unvalidated.comment),
      deliverable_type: validateDeliverableType(unvalidated.deliverable_type),
      signoff_step_name: validateStepName(unvalidated.signoff_step_name),
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
  });
  if (validationErrors.length) {
    let allErrors = validationErrors.join('. ');
    throw new ValidationError(allErrors);
  }
  console.log(validatedParams); //TO DELETE LATER
  return validatedParams;
}

module.exports = {
  addSignoff: addSignoff,
  getSignoff: getSignoff,
  deleteSignoff: deleteSignoff,
};
