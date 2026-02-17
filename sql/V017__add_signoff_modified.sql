ALTER TABLE signoff ALTER COLUMN created TYPE TIMESTAMP(3) WITH TIME ZONE;
ALTER TABLE signoff ALTER COLUMN created SET DEFAULT NOW();

ALTER TABLE signoff ADD modified TIMESTAMP WITH TIME ZONE;
UPDATE signoff SET modified = created;
ALTER TABLE signoff ALTER COLUMN modified SET NOT NULL;
ALTER TABLE signoff ALTER COLUMN modified SET DEFAULT (NOW())::TIMESTAMP(3) WITH TIME ZONE;

DROP INDEX uniq_caseid_signoffstepname_deliverabletype_deliverable;
CREATE UNIQUE INDEX uniq_created_caseid_signoffstepname_deliverabletype_deliverable ON signoff (created, case_identifier, signoff_step_name, deliverable_type, deliverable);

CREATE TRIGGER signoff_update
  BEFORE INSERT OR UPDATE
  ON signoff
  FOR EACH ROW
    EXECUTE FUNCTION update_modified();