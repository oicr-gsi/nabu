#!/bin/bash

set -eux

# Note: this script needs to be run from the directory that it is in, otherwise the import into SQLite doesn't work

# rsync the latest file provenance report to local machine
rsync -vPL "${FPR_FULL}" "${LOCAL_FPR_FULL_DEST}"

now=$(date +"%y%m%d-%H%M%S")

# Extract only the desired fields, and only unique File SWIDs
# Skip the first line as we'll be importing the .tsv into a database
# 45. File SWID
# 47. File Path
# 52. Skip [true|false]
# 53. Status [OKAY|STALE|ERROR]
# 2. Study Title
# 39. Workflow Run Input File SWAs
zcat "${LOCAL_FPR_FULL_DEST}"/*.tsv.gz | awk -F'\t' '!seen[$45] && NR>1 { print $45"\t"$47"\t"$52"\t"$53"\t"$2"\t"$39; seen[$45] = 1; }' | sort -g -t$'\t' -k1 > "${FPR_SMALL_DEST}"/"${now}"-fpr.tsv

# symlink the latest one into this folder
ln -sf "${FPR_SMALL_DEST}"/"${now}"-fpr.tsv "${LOCAL_FPR_FULL_DEST}"/fpr-latest.tsv

# if the newer file is smaller than the second-newest one, we might have a problem
newest=`stat -c%s "${FPR_SMALL_DEST}"/$(ls -t "${FPR_SMALL_DEST}"/ | grep fpr.tsv | head -n 1)`
second_newest=`stat -c%s "${FPR_SMALL_DEST}"/$(ls -t "${FPR_SMALL_DEST}"/ | grep fpr.tsv | head -n 2 | tail -n 1)`

# reload the db
echo "Reloading the db"
sqlite3 < "${LOCAL_FPR_FULL_DEST}"/create_fpr_table.sql
exit 0
