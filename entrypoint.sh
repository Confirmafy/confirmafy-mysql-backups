#!/usr/bin/env bash

set -euo pipefail

# shellcheck disable=SC2086
# --threads 0 means "use the number of CPU cores"
# -v 3 means "verbose level 3" - includes info logs
# --stream writes a single stream to stdout (TRADITIONAL = stream then delete each file); we capture it to one file
mydumper --host "$MYSQL_HOST" --user $MYSQL_USER --password $MYSQL_PASSWORD --port $MYSQL_PORT --database $MYSQL_DATABASE -c --clear --threads 0 -v 3 --stream -o backup > backup.stream.tmp && mv backup.stream.tmp backup/backup.stream
rclone config touch
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