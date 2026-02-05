#!/usr/bin/env bash

# -e: exit on first command failure; 
# -u: treat unset variables as errors; 
# -o pipefail: pipeline fails if any command in it fails
set -euo pipefail

# Backup filename includes date, hour and minute (UTC) for cron runs
BACKUP_TIMESTAMP=$(date -u +%Y-%m-%d-%H-%M)
BACKUP_FILENAME="backup-${BACKUP_TIMESTAMP}.stream"

# shellcheck disable=SC2086
# --threads 0 means "use the number of CPU cores"
# -v 3 means "verbose level 3" - includes info logs
# --stream writes a single stream to stdout (TRADITIONAL = stream then delete each file); we capture it to one file
mydumper --host "$MYSQL_HOST" --user $MYSQL_USER --password $MYSQL_PASSWORD --port $MYSQL_PORT --database $MYSQL_DATABASE -c --clear --threads 0 -v 3 --stream -o backup > backup.stream.tmp && mv backup.stream.tmp "backup/${BACKUP_FILENAME}"

rclone config touch
# We upload our backups to Railway buckets, which is an S3-compatible storage service.
# Disregard that the below mentions Cloudflare, S3 and R2. The same config works for
# Railway buckets.
cat <<EOF > ~/.config/rclone/rclone.conf
[remote]
type = s3
provider = Cloudflare
access_key_id = $R2_ACCESS_KEY_ID
secret_access_key = $R2_SECRET_ACCESS_KEY
endpoint = $R2_ENDPOINT
acl = private
EOF
rclone sync backup remote:"$R2_BUCKET"/"$R2_PATH"

# Remove backups on the remote that are older than 7 days
rclone delete remote:"$R2_BUCKET"/"$R2_PATH" --min-age 3m