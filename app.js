'use strict';

if (process.env.NODE_ENV != 'TEST') {
  // Only read dotenv config here if this is not running tests
  // Tests run their own dotenv config
  require('dotenv').config();
}
const ad = require('./utils/activeDirectory');
const bodyParser = require('body-parser');
const compression = require('compression');
const cors = require('cors');
const express = require('express');
const favicon = require('serve-favicon');
const fileQc = require('./components/fileqcs/fileQcsController'); // controller for FileQC endpoints
const fs = require('fs');
const helmet = require('helmet');
const https = require('https');
const log = require('./utils/logger');
const path = require('path');
const prom = require('./utils/prometheus');
const swaggerSpec = require('./swagger.json');
const swaggerUi = require('swagger-ui-express');

const app = express();
const port = process.env.PORT || 3000;
const httpsPort = process.env.HTTPS_PORT || 8443;
const logger = log.logger;

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  if (err.status) {
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
// redirect http requests to https in production
app.use((req, res, next) => {
  // Only /metrics can be accessed via HTTP, unless NO_SSL is 'true' in .env file (not for production!)
  if (
    !req.secure &&
    req.originalUrl !== '/metrics' &&
    (process.env.NODE_ENV === 'production' || process.env.NO_SSL != 'true')
  ) {
    const host = req.get('Host').split(':')[0];
    // using 307 Temporary Redirect preserves the original HTTP method in the request.
    return res.redirect(307, `https://${host}:${httpsPort}${req.url}`);
  }
  next();
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/v1', express.Router());
app.use(log.addUID, log.logRequestInfo);

// home page
app.get('/', (req, res) => {
  res
    .status(400)
    .json({ error: 'Use path /fileqcs?[project=?? OR fileswids=??]' });
  res.end();
});

app.get('/available', fileQc.getAvailableConstants);

// routes to fileQC records
app.post('/add-fileqcs', fileQc.addFileQcs);
app.post('/get-fileqcs', fileQc.getFileQcs);
// deliberate indirection here so as to not turn it on by accident
if (process.env.DEACTIVATE_AD_AUTH === 'false') {
  app.post(
    '/fileqcs/batch-signed',
    ad.isUserAuthorized,
    ad.authenticateADUser,
    // if user is authenticated by this point, add the signed bit to the request
    (req, res, next) => {
      req.query.signed = true;
      next();
    },
    fileQc.addManyFileQcs
  );
}

app.post('/delete-fileqcs', fileQc.deleteFileQcs);
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
  logger.info(
    `Unencrypted redirecting server listening at http://${host}:${port}`
  );
});

if (process.env.NODE_ENV == 'production' || process.env.NO_SSL != 'true') {
  // Run https server as well in production or if NO_SSL has been disabled in dev
  const getSslFilesOrYell = (filepath) => {
    try {
      return fs.readFileSync(filepath);
    } catch (e) {
      throw new Error(
        `Could not read file path '${filepath}'. Are HTTPS_KEY and HTTPS_CERT set correctly in .env?`
      );
    }
  };

  const httpsOptions = {
    key: getSslFilesOrYell(process.env.HTTPS_KEY),
    cert: getSslFilesOrYell(process.env.HTTPS_CERT),
  };
  https.createServer(httpsOptions, app).listen(httpsPort, () => {
    logger.info(
      `Encrypted server listening at https://${
        server.address().address
      }:${httpsPort}`
    );
  });
}

module.exports = app;
