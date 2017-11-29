'use strict';

const prometheus = require('prom-client');

// Prometheus monitoring
prometheus.collectDefaultMetrics();
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

const mostRecentFprImport = new prometheus.Gauge({
  name: 'fpr_most_recent_import',
  help: 'Time (in seconds) that the File Provenance Report was most recently imported'
});

module.exports = {
  httpRequestDurationMilliseconds: httpRequestDurationMilliseconds,
  httpRequestCounter: httpRequestCounter,
  mostRecentFprImport: mostRecentFprImport,
  prometheus: prometheus
};
