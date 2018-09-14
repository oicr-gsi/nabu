# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0)
and this project attempts to adhere to Semantic Versioning.

## [1.5.0]  2018-08-23

### Changed:
  * Update installation instructions
  * Default to returning the single most recent FileQC, but `showAll` query param
    displays all the FileQCs.

### Fixed:
  * File Provenance Report information is now filled in for all FileQCs for a
    single file SWID, not just for the first one

## [1.4.0]  2018-07-31

### Changed:
  * Allow users to save PENDING FileQCs

## [1.3.0]  2018-07-30

### Added:
  * FileQC deletion (note: not actually deleted from database, but won't show up in
    queries)

### Changed:
  * Permit multiple FileQCs for a single file

## [1.2.0]  2018-05-28

### Added:
  * Endpoint `/available` lists all projects and workflows
  * Favicon

## [1.1.0]  2018-05-17

### Added:
  * Better errors for invalid parameters

### Changed:
	* Query param `workflows` -> `workflow`
	* Keep local copy of Flyway instead of downloading from internet every time 

### Fixed
  * Compress responses instead of truncating
  * Increase allowed request body size
