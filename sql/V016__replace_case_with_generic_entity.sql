ALTER TABLE archive DROP CONSTRAINT IF EXISTS archive_case_id_fkey;

ALTER TABLE archive RENAME COLUMN case_id TO archive_entity_id;
ALTER TABLE archive RENAME COLUMN case_files_unloaded TO files_unloaded;

ALTER INDEX cardea_case_pkey RENAME TO archive_entity_pkey;
ALTER INDEX cardea_case_case_identifier_key RENAME TO archive_entity_entity_identifier_key;
ALTER TABLE IF EXISTS cardea_case RENAME COLUMN case_identifier TO entity_identifier;
ALTER TABLE IF EXISTS cardea_case ADD COLUMN entity_type VARCHAR NOT NULL DEFAULT 'CASE';
ALTER TABLE IF EXISTS cardea_case RENAME TO archive_entity;

ALTER TABLE archive ADD CONSTRAINT archive_entity_id_fkey FOREIGN KEY (archive_entity_id) REFERENCES archive_entity(id);

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
      make_change_message_ts('files unloaded', OLD.files_unloaded, NEW.files_unloaded)
    );
    IF message IS NOT NULL AND message <> '' THEN
      INSERT INTO archive_changelog(archive_id, columns_changed, message, change_time) VALUES (
      NEW.id,
        COALESCE(CONCAT_WS(',',
         make_change_column('backup job ID', OLD.commvault_backup_job_id, NEW.commvault_backup_job_id),
         make_change_column_ts('files copied to offsite dir', OLD.files_copied_to_offsite_archive_staging_dir, NEW.files_copied_to_offsite_archive_staging_dir),
         make_change_column_ts('files loaded into vidarr-archival', OLD.files_loaded_into_vidarr_archival, NEW.files_loaded_into_vidarr_archival),
         make_change_column_ts('files unloaded', OLD.files_unloaded, NEW.files_unloaded)
        ), ''),
        message,
        NEW.modified
      );
    END IF;
    RETURN NEW;
  END;
$$;
