DROP TABLE IF EXISTS token;

CREATE TABLE token (
  auth_token varchar PRIMARY KEY,
  auth_id varchar UNIQUE NOT NULL,
  created TIMESTAMP WITH TIME ZONE DEFAULT (NOW())::TIMESTAMP(0) WITH TIME ZONE NOT NULL,
  username varchar NOT NULL
);