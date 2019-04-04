-- add tombstone bit
ALTER TABLE FileQC ADD COLUMN deleted BOOLEAN NOT NULL DEFAULT FALSE;

-- add fileQcId primary key column to FileQC table
ALTER TABLE FileQc DROP CONSTRAINT FileQc_pkey;
ALTER TABLE FileQc ADD COLUMN fileQcId SERIAL PRIMARY KEY;
ALTER TABLE FileQc DROP CONSTRAINT fileqc_filepath_key;
