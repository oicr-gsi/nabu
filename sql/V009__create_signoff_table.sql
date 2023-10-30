DROP TABLE IF EXISTS signoff;

CREATE TABLE signoff (
  id SERIAL PRIMARY KEY,
  created TIMESTAMP WITH TIME ZONE DEFAULT (NOW())::TIMESTAMP(0) WITH TIME ZONE NOT NULL,
  case_identifier varchar NOT NULL,
  username varchar NOT NULL,
  qc_passed boolean,
  signoff_step_name varchar NOT NULL,
  deliverable_type varchar NOT NULL,
  comment text
);

CREATE UNIQUE INDEX uniq_caseid_signoffstepname_deliverabletype ON signoff (case_identifier, signoff_step_name, deliverable_type);
