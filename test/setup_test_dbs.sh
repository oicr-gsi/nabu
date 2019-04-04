#!/bin/bash

# since we need to mount all the migrations into a single directory, the "regular" migrations need to be
# copied into the test folder, then deleted after.
mkdir -p test/sql
cp sql/V*.sql test/sql/
cp test/migrations/V9*.sql test/sql/

CURRENT=$(pwd)
cd test/
sqlite3 fpr.db < migrations/create_test_fpr.sql
echo "Recreated FPR test table"
cd $CURRENT

docker run --rm -v $(pwd)/test:/flyway/conf -v $(pwd)/test/sql:/flyway/sql --network=host boxfuse/flyway clean && \
		docker run --rm -v $(pwd)/test:/flyway/conf -v $(pwd)/test/sql:/flyway/sql --network=host boxfuse/flyway migrate

rm -r $(pwd)/test/sql
