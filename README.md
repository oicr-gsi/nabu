[![Build Status](https://travis-ci.org/oicr-gsi/nabu.svg)](https://travis-ci.org/oicr-gsi/nabu)

> Nabu was the Babylonian and Assyrian god of scribes, literacy, and wisdom.

# Getting started

## Requirements
  * Node 18 or higher
  * NPM
  * PostgreSQL 9.5 or higher
  * SQLite3 (system software)
  * Docker (for database migrations)

Checking for node:

    node -v

[Instructions for updating NodeJS on Linux](https://codewithintent.com/how-to-install-update-and-remove-node-js-from-linux-or-ubuntu/)

## Installing modules

    npm install


The npm SQLite3 module may need to be built from source in order to comply with the version of Node on your system, as well as the system's architecture. Then, if running `node app.js` or `nodejs app.js` shows errors with SQLite, run the following:

    npm uninstall sqlite3
    npm install sqlite3 --local --build-from-source
    npm rebuild
    



## Setting environment variables
Create a `.env` file and populate it. The `.env-example` file provides a template for this.
If a variable in this file is also set on the system, the file variable _will not_ overwrite the system variable.
You will have to decide what you want your `DB_NAME`, `DB_USER` and `DB_PW` to be. 
If you are running on your local machine, the `DB_HOST` will be `localhost`.
The `[...temporaryLocation...]` blocks can be anywhere on your computer.
The `[..projectLocation...]` is the location of the `nabu` directory on your file system, and `IGNORE_ADDRESS` can be left blank.

## Create a PostgreSQL database
Set up the same user and password as in your `.env` file

    $ sudo -u postgres createdb ${DATABASE}
    $ sudo -u postgres psql
    # create user ${USER};
    # alter role ${USER} with password '${PASSWORD}';
    # grant all on database ${DATABASE} to ${USER};
    # \c ${DATABASE}
    # grant all on schema PUBLIC to ${USER};
    # \q


## Migrating the PostgreSQL database (FileQCs)

Database migrations can be applied manually ,but we like Flyway for applying migrations in a controlled way. To
use Flyway for migrations, when setting up the database for the first time:
Create a file in `conf/` called `flyway.conf` and add to it your database url, user, and password (similar to the `.env` file. The `conf/example-flyway.conf` file provides a template for this.

Pull in the Flyway Docker image:

    docker pull flyway/flyway

Perform the initial migration using the following:

    npm run fw:migrate


After that initial setup, run migrations as necessary using the same command.

Note that if `flyway.url` includes `localhost`, the argument `--network=host` in `package.json`'s `fw:clean` and `fw:migrate` are particularly important.

## Enabling Authentication

Once the database migrations have been applied, a default authentication API key will need to be generated in order to accessing any endpoints which require authentication. This can be done by access the `/token` endpoint.

__IMPORTANT__: Once the first API key is generated, ensure you record the value. You will need it in order to access secure endpoints or generate another token. 

## Setting up the SQLite database ([File Provenance Report](https://github.com/oicr-gsi/provenance))
Nabu uses a SQLite database to store certain fields from the File Provenance Report. This SQLite database should be created in a directory outside of the Nabu directory.


    mkdir /path/to/sqlite/dir
    export SQLITE_LOCATION=/path/to/sqlite/dir


The [rsync_full_fpr.sh](components/fpr/rsync_full_fpr.sh) script will pull the latest version of the file provenance report, provided your environmental variables in `.env` are correctly set. If you are working with a local copy of the file provenance report, move or copy it to the `$SQLITE_LOCATION` directory you just created. The script can then be run without the line that begins with `rsync`. 

## Running the application
Start PostgreSQL using `pg_ctl start -l {DB LOG FILE LOCATION}` or any other method.

    npm start


A Swagger/OpenAPI page will be available at <https://localhost:8443/api-docs/index.html>. (The port is 8443 by default; if you want to run Nabu on another port, start it up using `HTTPS_PORT=#### npm start`.)

## Development

Install _husky_ which will lint and prettify files on precommit. Note that this uses `npx` which is built-in to npm.

    npx husky install


## Testing

Pull Docker images for postgres and flyway:

    docker pull postgres:12-alpine
    docker pull flyway/flyway


Run tests using:

    npm test

