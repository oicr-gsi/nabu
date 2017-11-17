
> In Inuit mythology, Issitoq (also Isitoq) is a deity that punishes those who break taboos. He usually takes the form of a giant flying eye. (from [Wikipedia](https://en.wikipedia.org/wiki/Issitoq))

# Getting started

## Requirements
  * Node 4.5.0 or higher
  * PostgreSQL and pg_ctl utility
  * SQLite3

Checking for node:
```
node -v
```
[Instructions for updating Linux](https://codewithintent.com/how-to-install-update-and-remove-node-js-from-linux-or-ubuntu/)

## Installing modules
```
issitoq$ npm install
```

## Setting environment variables
Create a `.env` file and populate it. The `.env-example` file provides a template for this.

## Create a PostgreSQL database
Set up the same user and password as in your `.env` file
```
$ sudo -u postgres createdb ${DATABASE}
$ sudo -u postgres psql
# create user ${USER};
# alter role ${USER} with password '${PASSWORD}';
# grant all on database ${DATABASE} to ${USER};
# \q
```

## Migrating the database
When setting up the database for the first time:
  * Create a file in `conf/` called `flyway.conf` and add to it your database url, user, and password (similar to the `.env` file. The `conf/example-flyway.conf` file provides a template for this.
  * Perform the initial migration using the following:
    ```
    $ npm run fw-migrate
    ```

After that initial setup, run migrations as necessary using:
```
$ npm run fw-migrate
```

## Running the application
```
$ pg_ctl start -l {LOG FILE LOCATION}
$ npm start
```

## Development
Run the linter before committing changes:
```
$ npm run lint
```
Linter settings are in .eslintrc.json .
