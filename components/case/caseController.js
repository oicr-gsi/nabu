'use strict';

const caseDao = require('./caseDao');
const handleErrors = require('../../utils/controllerUtils').handleErrors;
const ValidationError = require('../../utils/controllerUtils').ValidationError;
const logger = require('../../utils/logger').logger;

function arraysEquals (array1, array2) {
  return (
    array1.every((item) => array2.includes(item)) &&
    array2.every((item) => array1.includes(item))
  );
}

const getCase = async (req, res, next) => {
  try {
    const cardeaCase = await caseDao.getByCaseIdentifier(
      req.params.caseIdentifier
    );
    if (cardeaCase) {
      res.status(200).json(cardeaCase);
    } else {
      res.status(404).end();
    }
  } catch (e) {
    handleErrors(e, 'Error getting case', logger, next);
  }
};

const addCases = async (req, res, next) => {
  try {
    const existingCase = await caseDao.getByCaseIdentifier(
      req.body.caseIdentifier
    );
    if (existingCase) {
      if (
        existingCase.requisitionId == req.body.requisitionId &&
        arraysEquals(existingCase.limsIds, req.body.limsIds) &&
        arraysEquals(
          existingCase.workflowRunIdsForOffsiteArchive,
          req.body.workflowRunIdsForOffsiteArchive
        ) &&
        arraysEquals(
          existingCase.workflowRunIdsForVidarrArchival,
          req.body.workflowRunIdsForVidarrArchival
        )
      ) {
        // case has already been created with the same data
        res.status(200).end();
      } else {
        // case has already been created, with different data. Will not update. Yell.
        handleErrors(
          new ValidationError(
            'Data provided differs from data for matching existing case. Provided: ' +
              JSON.stringify(req.body) +
              '. Existing: ' +
              JSON.stringify(existingCase)
          ),
          'Error creating case',
          logger,
          next
        );
      }
    } else {
      await caseDao.addCases(req.body);
    }
    res.status(201).end();
  } catch (e) {
    handleErrors(e, 'Error adding cases', logger, next);
  }
};

const filesCopiedToOffsiteStagingDir = async (req, res, next) => {
  try {
    const updatedCase = await caseDao.updateFilesCopiedToOffsiteStagingDir(
      req.params.caseIdentifier,
      JSON.stringify(req.body)
    );
    res.status(200).send(updatedCase);
  } catch (e) {
    handleErrors(e, 'Error updating case', logger, next);
  }
};

module.exports = {
  addCases: addCases,
  getCase: getCase,
  filesCopiedToOffsiteStagingDir: filesCopiedToOffsiteStagingDir,
};
