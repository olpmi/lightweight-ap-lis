# wal-g version — check https://github.com/wal-g/wal-g/releases for updates.
# From v3.x the release assets are named by Ubuntu version (glibc), not musl.
# We therefore use the Debian-based postgres image (glibc) instead of Alpine.
ARG WALG_VERSION=v3.0.8
ARG PG_MAJOR=16

FROM postgres:${PG_MAJOR}

ARG WALG_VERSION

# Install wal-g (glibc build — compatible with Debian/Ubuntu base images).
# Extract to a temp dir first so we can find the binary regardless of what
# it is named inside the tar (e.g. wal-g-pg-24.04-amd64 in recent releases).
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /tmp/walg \
    && curl -fsSL \
       "https://github.com/wal-g/wal-g/releases/download/${WALG_VERSION}/wal-g-pg-24.04-amd64.tar.gz" \
       | tar xz -C /tmp/walg \
    && find /tmp/walg -maxdepth 1 -type f | head -1 | xargs -I{} install -m 0755 {} /usr/local/bin/wal-g \
    && rm -rf /tmp/walg \
    # Local WAL archive directory.
    # Creating it here (owned by postgres uid 999 on Debian) means Docker copies
    # this empty dir + ownership to the named volume on first mount, so the
    # postgres process can write archive files without root intervention.
    && mkdir -p /wal-archive \
    && chown postgres:postgres /wal-archive \
    # Directories used by cron in the backup_cron service.
    && mkdir -p /var/spool/cron/crontabs /var/log

# Scripts shared by all roles (primary archiving, standby restore, backup cron).
COPY archive-wrapper.sh restore-wrapper.sh backup-cron.sh standby-entrypoint.sh /scripts/

# primary-init.sh runs once via /docker-entrypoint-initdb.d/ on first primary startup.
COPY primary-init.sh /docker-entrypoint-initdb.d/primary-init.sh

# Crontab for the backup_cron service (Debian cron reads /etc/cron.d/).
COPY crontab /etc/cron.d/wal-g-backup

RUN chmod +x /scripts/*.sh /docker-entrypoint-initdb.d/primary-init.sh \
    && chmod 0644 /etc/cron.d/wal-g-backup
