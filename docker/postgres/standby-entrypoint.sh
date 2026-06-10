#!/bin/sh
# standby-entrypoint.sh — custom ENTRYPOINT for the hot-standby container.
#
# On first start (empty PGDATA): waits for the primary, clones it with
# pg_basebackup, then injects primary_conninfo (with password) and
# restore_command so PostgreSQL starts in streaming-replication standby mode.
#
# On subsequent starts (PGDATA already populated): delegates directly to the
# official docker-entrypoint.sh which skips initdb and starts postgres.

set -e

PRIMARY_HOST="${PRIMARY_HOST:-postgres_primary}"
PGDATA="${PGDATA:-/var/lib/postgresql/data}"
POSTGRES_USER="${POSTGRES_USER:-lis_user}"

echo "[standby] PGDATA=${PGDATA}  PRIMARY_HOST=${PRIMARY_HOST}"

# Only clone if PGDATA is empty (first start).
if [ -z "$(ls -A "${PGDATA}" 2>/dev/null)" ]; then
    echo "[standby] PGDATA is empty — waiting for primary..."

    # pg_isready checks the TCP listener, no auth needed.
    until pg_isready -h "${PRIMARY_HOST}" -U "${POSTGRES_USER}" -q 2>/dev/null; do
        echo "[standby] Primary not ready yet, retrying in 3 s..."
        sleep 3
    done

    echo "[standby] Primary is ready. Running pg_basebackup..."
    export PGPASSWORD="${REPLICATION_PASSWORD}"
    pg_basebackup \
        -h "${PRIMARY_HOST}" \
        -U replicator \
        -D "${PGDATA}" \
        -R \
        -Xs \
        -P \
        -v
    unset PGPASSWORD

    # pg_basebackup -R writes primary_conninfo without the password.
    # Replace it with a fully qualified entry so PostgreSQL can authenticate.
    AUTOCONF="${PGDATA}/postgresql.auto.conf"
    grep -v "^primary_conninfo" "${AUTOCONF}" > "${AUTOCONF}.tmp" || true
    mv "${AUTOCONF}.tmp" "${AUTOCONF}"
    cat >> "${AUTOCONF}" <<EOF
primary_conninfo = 'host=${PRIMARY_HOST} port=5432 user=replicator password=${REPLICATION_PASSWORD} application_name=standby1'
EOF

    # restore_command lets PostgreSQL fetch archived WAL to fill any gap between
    # the end of the base backup and the current streaming replication position.
    echo "restore_command = '/scripts/restore-wrapper.sh %f %p'" \
        >> "${AUTOCONF}"

    echo "[standby] Base backup complete."
fi

# Hand off to the official postgres entrypoint.
# Because PGDATA is now non-empty, it skips initdb and starts postgres in
# recovery/standby mode (standby.signal was written by pg_basebackup -R).
#
# NOTE: explicitly pass 'postgres' — Docker Compose clears the image's default
# CMD when entrypoint: is overridden without also setting command:, so $@ would
# be empty and docker-entrypoint.sh would exit 0 without starting postgres.
exec docker-entrypoint.sh postgres
