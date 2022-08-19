-- This script must be run when upgrading from Nabu version 2.1.0 or earlier to 3.0.0 or later, 
-- due to changing from an NPM Flyway jar to a Docker Flyway container, and due to necessary fixes

RENAME TABLE schema_version TO flyway_schema_history;

UPDATE flyway_schema_history SET checksum = '-286862715' WHERE version = '001' AND checksum = '-662107746';
UPDATE flyway_schema_history SET checksum = '1793500263' WHERE version = '002' AND checksum = '282457096';
