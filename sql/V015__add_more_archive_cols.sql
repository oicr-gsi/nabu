ALTER TABLE archive ADD COLUMN archive_target text NOT NULL DEFAULT 'NOT_SPECIFIED';
ALTER TABLE archive ADD COLUMN archive_with text[] NOT NULL DEFAULT '{}';
ALTER TABLE archive ADD COLUMN batch_id text;
ALTER TABLE archive ADD COLUMN stop_processing boolean DEFAULT false;
