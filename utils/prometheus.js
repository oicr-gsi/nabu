'use strict';

const prometheus = require('prom-client');

// Prometheus monitoring
prometheus.collectDefaultMetrics();
const httpRequestDurationMilliseconds = new prometheus.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['route'],
  buckets: [0.1, 5, 15, 50, 100, 200, 300, 400, 500],
});

const httpRequestCounter = new prometheus.Counter({
  name: 'http_request_counter',
  help: 'Number of requests for this endpoint',
  labelNames: ['route', 'method', 'status'],
});


const mostRecentFprImport = new prometheus.Gauge({
  name: 'fpr_most_recent_import',
  help:
    'Time (in seconds) that the File Provenance Report was most recently imported',
});

const monitorAfterRequest = (req, res, next) => {
  res.on('finish', () => {
    // log metrics after every request
    // req.route.path is the abstracted form, like '/case/:identifier'
    const path = req.route ? req.route.path : req.originalUrl;
    if (Object.prototype.hasOwnProperty.call(req, '_startTime')) {
      // if it doesn't, it's due to a user URL entry error causing the request to be cut short
      const responseTimeInMs = Date.now() - Date.parse(req._startTime);
      httpRequestDurationMilliseconds.labels(path).observe(responseTimeInMs);
    }
    httpRequestCounter.inc({'route': path, 'method': req.method, 'status': res.statusCode});
  });
  next();
};

module.exports = {
  httpRequestDurationMilliseconds: httpRequestDurationMilliseconds,
  httpRequestCounter: httpRequestCounter,
  mostRecentFprImport: mostRecentFprImport,
  monitorAfterRequest: monitorAfterRequest,
  prometheus: prometheus,
};
