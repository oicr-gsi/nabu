'use strict';

const caseDao = require('./caseDao');
const handleErrors = require('../../utils/controllerUtils').handleErrors;
const logger = require('../../utils/logger').logger;

const getCase = async (req, res, next) => {
  try {
    const cardeaCase = await caseDao.getByCaseIdentifier(
      req.params.caseIdentifier
    );
    res.status(200).json(cardeaCase);
  } catch (e) {
    handleErrors(e, 'Error getting case', logger, next);
  }
};

const addCases = async (req, res, next) => {
  try {
    await caseDao.addCases(req.body);
    res.status(201).end();
  } catch (e) {
    handleErrors(e, 'Error adding cases', logger, next);
  }
};

module.exports = {
  addCases: addCases,
  getCase: getCase,
};
