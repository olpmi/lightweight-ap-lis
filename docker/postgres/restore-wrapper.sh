#!/bin/sh
# restore-wrapper.sh — called by PostgreSQL restore_command on the standby.
#
# Usage (postgresql.auto.conf):
#   restore_command = '/scripts/restore-wrapper.sh %f %p'
#
#   %f  WAL segment file name
#   %p  destination path where PostgreSQL expects the segment
#
# Used during recovery / gap-fill when the streaming connection cannot supply
# a required segment (e.g. after a restart or a transient primary disconnect).
#
# Mirrors the logic in archive-wrapper.sh: GCS if WALG_GCS_PREFIX is set,
# local /wal-archive volume otherwise.

set -e

WAL_FILE="$1"
DEST_PATH="$2"

if [ -n "${WALG_GCS_PREFIX}" ]; then
    wal-g wal-fetch "${WAL_FILE}" "${DEST_PATH}"
else
    cp "/wal-archive/${WAL_FILE}" "${DEST_PATH}"
fi
