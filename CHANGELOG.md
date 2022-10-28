# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0)
and this project attempts to adhere to Semantic Versioning.

## UNRELEASED

Nabu has been updated to track [Vidarr](https://github.com/oicr-gsi/vidarr) File IDs. It is still possible to search for existing Niassa File SWIDs, and the migrations for this version will upgrade Niassa File QCs to Vidarr File QCs, assuming the Niassa data was migrated to Vidarr. The API has changed significantly to reflect this; see `swagger.json` for details.

### Upgrade Notes
1. Add `flyway.table=schema_version` to the `conf/flyway.conf` file as the newer version of Flyway will by default track migration history in a differently-named table
1. Migrations `V001__create_fileqc_table.sql` and `V002__add_qcDate.sql` were updated to remove hardcoded variables, so the checksums will need to be fixed:
  ```
  UPDATE schema_version SET checksum = '-286862715' WHERE checksum = '-662107746';
  UPDATE schema_version SET checksum = '1793500263' WHERE checksum = '282457096';
  ```
1. Run the migration: `npm run fw:migrate`
1. Run a one-time script to add a Vidarr File ID and md5sum to all FileQC records where the FileQC's `fileswid` matches the Vidarr file provenance record's File Attributes File SWID.
  * Download the Vidarr FPR to "$SQLITE_LOCATION" directory (specified in `.env`). Ensure this is the only gzipped file in that directory.
  * Create a SQL file with the update statements:
    
    ```
    source $NABU/.env

    zcat "${SQLITE_LOCATION}"/*.tsv.gz | \  
    awk -F'\t' -v OFS='\t' '!seen[$45] && NR>1 { print $45,$48,$31,$46; seen[$45] = 1; }' | \  
    awk -F'\t' -v OFS='\t' '{ if ($4~/niassa-file-accession/) print $1,$2,$3,$4 }' | \  
    awk -F'\t' -v OFS='\t' '{ $4=gensub(/.*niassa-file-accession=([0-9]+).*/,"\\1","1",$4); print $1,$2,$3,$4 }' | \  
    sort | uniq | \  
    awk -F'\t' -v qu="'" '{ if ($4) print "UPDATE fileqc SET fileid = " qu $1 qu ", md5sum = " qu $2 qu ", workflow = " qu $3 qu " WHERE fileswid = " qu $4 qu ";" }' > add_fileid_to_fileqc_table.sql
    ```

  * Run the update:

    ```
    PGPASSWORD="$DB_PW" psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" "$DB_NAME" --single-transaction -f add_fileid_to_fileqc_table.sql
    ```

* It is recommended to use a proxy server like nginx or Apache in front of Nabu.

## [2.0.0]  2018-09-14

### Added:
  * Endpoint `/fileqcs-only` returns a stream of all FileQCs.
    * Note that these FileQCs lack some File Provenance Report data like
      `stalestatus`, `skip`, and `upstream`.
  * A changelog.

### Changed:
  * Endpoint `DELETE /fileqcs` changed to `POST /delete-fileqcs`.
    * The request body format remains the same.
  * Update Swagger documentation.
  * Endpoints now return either data or errors, but not both.

### Fixed:
  * Projects with many files no longer error.
  * Fix issue where QC status `PENDING` was sometimes displayed as `FAIL`.

## [1.5.0]  2018-08-23

### Changed:
  * Update installation instructions.
  * Default to returning the single most recent FileQC, but `showAll` query param.
    displays all the FileQCs.

### Fixed:
  * File Provenance Report information is now filled in for all FileQCs for a
    single file SWID, not just for the first one.

## [1.4.0]  2018-07-31

### Changed:
  * Allow users to save PENDING FileQCs.

## [1.3.0]  2018-07-30

### Added:
  * FileQC deletion (note: not actually deleted from database, but won't show up in
    queries).

### Changed:
  * Permit multiple FileQCs for a single file.

## [1.2.0]  2018-05-28

### Added:
  * Endpoint `/available` lists all projects and workflows.
  * Favicon.

## [1.1.0]  2018-05-17

### Added:
  * Better errors for invalid parameters.

### Changed:
	* Query param `workflows` -> `workflow`.
	* Keep local copy of Flyway instead of downloading from internet every time .

### Fixed
  * Compress large responses instead of truncating.
  * Increase allowed request body size.
