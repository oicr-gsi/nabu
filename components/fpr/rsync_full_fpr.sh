#!/bin/bash

set -eux

# rsync the latest file provenance report to local machine
rsync -vPL "${FPR_FULL}" "${SQLITE_LOCATION}"

now=$(date +"%y%m%d-%H%M%S")

# Extract only the desired fields, and only unique File SWIDs
# Skip the first line as we'll be importing the .tsv into a database
# 45. File SWID
# 47. File Path
# 52. Skip [true|false]
# 53. Status [OKAY|STALE|ERROR]
# 2. Study Title
# 39. Workflow Run Input File SWAs
zcat "${SQLITE_LOCATION}"/*.tsv.gz | awk -F'\t' '!seen[$45] && NR>1 { print $45"\t"$47"\t"$52"\t"$53"\t"$2"\t"$39; seen[$45] = 1; }' | sort -g -t$'\t' -k1 > "${FPR_SMALL_DEST}"/"${now}"-fpr.tsv

# symlink the latest one into the folder which contains the database file
ln -sf "${FPR_SMALL_DEST}"/"${now}"-fpr.tsv "${SQLITE_LOCATION}"/fpr-latest.tsv


# reload the db
echo "Reloading the db"
pushd "${SQLITE_LOCATION}"
sqlite3 < "${ISSITOQ}"/components/fpr/create_fpr_table.sql
popd
exit 0
