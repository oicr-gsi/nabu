# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0)
and this project attempts to adhere to Semantic Versioning.

## Unreleased

### Added
  * Users can now search by `run` and get back all FileQCs for BamQC files in that run.

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
