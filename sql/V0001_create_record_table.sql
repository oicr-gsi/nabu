DROP DATABASE IF EXISTS qcdb;
CREATE DATABASE qcdb;

\c qcdb;

CREATE TABLE FileQc (
  fileQcId SERIAL PRIMARY KEY,
  project varchar(10) NOT NULL,
  filePath text UNIQUE NOT NULL,
  fileSWID bigint UNIQUE NOT NULL,
  qcPassed boolean NOT NULL,
  username varchar NOT NULL,
  why text
);
