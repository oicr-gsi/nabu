ALTER TABLE archive DROP CONSTRAINT IF EXISTS archive_entity_id_fkey;
ALTER TABLE archive ADD CONSTRAINT archive_entity_id_fkey FOREIGN KEY (archive_entity_id) REFERENCES archive_entity(id) ON DELETE CASCADE;

ALTER TABLE archive_changelog DROP CONSTRAINT IF EXISTS archive_changelog_archive_id_fkey;
ALTER TABLE archive_changelog ADD CONSTRAINT archive_changelog_archive_id_fkey FOREIGN KEY (archive_id) REFERENCES archive(id) ON DELETE CASCADE;
