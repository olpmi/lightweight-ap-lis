#!/bin/bash
# primary-init.sh — runs ONCE when the primary cluster is first created.
# Invoked by the official postgres entrypoint from /docker-entrypoint-initdb.d/.
#
# Configures:
#   - streaming replication (wal_level, max_wal_senders, etc.)
#   - WAL archiving via archive_command → /scripts/archive-wrapper.sh
#   - replicator user for standby authentication
#   - pg_hba.conf entry to allow the standby to connect

set -e

# ─── Streaming replication and WAL archiving ──────────────────────────────────
cat >> "${PGDATA}/postgresql.conf" <<'EOF'

# --- Managed by primary-init.sh (do not edit by hand) ---
# Streaming replication
wal_level = replica
max_wal_senders = 5
wal_keep_size = 256
hot_standby = on

# WAL archiving — archive-wrapper.sh sends to GCS (if WALG_GCS_PREFIX is set)
# or copies to the local /wal-archive volume as a fallback.
archive_mode = on
archive_command = '/scripts/archive-wrapper.sh %p %f'
archive_timeout = 300
EOF

# ─── Replication user ─────────────────────────────────────────────────────────
psql -v ON_ERROR_STOP=1 \
     --username "${POSTGRES_USER}" \
     --dbname   "${POSTGRES_DB}" \
     <<SQL
CREATE USER replicator
  WITH REPLICATION
  ENCRYPTED PASSWORD '${REPLICATION_PASSWORD}';
SQL

# ─── Allow the standby to connect for streaming replication ───────────────────
echo "host  replication  replicator  0.0.0.0/0  scram-sha-256" \
  >> "${PGDATA}/pg_hba.conf"
