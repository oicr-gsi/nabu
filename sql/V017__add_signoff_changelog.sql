ALTER TABLE signoff ADD modified TIMESTAMP WITH TIME ZONE DEFAULT (NOW())::TIMESTAMP(0) WITH TIME ZONE NOT NULL;
ALTER TABLE signoff ALTER COLUMN created TYPE TIMESTAMP(3) WITH TIME ZONE;
ALTER TABLE signoff ALTER COLUMN created SET DEFAULT NOW();
ALTER TABLE archive DROP CONSTRAINT IF EXISTS uniq_caseid_signoffstepname_deliverabletype;
CREATE UNIQUE INDEX uniq_created_caseid_signoffstepname_deliverabletype_deliverable ON signoff (created, case_identifier, signoff_step_name, deliverable_type, deliverable);

CREATE TRIGGER signoff_update
  BEFORE INSERT OR UPDATE
  ON signoff
  FOR EACH ROW
    EXECUTE FUNCTION update_modified();