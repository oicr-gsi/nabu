'use strict';

const caseDao = require('./caseDao');
const handleErrors = require('../../utils/controllerUtils').handleErrors;

const getCase = async (req, res, next) => {
  try {
    const cardeaCase = await caseDao.getByCaseIdentifier(
      req.params.caseIdentifier
    );
    res.status(200).json(cardeaCase);
  } catch (e) {
    handleErrors(e, 'Error getting case', next);
  }
};

module.exports = {
  getCase: getCase,
};
