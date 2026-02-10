# BTC, Backups Tool Confirmafy

This is a long-lived container that takes backups of a MySQL database using mydumper.

The backup job runs with node-cron. See `index.js` for the entry point.

The container also has node scripts for viewing backups and restoring from a backup.

## How do I ssh into the container doing the backups?

```bash
# Run this and follow prompts to link to the service in Railway that is linked to this repository.
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

## How do I kill a backup job?

If a backup job execution is causing problems, do this to kill it:

```bash
railway ssh

npm run kill-backup
```
