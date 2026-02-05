# Backups tool

Interactive CLI to list and download MySQL backup files from your S3-compatible storage (Railway bucket / R2).

## Setup

```bash
npm install

# To get the env variables to view the backups, link the directory to the railway project
railway link

# To list backups (and download backups)
railway run npm run list-backups
```

## Environment

Use the same variables as the backup container (e.g. in a `.env` file or export):

- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT`
- `R2_BUCKET`
- `R2_PATH` (optional, default: `mysql-backup`)

## Run

```bash
npm start
```

You’ll get a list of backups (newest first). Pick one with the arrow keys and Enter, then enter a path to save the file (default is the backup filename).
