# Getting started

## Setting environment variables
Create a `.env` file and populate it. The `.env-example` file provides a template for this.

## Migrating the database
Create a file in `conf/` called `flyway.conf` and add to it your database url, user, and password. The `conf/example-flyway.conf` file provides a template for this.

When setting up the database initially, run the following:
```
npm run baseline
```
Then run migrations as usual.

In order to run migrations, run the following:
```
npm run migrate
```
