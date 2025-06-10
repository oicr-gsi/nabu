# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0)
and this project attempts to adhere to Semantic Versioning.

## UNRELEASED

### Added

* Improve data validation for case archive fields

## 3.12.0: [2025-06-10]

### Added

* `archiveWith`, `archiveTarget`, `batchId`, `stopProcessing` fields for case archive
  * if a case archive is resubmitted with changed data and the case has already begun archiving, the case will be set to `stopProcessing` and monitoring will be updated
* `/case/<caseIdentifier>/resume-archiving` endpoint to manually resume archiving if a data mismatch had caused the case to be set to `stopProcessing` and the data mismatch has been resolved

### Changed

* URL `/case/<caseIdentifier>/copied-to-offsite-staging` for marking that a case has been copied to the offsite staging directory now takes a request body with two keys: 
  * `batchId`, the archiving batch ID,
  * `copyOutFile`, the contents of the Vidarr copy-out file for the case
* Improve error messages

### Fixed

* Prometheus HTTP monitoring

## 3.11.0: [2025-05-07]

### Added

* metadata column to archive table

## 3.10.0: [2024-12-16]

### Changed

* Add optional release status (boolean) to sign-off records
* Dependency updates

## 3.9.0: [2024-09-16]

### Changed

* An API key is required to submit a new case (endpoint `/case/` POST)

### Fixed

* Security updates for dependencies

## 3.8.0: [2024-05-28]

### Changed

* Case Archiving now supports a single archive for each case ID 

## 3.7.1: [2024-02-26]

### Fixed

* Deliverable was not being saved for release sign-offs

## 3.7.0: [2024-02-22]

### Fixed

* If no api-key is provided the user will get an Authentication Error

### Added

* Sign-off records now require a `deliverable` field if the stepName is Release

## 3.6.0: [2024-01-03]

### Added

* All sign-off records can be retrieved at endpoint `/case/sign-off`

### Fixed

* An api-key can be generated without authentication if no existing keys exist


## 3.5.0 [2023--11-15]

### Added

* Sign-off records can be added at endpoint `/case/{caseIdentifier}/sign-off`
* Sign-off records can be retrieved at endpoint `/case/{caseIdentifier}/sign-off`
* New endpoints require api-key in header for authorization
* Sign-off records can be bulk added at endpoint `/case/sign-off`

## 3.4.0 [2023-10-24]

### Added

* Ability to request Vidarr metadata for a case

### Changed

* Standardized URLs: used same URL components for querying by "not completed a step" as "write back to indicate step is complete"

### Fixed

* Can now query by optional "not" steps in `/cases` endpoint

## 3.3.0: [2023-09-25]

### Added

* Ability to query for case archives that have not completed various steps of the archiving process

## 3.2.0: [2023-08-15]

### Added

* Validation that Vidarr unload files are included in requests that require them

### Changed

* Allow case archives to have their LIMS IDs updated if case has not yet been sent to archiving staging directory

## 3.1.0: [2023-07-14]

### Added

* FileQC `alert` property to OpenAPI documentation
* Requirement for Node.js version 18+ 
* Storage of case archive information, including the ability to add, retrieve, and update case archives
* Streaming endpoint for case archive information

## 3.0.1: [2023-01-05]

### Fixed

* Re-added GET `/fileqcs-only` endpoint
* Fixed `/metrics` endpoint throwing an error

## 3.0.0 [2022-11-09]

Nabu has been updated to track [Vidarr](https://github.com/oicr-gsi/vidarr) File IDs. It is still possible to search for existing Niassa File SWIDs, and the migrations for this version will upgrade Niassa File QCs to Vidarr File QCs, assuming the Niassa data was migrated to Vidarr. 


### New endpoints

See `swagger.json` or `/api-docs` for full details
* Get File QCs endpoint: `POST /get-fileqcs`
  * Available filters: 
    * project
    * fileids
    * fileswids
    * workflow
    * qcstatus
* Add File QCs endpoint: `POST /add-fileqcs`
  * required fields:
    * project
    * qcpassed
    * username
    * fileid
  * optional:
    * comment
    * fileswid
* Delete File QCs endpoint: `POST /delete-fileqcs`
  * To reset a file's QC value back to PENDING, delete the File QC for that file ID.
  
### Vidarr-specific changes:

* Since Vidarr writes files out to deterministic locations, Nabu stores the Vidarr file ID and md5sum. 
  * _If the md5sum of the file currently in the FPR is different from the md5sum of the file that was QCed_, the File QC response will include an `alert` attribute that details the value of the QCed file's md5sum and the current FPR file's md5sum
* Nabu will now store only one File QC per file ID, and will update that File QC's status when a new File QC is added.

### Server changes

All Nabu installations should use a proxy server like nginx or Apache in front of Nabu.


### Upgrade Process
1. Add `flyway.table=schema_version` to the `conf/flyway.conf` file as the newer version of Flyway will by default track migration history in a differently-named table
1. Migrations `V001__create_fileqc_table.sql` and `V002__add_qcDate.sql` were updated to remove hardcoded variables, so the checksums will need to be fixed:

  ```
  SOURCE $NABU/.env

  PGPASSWORD="$DB_PW" psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" "$DB_NAME" -c "UPDATE schema_version SET checksum = '-286862715' WHERE checksum = '-662107746';"
  PGPASSWORD="$DB_PW" psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" "$DB_NAME" -c "UPDATE schema_version SET checksum = '1793500263' WHERE checksum = '282457096';"
  ```

1. Run the migration: `npm run fw:migrate`
1. Run a one-time script to add a Vidarr File ID and md5sum to all FileQC records where the FileQC's `fileswid` matches the Vidarr file provenance record's File Attributes File SWID.
  * Download the Vidarr FPR to "$SQLITE_LOCATION" directory (specified in `.env`). Ensure this is the only gzipped file in that directory.
  * Create a SQL file with the update statements:
    
    ```
    source $NABU/.env

    zcat "${SQLITE_LOCATION}"/*.tsv.gz | \
    awk -F'\t' -v OFS='\t' '!seen[$45] && NR>1 { print $45,$48,$31,$47,$46; seen[$45] = 1; }' | \
    awk -F'\t' -v OFS='\t' '{ if ($5~/niassa-file-accession/) print $1,$2,$3,$4,$5 }' | \
    awk -F'\t' -v OFS='\t' '{ $5=gensub(/.*niassa-file-accession=([0-9]+).*/,"\\1","1",$5); print $1,$2,$3,$4,$5 }' | \
    sort | uniq | \
    awk -F'\t' -v qu="'" '{ if ($5) print "UPDATE fileqc SET fileid = " qu $1 qu ", md5sum = " qu $2 qu ", workflow = " qu $3 qu ", filepath = " qu $4 qu " WHERE fileswid = " qu $5 qu ";" }' > add_fileid_to_fileqc_table.sql
    ```

  * Run the update:

    ```
    PGPASSWORD="$DB_PW" psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" "$DB_NAME" --single-transaction -f add_fileid_to_fileqc_table.sql
    ```

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
