#!/bin/bash
# First-boot setup for the eXoMail backend on a Lightsail Ubuntu 24.04 instance (passed as user data).
# Installs Node (official tarball, checksum-verified), Caddy (automatic HTTPS), git, swap,
# automatic security updates, the systemd service and the redeploy script.
# The app is started later by `sudo exomail-redeploy`, once /opt/exomail/.env has been filled in.
# Lightsail runs user data with /bin/sh, so this script stays POSIX (no pipefail, no [[ ]]).
set -eux

NODE_VERSION=v24.21.0
DOMAIN=exomail.exommerce.online
REPO=https://github.com/Betahouseinc/ABC.Outreach.git

# 1 GB swap: npm ci needs more than the 512 MB plan has.
if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y git caddy unattended-upgrades xz-utils
dpkg-reconfigure -f noninteractive unattended-upgrades

# Node from nodejs.org, verified against the published SHA256 list.
cd /tmp
curl -fsSLO "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64.tar.xz"
curl -fsSLO "https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt"
grep " node-${NODE_VERSION}-linux-x64.tar.xz\$" SHASUMS256.txt | sha256sum -c -
tar -xJf "node-${NODE_VERSION}-linux-x64.tar.xz" -C /usr/local --strip-components=1

# App user, code and an empty, private env file.
id exomail >/dev/null 2>&1 || useradd --system --home /opt/exomail --shell /usr/sbin/nologin exomail
mkdir -p /opt/exomail
[ -d /opt/exomail/app ] || git clone --branch production-ready "$REPO" /opt/exomail/app
touch /opt/exomail/.env && chmod 600 /opt/exomail/.env
chown -R exomail:exomail /opt/exomail

cat > /etc/systemd/system/exomail.service <<'EOF'
[Unit]
Description=eXoMail backend
After=network-online.target
Wants=network-online.target

[Service]
User=exomail
WorkingDirectory=/opt/exomail/app/backend
EnvironmentFile=/opt/exomail/.env
Environment=NODE_ENV=production
ExecStart=/usr/local/bin/node server.js
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

cat > /usr/local/bin/exomail-redeploy <<'EOF'
#!/bin/bash
# Pull a branch (default: production-ready), install and restart. Usage: sudo exomail-redeploy [branch]
set -euo pipefail
BRANCH="${1:-production-ready}"
cd /opt/exomail/app
sudo -u exomail git fetch --quiet origin
sudo -u exomail git checkout --quiet "$BRANCH"
sudo -u exomail git reset --quiet --hard "origin/$BRANCH"
cd backend
sudo -u exomail HOME=/opt/exomail npm ci --omit=dev --no-audit --no-fund
systemctl restart exomail
sleep 3
systemctl --no-pager --lines=5 status exomail || true
curl -fsS http://127.0.0.1:3001/health && echo
EOF
chmod 755 /usr/local/bin/exomail-redeploy

cat > /etc/caddy/Caddyfile <<EOF
${DOMAIN} {
	encode gzip
	reverse_proxy 127.0.0.1:3001
}
EOF

systemctl daemon-reload
systemctl enable exomail
systemctl restart caddy
touch /var/lib/exomail-bootstrap-done
