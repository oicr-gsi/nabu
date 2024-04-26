#!/bin/bash
set -eu

# source the .testenv file to use its variables
. test/.env

docker rm -f "${PG_DB_CONTAINER_NAME}" || true  # it's fine if the container isn't running

# create flyway.conf file
echo "flyway.url=jdbc:postgresql://${DB_HOST}:${DB_PORT}/${DB_NAME}" > test/flyway.conf
echo "flyway.user=${DB_USER}" >> test/flyway.conf
echo "flyway.password=${DB_PW}" >> test/flyway.conf
echo "flyway.cleanDisabled=false" >> test/flyway.conf
echo "flyway.locations=filesystem:/flyway/migrations,filesystem:/flyway/testdata" >> test/flyway.conf

# set up the Postgres database
docker run -d --rm --name "${PG_DB_CONTAINER_NAME}" -p 5436:5432 -e POSTGRES_USER="${DB_USER}" -e POSTGRES_PASSWORD="${DB_PW}" -e POSTGRES_DB="${DB_NAME}" postgres:12-alpine -c shared_buffers=500MB -c fsync=off

CURRENT=$(pwd)
cd test/
export SQLITE_LOCATION=$(pwd)
sqlite3 fpr.db < create_fpr_table.sql
echo "Recreated FPR test table"
cd "${CURRENT}"

# wait for PG_DB_CONTAINER_NAME to be ready
while ! docker exec -it pgtestdb pg_isready -U postgres; do sleep 1; done

docker run --rm -v $(pwd)/test:/flyway/conf -v $(pwd)/sql:/flyway/migrations -v $(pwd)/test/migrations:/flyway/testdata --network=host flyway/flyway clean
docker run --rm -v $(pwd)/test:/flyway/conf -v $(pwd)/sql:/flyway/migrations -v $(pwd)/test/migrations:/flyway/testdata --network=host flyway/flyway migrate
