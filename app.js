'use strict';

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger.json');
const prom = require('./utils/prometheus');
const fileQc = require('./components/fileqcs/fileQcsController');
const logger = require('./utils/logger');
const uid = require('gen-uid');

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

