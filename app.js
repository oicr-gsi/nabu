'use strict';

if (process.env.NODE_ENV != 'TEST') {
  // Only read dotenv config here if this is not running tests
  // Tests run their own dotenv config
  require('dotenv').config();
}
const bodyParser = require('body-parser');
const compression = require('compression');
const cors = require('cors');
const express = require('express');
const favicon = require('serve-favicon');
const fileQc = require('./components/fileqcs/fileQcsController'); // controller for FileQC endpoints
const caseController = require('./components/case/caseController'); // controller for case & archive endpoints
const helmet = require('helmet');
const log = require('./utils/logger');
const path = require('path');
const prom = require('./utils/prometheus');
const swaggerSpec = require('./swagger.json');
const swaggerUi = require('swagger-ui-express');

const app = express();
const port = process.env.PORT || 3000;
const logger = log.logger;

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  if (err.status && err.status == 404) {
    res.status(err.status).end(); // no body
  } else if (err.status) {
    res.status(err.status);
    res.json({
      errors: err.errors || err.message || err,
    });
  } else {
    // unexpected error, so log it
    logger.error({
      error: 'Unexpected error',
      details: err,
      endpoint: req.originalUrl,
    });
    res.status(500);
    res.json({ errors: ['An unexpected error has occurred.'] });
  }
  res.end();
  next();
};

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(bodyParser.json({ type: 'application/json', limit: '50mb' }));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/v1', express.Router());
app.use(log.addUID, log.logRequestInfo);

// home page
app.get('/', (req, res) => {
  res.redirect('/api-docs');
});

app.get('/available', fileQc.getAvailableConstants);

// routes to fileQC records
app.post('/get-fileqcs', fileQc.getFileQcs);
app.post('/add-fileqcs', fileQc.addFileQcs);
app.get('/fileqcs-only', fileQc.streamFileQcs);

app.post('/delete-fileqcs', fileQc.deleteFileQcs);

app.post('/case', caseController.addCases);
app.put(
  '/case/:caseIdentifier/files-copied-to-offsite-staging-dir',
  caseController.filesCopiedToOffsiteStagingDir
);
app.put(
  '/case/:caseIdentifier/files-sent-offsite',
  caseController.filesSentOffsite
);
app.get('/case/:caseIdentifier', caseController.getCase);

app.get('/metrics', async (req, res) => {
  try {
    const mostRecentImportTime = await fileQc.getMostRecentFprImportTime();
    prom.mostRecentFprImport.set(mostRecentImportTime);
  } catch (e) {
    logger.error({
      error: 'Error getting most recent File Provenance Report import time',
      details: e,
      method: '/metrics endpoint',
    });
  }
  res.set('Content-Type', prom.prometheus.register.contentType);
  res.end(await prom.prometheus.register.metrics());
});

app.use(errorHandler);
app.use(prom.monitorAfterRequest);

// Start server and listen on port
app.set('port', port);
const server = app.listen(app.get('port'), () => {
  const host = server.address().address;
  const port = server.address().port;
  logger.info(`Server listening at http://${host}:${port}`);
});

module.exports = app;
