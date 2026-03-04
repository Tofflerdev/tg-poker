#!/bin/bash
set -e

echo "Starting deployment part 2..."

# Ensure .ssh directory exists
mkdir -p ~/.ssh
chmod 700 ~/.ssh
touch ~/.ssh/known_hosts

# Add GitHub to known_hosts (force update to avoid stale keys)
echo "Updating GitHub host keys..."
ssh-keygen -R github.com 2>/dev/null || true
ssh-keyscan -t rsa,ecdsa,ed25519 github.com >> ~/.ssh/known_hosts

# Ensure correct permissions for the deploy key
if [ -f ~/.ssh/github_deploy ]; then
    chmod 600 ~/.ssh/github_deploy
else
    echo "Error: ~/.ssh/github_deploy not found!"
    exit 1
fi

# 1. Backup
if [ -d "/opt/tg-poker" ]; then
  BACKUP_DIR="/opt/tg-poker.backup.$(date +%Y%m%d_%H%M%S)"
  echo "Backing up /opt/tg-poker to $BACKUP_DIR"
  cp -r /opt/tg-poker "$BACKUP_DIR"
  
  # Check if .env exists in the directory being backed up
  if [ -f "/opt/tg-poker/.env" ]; then
    echo "Backing up .env to /root/tg-poker.env.backup"
    cp /opt/tg-poker/.env /root/tg-poker.env.backup
  else
    echo "No .env file found in /opt/tg-poker"
  fi
else
  echo "/opt/tg-poker does not exist, skipping backup"
fi

# 2. Clone
echo "Removing old /opt/tg-poker..."
rm -rf /opt/tg-poker

echo "Cloning repository..."
# Using the specified GIT_SSH_COMMAND
export GIT_SSH_COMMAND='ssh -i ~/.ssh/github_deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new'
git clone -v git@github.com:Tofflerdev/tg-poker.git /opt/tg-poker

# 3. Restore .env
if [ -f "/root/tg-poker.env.backup" ]; then
  echo "Restoring .env from backup"
  cp /root/tg-poker.env.backup /opt/tg-poker/.env
else
  echo "No .env backup found."
  if [ -f "/opt/tg-poker/.env.example" ]; then
      echo "Found .env.example. You may need to configure .env manually."
  fi
fi

# 4. Run update.sh
cd /opt/tg-poker
if [ -f "update.sh" ]; then
  echo "Making update.sh executable..."
  chmod +x update.sh
  echo "Running update.sh..."
  ./update.sh
else
  echo "update.sh not found in /opt/tg-poker"
  exit 1
fi

echo "Deployment part 2 completed successfully."
