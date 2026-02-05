# Backups tool

Interactive CLI to list and download MySQL backup files from your S3-compatible storage (Railway bucket / R2).

## Setup

```bash
npm install

# Needed if you are doing restoration
brew install mydumper

# To get the env variables to view the backups, link the directory to the backups service in Railway
railway link
```

## How to list and download backups

```bash
railway run npm run list-backups
```
