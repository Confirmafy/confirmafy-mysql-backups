# BTC, Backups Tool Confirmafy

This is a long-lived container that takes backups of a MySQL database using mydumper.

The backup job runs with node-cron. See `index.js` for the entry point.

The container also has node scripts for viewing backups and restoring from a backup.

## Benchmarks

- 6 threads backup + Upload = 6 minutes 48 seconds
- 6 threads backup + Upload using Confirmafy production DB = 16 minutes 13 seconds
- Restore from 2.3 GB backup and default settings on DB = 17 minutes

## How do I ssh into the container doing the backups?

```bash
# Run this and follow prompts to link to the service in Railway that deployed this repository.
railway link

# Run this and you are in.
railway ssh
```

## List backups

```bash
railway ssh

npm run list-backups
```

## Restore from a backup

1. Create a new MySQL database in the project where you will be restoring. Copy the public internet connection URL.
2. SSH into the backups job container.

```bash
railway ssh
```

3. Start a tmux session since a restore can take ~20 minutes and you don't want that process to die if your ssh session dies.

```bash
# This is all you need to run
tmux

# Below is a small tmux cheatsheet in case you need a refresher; ignore it otherwise.

# If your SSH session dies, ssh back in and run the following to reattach to the most recent tmux session
tmux attach

# You can use this to see all the tmux sessions
tmux ls

# This is to attach to a specific session
tmux attach -t name

# To exit a tmux session
ctrl+b &

# To kill a session
tmux kill-session -t name
```

4. Run the backup script and follow the prompts

```bash
npm run restore-backup
```

5. Once the restore is complete, you can now go and point Confirmafy Web Service to it.

## Create ad-hoc backup

This is for creating backups whenever you want. Just run the below.

```bash
railway ssh

npm run adhoc-backup
```

## How do I kill a backup job?

If a backup job execution is causing problems, do this to kill it:

```bash
# IMPORTANT: read comments below for information about how killing works.

railway ssh

# What this does is it sends a SIGTERM signal to all the active mydumper processes.
# mydumper is designed to initiate a graceful shutdown when it receives that signal.
# In my testing, a graceful shutdown can take ~5 minutes. It depends on what mydumper is doing
# when it receives the signal.
# IF YOU RUN THIS A SECOND TIME then the mydumper processes will be killed instantly and ungracefully.
# So you have that option, but it's unclear what its consequences are for the database. It maybe be left
# with some dead resources to cleanup.
npm run kill-backup
```
