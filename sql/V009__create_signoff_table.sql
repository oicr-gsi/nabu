DROP TABLE IF EXISTS signoff;

CREATE TABLE signoff (
  id SERIAL PRIMARY KEY,
  created TIMESTAMP WITH TIME ZONE DEFAULT (NOW())::TIMESTAMP(0) WITH TIME ZONE NOT NULL,
  case_identifier varchar NOT NULL,
  username varchar NOT NULL,
  qc_passed boolean NOT NULL,
  signoff_step_name varchar NOT NULL,
  deliverable_type varchar NOT NULL,
  comment text
);

--ALTER TABLE signoff ADD CONSTRAINT signoff_case_id_fkey FOREIGN KEY (case_id) REFERENCES cardea_case(id);
