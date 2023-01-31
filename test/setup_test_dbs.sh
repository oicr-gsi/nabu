#!/bin/bash

# source the .testenv file to use its variables
. test/.env

docker stop "${PG_DB_CONTAINER_NAME}" || true  # it's fine if the container isn't running

# create flyway.conf file
echo "flyway.url=jdbc:postgresql://${DB_HOST}:${DB_PORT}/${DB_NAME}" > test/flyway.conf
echo "flyway.user=${DB_USER}" >> test/flyway.conf
echo "flyway.password=${DB_PW}" >> test/flyway.conf
echo "flyway.cleanDisabled=false" >> test/flyway.conf

# set up the Postgres database
docker run -d --rm --name "${PG_DB_CONTAINER_NAME}" -p 5436:5432 -e POSTGRES_USER="${DB_USER}" -e POSTGRES_PASSWORD="${DB_PW}" -e POSTGRES_DB="${DB_NAME}" postgres:12-alpine -c shared_buffers=500MB -c fsync=off 

# since we need to mount all the migrations into a single directory, the "regular" migrations need to be
# copied into the test folder, then deleted after.
mkdir -p test/sql
cp sql/V*.sql test/sql/
cp test/migrations/V9*.sql test/sql/
cp components/fpr/create_fpr_table.sql test/migrations/

CURRENT=$(pwd)
cd test/
export SQLITE_LOCATION=$(pwd)
sqlite3 fpr.db < migrations/create_fpr_table.sql
echo "Recreated FPR test table"
cd "${CURRENT}"

docker run --rm -v $(pwd)/test:/flyway/conf -v $(pwd)/test/sql:/flyway/sql --network=host flyway/flyway clean && \
		docker run --rm -v $(pwd)/test:/flyway/conf -v $(pwd)/test/sql:/flyway/sql --network=host flyway/flyway migrate

ls $(pwd)/test/sql
rm -r $(pwd)/test/sql
rm $(pwd)/test/migrations/create_fpr_table.sql
