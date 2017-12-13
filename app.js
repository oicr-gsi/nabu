'use strict';

require('dotenv').config();
const express = require('express'); // Express server
const bodyParser = require('body-parser'); // parses request bodies
const morgan = require('morgan'); // request logging
const swaggerUi = require('swagger-ui-express'); // Swagger documentation package
const swaggerSpec = require('./swagger.json'); // Swagger documentation contents
const prom = require('./utils/prometheus'); // Prometheus exporting
const fileQc = require('./components/fileqcs/fileQcsController'); // controller for FileQC endpoints
const logger = require('./utils/logger'); // logging
const uid = require('gen-uid'); // generates a unique ID for each request

const app = express();
const logLevel = process.env.LOG_LEVEL || 'dev';
app.use(morgan(logLevel)); // TODO: expand this further to do production logging

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500);
  res.json({ 'errors': err.errors });
  res.end();
  next();
};

app.use(bodyParser.json({ type: 'application/json' }));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/v1', express.Router());
app.use((req, res, next) => {
  // generate a unique identifier for each request, if one hasn't already been set
  if (!req.uid) req.uid = uid.token();
  res.uid = req.uid;
  logger.info(`[${req.uid}] ${req.method} ${req.originalUrl}`);
  next();
});

// home page
app.get('/', (req, res) => { res.end(); });

// routes to fileQC records
app.get('/fileqcs', fileQc.getAllFileQcs);
app.get('/fileqc/:identifier', fileQc.getFileQc);
app.post('/fileqcs', fileQc.addFileQc);
app.post('/fileqcs/batch', fileQc.addManyFileQcs);
app.get('/metrics', async (req, res) => {
  try {
    const mostRecentImportTime = await fileQc.getMostRecentFprImportTime();
    prom.mostRecentFprImport.set(mostRecentImportTime);
  } catch (e) {
    logger.error('Error getting most recent File Provenance Report import time');
    logger.error(e);
  }
  res.set('Content-Type', prom.prometheus.register.contentType);
  res.end(prom.prometheus.register.metrics());
});
app.get('/favicon.ico', (req, res) => {
  // end the response as there's no favicon to be gotten. Don't log this to Prometheus
  res.status(404);
  res.end();
});
app.use(errorHandler);
app.use((req, res, next) => {
  // log metrics after every request
  const responseTimeInMs = Date.now() - Date.parse(req._startTime);
  prom.httpRequestDurationMilliseconds
    .labels(req.route.path)
    .observe(responseTimeInMs);
  prom.httpRequestCounter
    .labels(req.route.path, req.method, res.statusCode)
    .inc();
  next();
});


module.exports = app;

// Start server and listen on port
app.set('port', process.env.PORT || 3000);
const server = app.listen(app.get('port'), () => {
  const host = server.address().address;
  const port = server.address().port;

  logger.info('Listening at http://%s:%s', host, port);
});

