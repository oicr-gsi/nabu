.open fpr_test.db

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
.import fpr-test.tsv fpr

-- set empty strings to null
UPDATE fpr SET upstream = NULL WHERE upstream = '';

COMMIT;
