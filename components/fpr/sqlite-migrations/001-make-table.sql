---------------------------------------
-- Up
---------------------------------------

CREATE TABLE fpr (
  fileswid BIGINT PRIMARY KEY,
  filepath TEXT NOT NULL,
  skip BOOLEAN NOT NULL,
  status TEXT NOT NULL,
  project TEXT NOT NULL
);

.mode tsv
.import fpr.tsv fpr
