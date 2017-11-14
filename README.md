
> In Inuit mythology, Issitoq (also Isitoq) is a deity that punishes those who break taboos. He usually takes the form of a giant flying eye. (from [Wikipedia](https://en.wikipedia.org/wiki/Issitoq))

# Getting started

## Installing modules
```
npm install
```

## Setting environment variables
Create a `.env` file and populate it. The `.env-example` file provides a template for this.

## Create a PostgreSQL database
Use the same user and password as in yoru `.env` file

## Migrating the database
Create a file in `conf/` called `flyway.conf` and add to it your database url, user, and password. The `conf/example-flyway.conf` file provides a template for this.

When setting up the database initially, run the following:
```
npm run fw-baseline
```
Then run migrations as usual:
```
npm run fw-migrate
```

## Running the application
```
npm start
```
