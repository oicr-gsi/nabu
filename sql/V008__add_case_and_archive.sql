CREATE FUNCTION update_modified()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
  BEGIN
    NEW.modified = now()::timestamptz(0);
    RETURN NEW;
  END;
$$;

CREATE TABLE cardea_case (
  id SERIAL PRIMARY KEY,
  case_identifier VARCHAR,
  requisition_id INTEGER,
  lims_ids VARCHAR[]
);

CREATE TABLE archive (
  id SERIAL PRIMARY KEY,
  created TIMESTAMP WITH TIME ZONE DEFAULT (NOW())::TIMESTAMP(0) WITH TIME ZONE NOT NULL,
  modified TIMESTAMP WITH TIME ZONE NOT NULL,
  case_id INTEGER NOT NULL,
  workflow_run_ids_for_offsite_archive VARCHAR[],
  unload_file_for_offsite_archive JSONB,
  files_copied_to_offsite_archive_staging_dir TIMESTAMP WITH TIME ZONE,
  commvault_backup_job_id VARCHAR,
  workflow_run_ids_for_vidarr_archival VARCHAR[],
  unload_file_for_vidarr_archival JSONB,
  files_loaded_into_vidarr_archival TIMESTAMP WITH TIME ZONE,
  case_files_unloaded TIMESTAMP WITH TIME ZONE
);

CREATE TABLE archive_changelog (
  id SERIAL PRIMARY KEY,
  archive_id INTEGER,
  columns_changed VARCHAR,
  message VARCHAR,
  change_time TIMESTAMP WITH TIME ZONE
);

ALTER TABLE cardea_case ADD CONSTRAINT cardea_case_case_identifier_key UNIQUE (case_identifier);

ALTER TABLE archive ADD CONSTRAINT archive_case_id_fkey FOREIGN KEY (case_id) REFERENCES cardea_case(id);

ALTER TABLE archive_changelog ADD CONSTRAINT archive_changelog_archive_id_fkey FOREIGN KEY (archive_id) REFERENCES archive(id);

CREATE TRIGGER archive_update
  BEFORE INSERT OR UPDATE
  ON archive
  FOR EACH ROW
    EXECUTE FUNCTION update_modified();

CREATE OR REPLACE FUNCTION is_changed(val1 varchar(255), val2 varchar(255))
  returns boolean
  language plpgsql
AS $$
  BEGIN
    IF (val1 IS NULL) <> (val2 IS NULL) THEN
      RETURN TRUE;
    ELSEIF val1 IS NULL AND val2 IS NULL THEN
      RETURN FALSE;
    ELSE
      RETURN val1 <> val2;
    END IF;
  END;
$$;

CREATE OR REPLACE FUNCTION is_changed_ts(val1 timestamp with time zone, val2 timestamp with time zone)
  returns boolean
  language plpgsql
AS $$
  BEGIN
    IF (val1 IS NULL) <> (val2 IS NULL) THEN
      RETURN TRUE;
    ELSEIF val1 IS NULL AND val2 IS NULL THEN
      RETURN FALSE;
    ELSE
      RETURN val1 <> val2;
    END IF;
  END;
$$;

CREATE OR REPLACE FUNCTION make_change_message(field_name varchar(255), before_val varchar(255), after_val varchar(255))
  returns varchar
  language plpgsql
AS $$
  BEGIN
    IF is_changed(before_val, after_val) THEN
      RETURN CONCAT(field_name, ': ', COALESCE(before_val, 'n/a'), ' → ', COALESCE(after_val, 'n/a'));
    ELSE
      RETURN NULL;
    END IF;
  END;
$$;

CREATE OR REPLACE FUNCTION make_change_message_ts(field_name varchar(255), before_val timestamp with time zone, after_val timestamp with time zone)
  returns varchar
  language plpgsql
AS $$
  BEGIN
    IF is_changed_ts(before_val, after_val) THEN
      RETURN CONCAT(field_name, ': ', (CASE WHEN before_val IS NULL THEN 'n/a' ELSE TO_CHAR(before_val, 'YYYY/MM/DD HH:MM:SS') END), ' → ', (CASE WHEN after_val IS NULL THEN 'n/a' ELSE TO_CHAR(after_val, 'YYYY/MM/DD HH:MM:SS') END));
    ELSE
      RETURN NULL;
    END IF;
  END;
$$;

CREATE OR REPLACE FUNCTION make_change_column(field_name varchar(255), before_val varchar(255), after_val varchar(255))
  returns varchar(255)
  language plpgsql
AS $$
  BEGIN
    IF is_changed(before_val, after_val) THEN
      RETURN field_name;
    ELSE
      RETURN NULL;
    END IF;
  END;
$$;

CREATE OR REPLACE FUNCTION make_change_column_ts(field_name varchar(255), before_val timestamp with time zone, after_val timestamp with time zone)
  returns varchar(255)
  language plpgsql
AS $$
  BEGIN
    IF is_changed_ts(before_val, after_val) THEN
      RETURN field_name;
    ELSE
      RETURN NULL;
    END IF;
  END;
$$;


CREATE OR REPLACE FUNCTION archive_changelog_function()
  returns trigger
  language plpgsql
AS $$
    DECLARE message TEXT = '';
  BEGIN
    message:= CONCAT_WS(', ',
      make_change_message('backup job ID', OLD.commvault_backup_job_id, NEW.commvault_backup_job_id),
      make_change_message_ts('files copied to offsite dir', OLD.files_copied_to_offsite_archive_staging_dir, NEW.files_copied_to_offsite_archive_staging_dir),
      make_change_message_ts('files loaded into vidarr-archival', OLD.files_loaded_into_vidarr_archival, NEW.files_loaded_into_vidarr_archival),
      make_change_message_ts('case files unloaded', OLD.case_files_unloaded, NEW.case_files_unloaded)
    );
    IF message IS NOT NULL AND message <> '' THEN
      INSERT INTO archive_changelog(archive_id, columns_changed, message, change_time) VALUES (
      NEW.id,
        COALESCE(CONCAT_WS(',',
         make_change_column('backup job ID', OLD.commvault_backup_job_id, NEW.commvault_backup_job_id),
         make_change_column_ts('files copied to offsite dir', OLD.files_copied_to_offsite_archive_staging_dir, NEW.files_copied_to_offsite_archive_staging_dir),
         make_change_column_ts('files loaded into vidarr-archival', OLD.files_loaded_into_vidarr_archival, NEW.files_loaded_into_vidarr_archival),
         make_change_column_ts('case files unloaded', OLD.case_files_unloaded, NEW.case_files_unloaded)
        ), ''),
        message,
        NEW.modified
      );
    END IF;
    RETURN NEW;
  END;
$$;


CREATE TRIGGER archive_changelog_trigger
  BEFORE UPDATE
  ON archive
  FOR EACH ROW
    EXECUTE FUNCTION archive_changelog_function();
