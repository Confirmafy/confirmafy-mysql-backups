# syntax=docker/dockerfile:1

FROM mydumper/mydumper:v0.21.2-2

# Install Node.js 22.x (LTS) and procps-ng (pgrep, pkill) — AlmaLinux 9 (RHEL-based)
# Also install tmux so we can run restore jobs in the background and detach/reattach.
RUN dnf module enable -y nodejs:22 \
    && dnf install -y nodejs npm procps-ng tmux tini \
    && dnf clean all

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
COPY src/ src/
RUN npm ci && npm run build && npm prune --omit=dev

# These are for the database that we take backups of.
ENV MYSQL_HOST=""
ENV MYSQL_USER=""
ENV MYSQL_PASSWORD=""
ENV MYSQL_PORT="3306"
ENV MYSQL_DATABASE=""

# These are for the Railway bucket that we upload backups to.
ENV R2_ACCESS_KEY_ID=""
ENV R2_SECRET_ACCESS_KEY=""
ENV R2_ENDPOINT=""
ENV R2_BUCKET=""
ENV R2_PATH="mysql-backup"

# These are for the S3 bucket we also upload backups to for redundancy.
ENV AWS_ACCESS_KEY_ID=""
ENV AWS_S3_BUCKET=""
ENV AWS_S3_REGION=""
ENV AWS_SECRET_ACCESS_KEY=""

# These are for the database that we regularly restore to in order to test that restores are working.
# Note that the hostname is hardcoded. It's too dangerous to trust an env variable.
ENV MYSQL_TO_RESTORE_USER=""
ENV MYSQL_TO_RESTORE_PASSWORD=""
ENV MYSQL_TO_RESTORE_PORT="3306"
ENV MYSQL_TO_RESTORE_DATABASE=""

ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/index.js"]
