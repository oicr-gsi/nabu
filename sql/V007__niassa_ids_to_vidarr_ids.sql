-- a fileswid listed in a fileqc row might not have been migrated to Vidarr, so use a default
CREATE SEQUENCE fileid_seq;
ALTER TABLE fileqc ADD COLUMN fileid VARCHAR(100) NOT NULL DEFAULT nextval('fileid_seq'::regclass)::VARCHAR;
CREATE INDEX IF NOT EXISTS fileid_index ON FileQc (fileid);

ALTER TABLE fileqc ADD COLUMN md5sum VARCHAR(100) NOT NULL;

-- going forward, fileqc records won't have fileswids, so make this column nullable
ALTER TABLE fileqc ALTER COLUMN fileswid DROP NOT NULL;
