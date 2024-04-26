#!/bin/bash
set -eu

. test/.env

docker rm -f "${PG_DB_CONTAINER_NAME}"
rm $(pwd)/test/flyway.conf
