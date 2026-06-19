#!/usr/bin/env bash
# Re-sync the Tempo wallet auth state from WSL to the always-on Arc server.
#
# WHEN TO RUN: after you renew the access key on your machine with
#   wsl -u root /root/.tempo/bin/tempo-wallet refresh
# (open the printed https://wallet.tempo.xyz/cli-auth?...code=… URL in a Windows
#  browser and approve with your passkey). That writes a fresh keys.toml in WSL.
# Then run THIS script (from Git Bash / MINGW on Windows) to push it to the server
# so the daily cron keeps signing as the main wallet.
#
# Usage:  bash sync-wallet-to-server.sh
set -euo pipefail

SRV="root@95.216.32.243"
KEY_SRC="D:/Node/Arc Node/SSH Private Key Arc Node.txt"
KEY="/tmp/arc_node_key"

cp "$KEY_SRC" "$KEY"
chmod 600 "$KEY"
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=no "$SRV")

echo "Syncing keys.toml + channels.db  (WSL -> $SRV) ..."
"${SSH[@]}" 'mkdir -p /root/.tempo/wallet'
wsl.exe -u root bash -c 'base64 -w0 /root/.tempo/wallet/keys.toml'   | "${SSH[@]}" 'base64 -d > /root/.tempo/wallet/keys.toml'
wsl.exe -u root bash -c 'base64 -w0 /root/.tempo/wallet/channels.db' | "${SSH[@]}" 'base64 -d > /root/.tempo/wallet/channels.db'

echo "Verifying on server:"
"${SSH[@]}" 'export PATH=/root/.tempo/bin:$PATH; tempo wallet whoami -j 2>&1 | grep -oE "\"wallet\":\"[^\"]+\"|\"ready\":[a-z]+|\"available\":\"[^\"]+\"|\"expires_at\":\"[^\"]+\""'
echo "Done. If ready=true and expires_at moved forward, renewal is synced."
