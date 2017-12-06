.open fpr.db

BEGIN;
DROP TABLE IF EXISTS fpr;
CREATE TABLE fpr (
  fileswid BIGINT PRIMARY KEY,
  filepath TEXT NOT NULL,
  skip BOOLEAN NOT NULL,
  stalestatus TEXT NOT NULL,
  project TEXT NOT NULL,
  upstream INTEGER[]
);

.mode tabs
.import fpr-latest.tsv fpr

CREATE TABLE IF NOT EXISTS fpr_import_time (
  lastimported TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

INSERT INTO fpr_import_time (lastimported) VALUES (CURRENT_TIMESTAMP);

-- set empty strings to null
UPDATE fpr SET upstream = NULL WHERE upstream = '';

COMMIT;
