-- fileqc records now will update instead of adding new fileqcs each time.
-- keep only the most recent fileqc record for each fileid
DELETE FROM fileqc WHERE qcdate <> 
  (SELECT MAX(qcdate) FROM fileqc f2
    WHERE f2.fileswid = fileqc.fileswid);
-- and then another select in case of exact timestamp matches
DELETE FROM fileqc WHERE fileqcid <> 
  (SELECT MAX(fileqcid) FROM fileqc f2
    WHERE f2.fileswid = fileqc.fileswid);

-- a fileswid listed in a fileqc row might not have been migrated to Vidarr, so use a default
CREATE SEQUENCE fileid_seq;
ALTER TABLE fileqc ADD COLUMN fileid VARCHAR(100) NOT NULL DEFAULT nextval('fileid_seq'::regclass)::VARCHAR;

CREATE UNIQUE INDEX IF NOT EXISTS fileid_unique_index ON FileQc (fileid);

ALTER TABLE fileqc ADD COLUMN md5sum VARCHAR(100);

ALTER TABLE fileqc ADD COLUMN workflow VARCHAR(100) NOT NULL DEFAULT 'workflow';

-- going forward, fileqc records won't have fileswids, so make this column nullable
ALTER TABLE fileqc ALTER COLUMN fileswid DROP NOT NULL;

CREATE TABLE deletionlog (
  deletionid SERIAL PRIMARY KEY,
  fileid VARCHAR(100) NOT NULL,
  username VARCHAR(100) NOT NULL,
  deleteddate TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- populate the deletion log with fileqcs that have already been deleted, then delete them from the table
INSERT INTO deletionlog (fileid, username)
  SELECT fileid, username FROM fileqc
    WHERE deleted IS TRUE;

DELETE FROM fileqc WHERE deleted IS TRUE;

ALTER TABLE fileqc DROP COLUMN deleted;