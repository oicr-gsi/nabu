'use strict';

require('dotenv').config();
const express = require('express'); // Express server
const bodyParser = require('body-parser'); // parses request bodies
const swaggerUi = require('swagger-ui-express'); // Swagger documentation package
const swaggerSpec = require('./swagger.json'); // Swagger documentation contents
const prom = require('./utils/prometheus'); // Prometheus exporting
const fileQc = require('./components/fileqcs/fileQcsController'); // controller for FileQC endpoints
const logger = require('./utils/logger'); // logging
const uid = require('uid'); // generates a unique ID for each request
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const favicon = require('serve-favicon');
const path = require('path');
const https = require('https');
const fs = require('fs');

const app = express();
const ignoreFrom = process.env.IGNORE_ADDRESS || ''; // to skip logging of requests from IT's security tests

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
app.use((req, res, next) => {
  // have to manually set this because there's no guarantee it'll be called this in future versions of Express
  req._startTime = new Date();
  // generate a unique identifier for each request, if one hasn't already been set
  if (!req.uid) req.uid = uid();
  res.uid = req.uid;
  if (
    (ignoreFrom.length == 0 ||
      !req.connection.remoteAddress.includes(ignoreFrom)) &&
    req.originalUrl != '/metrics'
  ) {
    logger.info({
      uid: req.uid,
      method: req.method,
      url: req.originalUrl,
      origin: req.connection.remoteAddress
    });
  }
  next();
});

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
app.use((req, res, next) => {
  // log metrics after every request
  if (
    (ignoreFrom.length == 0 ||
      !req.connection.remoteAddress.includes(ignoreFrom)) &&
    req.originalUrl != '/metrics'
  ) {
    const path = req.route ? req.route.path : req.originalUrl;
    if (req.hasOwnProperty('_startTime')) {
      // if it doesn't, it's due to a user URL entry error causing the request to be cut short
      const responseTimeInMs = Date.now() - Date.parse(req._startTime);
      prom.httpRequestDurationMilliseconds
        .labels(path)
        .observe(responseTimeInMs);
    }
    prom.httpRequestCounter.labels(path, req.method, res.statusCode).inc();
  }
  next();
});

const getSslFilesOrNull = filepath => {
  try {
    return fs.readFileSync(filepath);
  } catch (e) {
    return null;
  }
};

const httpsOptions = {
  key: getSslFilesOrNull(process.env.HTTPS_KEY),
  cert: getSslFilesOrNull(process.env.HTTPS_CERT)
};
const port = process.env.PORT || 3000;
const httpsPort = process.env.HTTPS_PORT || 8443;
// Start server and listen on port
app.set('port', port);
const server = app.listen(app.get('port'), () => {
  const host = server.address().address;
  const port = server.address().port;
  logger.info('Unencrypted server listening at http://%s:%s', host, port);
});
const httpsServer = https
  .createServer(httpsOptions, app)
  .listen(httpsPort, () => {
    if (httpsOptions.key !== null) {
      logger.info(
        'Encrypted server listening at https://%s:%s',
        server.address().address,
        httpsPort
      );
    }
  });

module.exports = app;
