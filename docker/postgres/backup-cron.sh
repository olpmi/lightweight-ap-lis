#!/bin/sh
# backup-cron.sh — pushed as a scheduled base backup to GCS via wal-g.
#
# Required environment variables (set on the backup_cron service):
#   PGDATA                  — path to the primary's data directory (mounted RO)
#   PGHOST                  — postgres_primary (connect for pg_backup_start/stop)
#   PGPORT / PGUSER / PGPASSWORD / PGDATABASE
#   WALG_GCS_PREFIX         — GCS URI, e.g. gs://bucket/postgres-backups
#   GOOGLE_APPLICATION_CREDENTIALS — path to service-account JSON
#
# wal-g backup-push (PG 15+) uses the non-exclusive backup API
# (pg_backup_start / pg_backup_stop) so no write access to PGDATA is needed;
# the volume can be mounted read-only.

set -e

echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ')  backup-push started"
wal-g backup-push "${PGDATA}"

echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ')  pruning old backups (retaining 7 full)"
wal-g delete retain FULL 7 --confirm

echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ')  backup complete"
