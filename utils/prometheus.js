'use strict';

const prometheus = require('prom-client');

// Prometheus monitoring
prometheus.collectDefaultMetrics();

const mostRecentFprImport = new prometheus.Gauge({
  name: 'fpr_most_recent_import',
  help:
    'Time (in seconds) that the File Provenance Report was most recently imported',
});

module.exports = {
  mostRecentFprImport: mostRecentFprImport,
  prometheus: prometheus,
};
