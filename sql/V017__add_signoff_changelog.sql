ALTER TABLE signoff ADD modified TIMESTAMP WITH TIME ZONE DEFAULT (NOW())::TIMESTAMP(0) WITH TIME ZONE NOT NULL;

CREATE TABLE signoff_changelog (
  id SERIAL PRIMARY KEY,
  signoff_id INTEGER,
  columns_changed VARCHAR,
  message VARCHAR,
  change_time TIMESTAMP WITH TIME ZONE
);

CREATE TRIGGER signoff_update
  BEFORE INSERT OR UPDATE
  ON signoff
  FOR EACH ROW
    EXECUTE FUNCTION update_modified();

CREATE OR REPLACE FUNCTION is_changed_bool(val1 boolean, val2 boolean)
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

CREATE OR REPLACE FUNCTION is_changed_txt(val1 text, val2 text)
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

CREATE OR REPLACE FUNCTION make_change_message_txt(field_name varchar(255), before_val text, after_val text)
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


CREATE OR REPLACE FUNCTION make_change_message_bool(field_name varchar(255), before_val boolean, after_val boolean)
  returns varchar
  language plpgsql
AS $$
  BEGIN
    IF is_changed_bool(before_val, after_val) THEN
      RETURN CONCAT(field_name, ': ', (CASE WHEN before_val IS NULL THEN 'n/a' ELSE TO_CHAR(before_val) END), ' → ', (CASE WHEN after_val IS NULL THEN 'n/a' ELSE TO_CHAR(after_val) END));
    ELSE
      RETURN NULL;
    END IF;
  END;
$$;

CREATE OR REPLACE FUNCTION make_change_column_txt(field_name varchar(255), before_val text, after_val text)
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


CREATE OR REPLACE FUNCTION make_change_column_bool(field_name varchar(255), before_val boolean, after_val boolean)
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


CREATE OR REPLACE FUNCTION signoff_changelog_function()
  returns trigger
  language plpgsql
AS $$
    DECLARE message TEXT = '';
  BEGIN
    message:= CONCAT_WS(', ',
      make_change_message('case identifier', OLD.case_identifier, NEW.case_identifier),
      make_change_message_bool('QC passed', OLD.qc_passed, NEW.qc_passed),
      make_change_message('signoff step name', OLD.signoff_step_name, NEW.signoff_step_name),
      make_change_message('deliverable type', OLD.deliverable_type, NEW.deliverable_type),
      make_change_message_txt('comment', OLD.comment, NEW.comment)
    );
    IF message IS NOT NULL AND message <> '' THEN
      INSERT INTO signoff_changelog (signoff_id, columns_changed, message, change_time) VALUES (
      NEW.id,
        COALESCE(CONCAT_WS(',',
          make_change_column('case identifier', OLD.case_identifier, NEW.case_identifier),
          make_change_column_bool('QC passed', OLD.qc_passed, NEW.qc_passed),
          make_change_column('signoff step name', OLD.signoff_step_name, NEW.signoff_step_name),
          make_change_column('deliverable type', OLD.deliverable_type, NEW.deliverable_type),
          make_change_column_txt('comment', OLD.comment, NEW.comment)
        ), ''),
        message,
        NEW.modified
      );
    END IF;
    RETURN NEW;
  END;
$$;


CREATE TRIGGER signoff_changelog_trigger
  BEFORE UPDATE
  ON signoff
  FOR EACH ROW
    EXECUTE FUNCTION signoff_changelog_function();
