#!/bin/bash

PG_DB_CONTAINER_NAME="pgtestdb"  # Also used in package.json to stop the container after the test
# set up the Postgres database
docker run -d --rm --name "${PG_DB_CONTAINER_NAME}" -p 5436:5432 -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=qcdbtest postgres:12-alpine -c shared_buffers=500MB -c fsync=off 

# set up the sqlite3 database
#docker run -d --rm -name sqlitetestdb -p

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

rm -r $(pwd)/test/sql
rm $(pwd)/test/migrations/create_fpr_table.sql
