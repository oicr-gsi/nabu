DROP TABLE IF EXISTS FileQc;
CREATE TABLE FileQc (
  fileswid bigint PRIMARY KEY,
  project varchar(100) NOT NULL,
  filepath text UNIQUE NOT NULL,
  qcpassed boolean NOT NULL,
  username varchar NOT NULL,
  comment text
);
