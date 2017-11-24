'use strict';

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger.json');
const app = express();
const prometheus = require('prom-client');

app.use(bodyParser.json({ type: 'application/json' }));

const logLevel = process.env.LOG_LEVEL || 'dev';
app.use(morgan(logLevel)); // TODO: expand this further to do production logging

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/v1', express.Router());

const fileQc = require('./components/fileqcs/fileQcsController');

// Prometheus monitoring
const collectDefaultMetrics = prometheus.collectDefaultMetrics();
const httpRequestDurationMilliseconds = new prometheus.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['route'],
  buckets: [0.1, 5, 15, 50, 100, 200, 300, 400, 500]
});
const httpRequestCounter = new prometheus.Counter({
  name: 'http_errors',
  help: 'Number of requests for this endpoint',
  labelNames: ['route', 'method', 'status']
});

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500);
  res.json({ 'errors': err.errors });
  res.end();
}

// home page
app.get('/', (req, res) => { res.end(); });

// routes to fileQC records
app.use(bodyParser.json());
app.get('/fileqcs', fileQc.getAllFileQcs);
app.get('/fileqc/:identifier', fileQc.getFileQc);
app.post('/fileqcs', fileQc.addFileQc);
app.post('/fileqcs/batch', fileQc.addManyFileQcs);
app.get('/metrics', (req, res) => {
  res.set('Content-Type', prometheus.register.contentType);
  res.end(prometheus.register.metrics());
});
app.use(errorHandler);
app.use((req, res, next) => {
  const responseTimeInMs = Date.now() - Date.parse(req._startTime);
  httpRequestDurationMilliseconds
    .labels(req.path)
    .observe(responseTimeInMs);
  httpRequestCounter
    .labels(req.path, req.method, res.statusCode)
    .inc();
  next();
});


module.exports = app;

// Start server and listen on port
app.set('port', process.env.PORT || 3000);
const server = app.listen(app.get('port'), () => {
  const host = server.address().address;
  const port = server.address().port;

  console.log('Listening at http://%s:%s', host, port);
});

