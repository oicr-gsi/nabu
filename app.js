'use strict';

require('dotenv').config();
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
      errors: err.errors || err.message || err
    });
  } else {
    // unexpected error, so log it
    logger.error({
      error: 'Unexpected error',
      details: err,
      endpoint: req.originalUrl
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
  if (
    !req.secure &&
    req.originalUrl !== '/metrics' &&
    process.env.NODE_ENV === 'production'
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
app.get('/fileqcs', fileQc.getAllFileQcs);
app.get('/fileqc/:identifier', fileQc.getFileQc);
app.get('/fileqcs-only', fileQc.getAllBareFileQcs);
app.post('/fileqcs', fileQc.addFileQc);
app.post('/fileqcs/batch', fileQc.addManyFileQcs);
app.post('/fileqcs/run-report', ad.authorizeADUser, fileQc.addManyFileQcs);

app.post('/delete-fileqcs', fileQc.deleteFileQcs);
app.get('/metrics', async (req, res) => {
  try {
    const mostRecentImportTime = await fileQc.getMostRecentFprImportTime();
    prom.mostRecentFprImport.set(mostRecentImportTime);
  } catch (e) {
    logger.error({
      error: 'Error getting most recent File Provenance Report import time',
      details: e,
      method: '/metrics endpoint'
    });
  }
  res.set('Content-Type', prom.prometheus.register.contentType);
  res.end(prom.prometheus.register.metrics());
});

app.use(errorHandler);
app.use(prom.monitorAfterRequest);

const getSslFilesOrYell = filepath => {
  try {
    return fs.readFileSync(filepath);
  } catch (e) {
    throw new Error(
      `Could not read file path '${filepath}' to SSL key or certificate. Are they set correctly in .env?`
    );
  }
};

const httpsOptions = {
  key: getSslFilesOrYell(process.env.HTTPS_KEY),
  cert: getSslFilesOrYell(process.env.HTTPS_CERT)
};
// Start server and listen on port
app.set('port', port);
const server = app.listen(app.get('port'), () => {
  const host = server.address().address;
  const port = server.address().port;
  logger.info(
    'Unencrypted redirecting server listening at http://%s:%s',
    host,
    port
  );
});
const httpsServer = https
  .createServer(httpsOptions, app)
  .listen(httpsPort, () => {
    logger.info(
      'Encrypted server listening at https://%s:%s',
      server.address().address,
      httpsPort
    );
  });

module.exports = app;
