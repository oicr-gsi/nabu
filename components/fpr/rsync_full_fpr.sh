#!/bin/bash

set -eux

# rsync the latest file provenance report to local machine
rsync -vPL "${FPR_FULL}" "${LOCAL_FPR_FULL_DEST}"

# extract only the desired fields, and only unique File SWIDs
# 45. File SWID
# 47. File Path
# 52. Skip [true|false]
# 53. Status [OKAY|STALE|ERROR]
# 2. Study Title
zcat "${LOCAL_FPR_FULL_DEST}"/*.tsv.gz | awk -F'\t' '!seen[$45] { print $45"\t"$47"\t"$52"\t"$53"\t"$2; seen[$45] = 1; }' > "${LOCAL_FPR_FULL_DEST}"/fpr.tsv

exit 0
