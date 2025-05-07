ALTER TABLE archive ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb;
    
CREATE OR REPLACE FUNCTION is_changed_jsonb(val1 jsonb, val2 jsonb)
  returns boolean
  language plpgsql
AS $$
  BEGIN
    IF val1 @> val2 AND val2 @> val1
    THEN
      RETURN FALSE;
    ELSE
      RETURN TRUE;
    END IF;
  END;
$$;

CREATE OR REPLACE FUNCTION make_change_message_jsonb(field_name varchar(255), before_val jsonb, after_val jsonb)
  returns varchar
  language plpgsql
AS $$
    DECLARE
      result jsonb;
      empty jsonb = '{}'::jsonb;
  BEGIN
    IF NOT is_changed_jsonb(before_val, after_val)
    THEN
      RETURN NULL;
    ELSIF (before_val IS NULL OR jsonb_typeof(before_val) = 'null' OR before_val = empty) AND after_val <> empty
    THEN
      RETURN CONCAT(field_name, ': n/a  →  ', after_val::text);
    ELSIF after_val IS NULL OR jsonb_typeof(after_val) = 'null' OR after_val = empty
    THEN
      RETURN CONCAT(field_name, ': ', before_val::text, ' →  n/a');
    END IF;

    RETURN CONCAT(field_name, ': ', before_val::text, ' →  ', after_val::text);
  END;
$$;

CREATE OR REPLACE FUNCTION make_change_column_jsonb(field_name varchar(255), before_val jsonb, after_val jsonb)
  returns varchar(255)
  language plpgsql
AS $$
  BEGIN
    IF is_changed_jsonb(before_val, after_val)
    THEN
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
      make_change_message_ts('case files unloaded', OLD.case_files_unloaded, NEW.case_files_unloaded),
      make_change_message_jsonb('archiving metadata', OLD.metadata, NEW.metadata)
    );
    IF message IS NOT NULL AND message <> '' THEN
      INSERT INTO archive_changelog(archive_id, columns_changed, message, change_time) VALUES (
      NEW.id,
        COALESCE(CONCAT_WS(',',
         make_change_column('backup job ID', OLD.commvault_backup_job_id, NEW.commvault_backup_job_id),
         make_change_column_ts('files copied to offsite dir', OLD.files_copied_to_offsite_archive_staging_dir, NEW.files_copied_to_offsite_archive_staging_dir),
         make_change_column_ts('files loaded into vidarr-archival', OLD.files_loaded_into_vidarr_archival, NEW.files_loaded_into_vidarr_archival),
         make_change_column_ts('case files unloaded', OLD.case_files_unloaded, NEW.case_files_unloaded),
	 make_change_column_jsonb('archiving metadata', OLD.metadata, NEW.metadata)
        ), ''),
        message,
        NEW.modified
      );
    END IF;
    RETURN NEW;
  END;
$$;

