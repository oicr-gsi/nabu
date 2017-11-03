DROP DATABASE IF EXISTS qcdb;
CREATE DATABASE qcdb;

\c qcdb;

CREATE TABLE FileQc (
  fileqcid SERIAL PRIMARY KEY,
  project varchar(10) NOT NULL,
  filepath text UNIQUE NOT NULL,
  fileswid bigint UNIQUE NOT NULL,
  qcpassed boolean NOT NULL,
  username varchar NOT NULL,
  comment text
);
