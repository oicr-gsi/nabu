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
  files_moved_to_offsite_archive_staging_dir TIMESTAMP WITH TIME ZONE,
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

DROP FUNCTION IF EXISTS is_changed;
CREATE FUNCTION is_changed(val1 varchar(255), val2 varchar(255))
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

DROP FUNCTION IF EXISTS make_change_message;
CREATE FUNCTION make_change_message(field_name varchar(255), before_val varchar(255), afterVal varchar(255))
  returns varchar
  language plpgsql
AS $$
  BEGIN
    IF is_changed(before_val, afterVal) THEN
      RETURN CONCAT(field_name, ': ', COALESCE(before_val, 'n/a'), ' → ', COALESCE(afterVal, 'n/a'));
    ELSE
      RETURN NULL;
    END IF;
  END;
$$;

DROP FUNCTION IF EXISTS make_change_column;
CREATE FUNCTION make_change_column(field_name varchar(255), before_val varchar(255), afterVal varchar(255))
  returns varchar(255)
  language plpgsql
AS $$
  BEGIN
    IF is_changed(before_val, afterVal) THEN
      RETURN field_name;
    ELSE
      RETURN NULL;
    END IF;
  END;
$$;

DROP FUNCTION IF EXISTS archive_changelog_function;
CREATE FUNCTION archive_changelog_function()
  returns trigger
  language plpgsql
AS $$
    DECLARE message TEXT = '';
  BEGIN
    message:= CONCAT_WS(', ',
      make_change_message('backup job ID', OLD.commvault_backup_job_id, NEW.commvault_backup_job_id),
      make_change_message('workflow run IDs for offsite archive', OLD.workflow_run_ids_for_offsite_archive, NEW.workflow_run_ids_for_offsite_archive),
      make_change_message('files moved to offsite dir', OLD.files_moved_to_offsite_dir, NEW.files_moved_to_offsite_dir),
      make_change_message('files loaded into vidarr-archival', OLD.files_loaded_into_vidarr_archival, NEW.files_loaded_into_vidarr_archival),
      make_change_message('workflow run IDs for vidarr-archival', OLD.workflow_run_ids_for_vidarr_archival, NEW.workflow_run_ids_for_vidarr_archival),
      make_change_message('case files unloaded', OLD.case_files_unloaded, NEW.case_files_unloaded)
    );
    IF message IS NOT NULL AND message <> '' THEN
      INSERT INTO archive_changelog(archive_id, columns_changed, message, change_time) VALUES (
      NEW.id,
        COALESCE(CONCAT_WS(',',
         make_change_column('backup job ID', OLD.commvault_backup_job_id, NEW.commvault_backup_job_id),
         make_change_column('workflow run IDs for offsite archive', OLD.workflow_run_ids_for_offsite_archive, NEW.workflow_run_ids_for_offsite_archive),
         make_change_column('files moved to offsite dir', OLD.files_moved_to_offsite_dir, NEW.files_moved_to_offsite_dir),
         make_change_column('files loaded into vidarr-archival', OLD.files_loaded_into_vidarr_archival, NEW.files_loaded_into_vidarr_archival),
         make_change_column('workflow run IDs for vidarr-archival', OLD.workflow_run_ids_for_vidarr_archival, NEW.workflow_run_ids_for_vidarr_archival),
         make_change_column('case files unloaded', OLD.case_files_unloaded, NEW.case_files_unloaded)
        ), ''),
        message,
        NEW.modified
      );
    END IF;
  END;
$$;


CREATE TRIGGER archive_changelog_trigger
  BEFORE UPDATE
  ON archive
  FOR EACH ROW
    EXECUTE PROCEDURE archive_changelog_function();
