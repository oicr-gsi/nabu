.open fpr.db

BEGIN;
DROP TABLE IF EXISTS fpr;
CREATE TABLE fpr (
  fileswid BIGINT PRIMARY KEY,
  filepath TEXT NOT NULL,
  skip BOOLEAN NOT NULL,
  status TEXT NOT NULL,
  project TEXT NOT NULL
);

.mode tabs
.import fpr-latest.tsv fpr

COMMIT;

SELECT * from fpr limit 3;
