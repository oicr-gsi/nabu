.open fpr.db

BEGIN;
DROP TABLE IF EXISTS fpr;
CREATE TABLE fpr (
  fileid TEXT PRIMARY KEY,
  fileswid TEXT,
  filepath TEXT NOT NULL,
  md5sum TEXT NOT NULL,
  skip BOOLEAN NOT NULL,
  stalestatus TEXT NOT NULL,
  project TEXT NOT NULL,
  upstream TEXT[],
  workflow TEXT NOT NULL,
  library TEXT NOT NULL,
  run TEXT NOT NULL,
  lane INTEGER NOT NULL
);

.mode tabs
.import fpr-latest.tsv fpr

CREATE TABLE IF NOT EXISTS fpr_import_time (
  lastimported TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

INSERT INTO fpr_import_time (lastimported) VALUES (CURRENT_TIMESTAMP);

-- set empty strings to null
UPDATE fpr SET upstream = NULL WHERE upstream = '';
UPDATE fpr SET fileswid = NULL WHERE fileswid = '';

COMMIT;
