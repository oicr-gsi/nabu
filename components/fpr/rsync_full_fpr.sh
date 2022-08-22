#!/bin/bash

set -eux

# get variables from .env file (note that $NABU must be defined at this point)
source "${NABU}"/.env

# rsync the latest file provenance report to local machine
rsync -vPL "${FPR_FULL}" "${SQLITE_LOCATION}"

now=$(date +"%y%m%d-%H%M%S")

# Extract only the desired fields, and only unique File SWIDs
# Skip the first line as we'll be importing the .tsv into a database
# 45. File SWID
# 46. File Attributes (contains File SWID)
# 47. File Path
# 48. File Md5sum
# 52. Skip [true|false]
# 53. Status [OKAY|STALE|ERROR]
# 2. Study Title
# 39. Workflow Run Input File SWAs
# 31. Workflow Name
# 14. Sample Name
# 19. Sequencer Run Name
# 25. Lane Number
zcat "${SQLITE_LOCATION}"/*.tsv.gz | awk -F'\t' '!seen[$45] && NR>1 { print $45"\t"$46"\t"$47"\t"$48"\t"$52"\t"$53"\t"$2"\t"$39"\t"$31"\t"$14"\t"$19"\t"$25; seen[$45] = 1; }' | awk -F'\t' '{$2=gensub(/.*niassa-file-accession=([0-9]+).*/,"\\1","1",$2); print}' | sort -g -t$'\t' -k1 > "${FPR_SMALL_DEST}"/"${now}"-fpr.tsv

# symlink the latest one into the folder which contains the database file
ln -sf "${FPR_SMALL_DEST}"/"${now}"-fpr.tsv "${SQLITE_LOCATION}"/fpr-latest.tsv

# reload the db
echo "Reloading the db"
pushd "${SQLITE_LOCATION}"
sqlite3 < "${NABU}"/components/fpr/create_fpr_table.sql
popd

# remove any older file provenance report copies
cd "${FPR_SMALL_DEST}"
find . -type f ! -name "${now}-fpr.tsv" -exec rm -rf {} \;

exit 0
