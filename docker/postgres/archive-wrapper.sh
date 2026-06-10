#!/bin/sh
# archive-wrapper.sh — called by PostgreSQL archive_command on the primary.
#
# Usage (postgresql.conf):
#   archive_command = '/scripts/archive-wrapper.sh %p %f'
#
#   %p  absolute path to the WAL segment to archive
#   %f  WAL segment file name (no directory)
#
# If WALG_GCS_PREFIX is set, pushes the segment to GCS via wal-g.
# Otherwise copies the segment to the local /wal-archive volume so the
# standby's restore_command can retrieve it during recovery.
#
# PostgreSQL considers archiving successful when this script exits 0.
# On any error it will retry, so we use `set -e` for fail-fast behaviour.

set -e

WAL_PATH="$1"   # e.g. /var/lib/postgresql/data/pg_wal/000000010000000000000001
WAL_FILE="$2"   # e.g. 000000010000000000000001

if [ -n "${WALG_GCS_PREFIX}" ]; then
    wal-g wal-push "${WAL_PATH}"
else
    mkdir -p /wal-archive
    # Do not overwrite an already-archived segment.
    [ -f "/wal-archive/${WAL_FILE}" ] || cp "${WAL_PATH}" "/wal-archive/${WAL_FILE}"
fi
