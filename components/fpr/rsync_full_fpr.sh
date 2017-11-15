#!/bin/bash

set -eux

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
zcat "${LOCAL_FPR_FULL_DEST}"/*.tsv.gz | awk -F'\t' '!seen[$45] && NR>1 { print $45"\t"$47"\t"$52"\t"$53"\t"$2; seen[$45] = 1; }' | sort -g -t$'\t' -k1 > "${LOCAL_FPR_FULL_DEST}"/sqlite-migrations/"${now}"-fpr.tsv

ln -s "${LOCAL_FPR_FULL_DEST}"/sqlite-migrations/"${now}"-fpr.tsv "${LOCAL_FPR_FULL_DEST}"/sqlite-migrations/fpr.tsv

exit 0
