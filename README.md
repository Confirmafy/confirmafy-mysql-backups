# Backups tool

Interactive CLI to list and download MySQL backup files from your S3-compatible storage (Railway bucket / R2).

## Setup

```bash
npm install

# To get the env variables to view the backups, link the directory to the backups service in Railway
railway link
```

Then you need install Docker Desktop: https://docs.docker.com/desktop/

Docker Desktop is needed to do restorations. This is because the mydumper binary available for mac on brew currently has a problem that prevents us from using it for restoration. See: https://github.com/mydumper/mydumper/issues/2027

## How to list and download backups

```bash
railway run npm run list-backups
```

## How to restore a backup

First download a `.stream` file using the command above, then run:

```bash
# REMEMBER to make sure Docker Desktop is running!

npm run restore-backup -- "mysql://user:password@host:port/database"
```

The script will let you pick which `.stream` file to restore from the current directory, ask for confirmation, and then pipe it into `myloader`.
