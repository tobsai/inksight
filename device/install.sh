#!/bin/bash
# InkSight Installer for reMarkable Paper Pro
# =============================================
# Usage: ./install.sh <remarkable_ip> [ssh_password]
#
# Installs InkSight daemon on a reMarkable Paper Pro via SSH.
# Requires: SSH access to the device (Developer Mode enabled).
#
# The device IP is typically:
#   - USB: 10.11.99.1
#   - WiFi: shown in Settings > Help > Copyrights and licenses

set -euo pipefail

REMARKABLE_IP="${1:-10.11.99.1}"
SSH_USER="root"
INSTALL_DIR="/home/root/.inksight"
SERVICE_NAME="inksight"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# Check SSH connectivity
info "Testing SSH connection to ${REMARKABLE_IP}..."
if ! ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "${SSH_USER}@${REMARKABLE_IP}" "echo ok" &>/dev/null; then
    error "Cannot connect to ${REMARKABLE_IP}. Ensure:
  1. Developer Mode is enabled on your reMarkable
  2. Device is connected via USB (10.11.99.1) or WiFi
  3. SSH password is available in Settings > Help > Copyrights and licenses"
fi
info "SSH connection OK"

# Check Python availability on device
info "Checking Python on device..."
PYTHON_CMD=$(ssh "${SSH_USER}@${REMARKABLE_IP}" "which python3 || which python || echo 'none'")
if [ "$PYTHON_CMD" = "none" ]; then
    warn "Python not found on device. Installing via opkg..."
    ssh "${SSH_USER}@${REMARKABLE_IP}" bash <<'REMOTE_INSTALL_PYTHON'
# Try to install Python if opkg is available (Toltec)
if command -v opkg &>/dev/null; then
    opkg update
    opkg install python3 python3-pip
elif command -v entware-install &>/dev/null; then
    entware-install
    opkg install python3 python3-pip
else
    echo "ERROR: No package manager found. You need to install Python manually."
    echo "Options:"
    echo "  1. Install Toltec (if supported on your firmware)"
    echo "  2. Cross-compile Python for ARM and copy it over"
    echo "  3. Use the static Python binary from remarkable-hacks"
    exit 1
fi
REMOTE_INSTALL_PYTHON
    PYTHON_CMD=$(ssh "${SSH_USER}@${REMARKABLE_IP}" "which python3 || which python")
fi
info "Python found: ${PYTHON_CMD}"

# Create install directory
info "Creating install directory..."
ssh "${SSH_USER}@${REMARKABLE_IP}" "mkdir -p ${INSTALL_DIR}"

# Copy files
info "Copying InkSight files..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Copy Python package
scp -r "${SCRIPT_DIR}/inksight" "${SSH_USER}@${REMARKABLE_IP}:${INSTALL_DIR}/"
scp "${SCRIPT_DIR}/requirements.txt" "${SSH_USER}@${REMARKABLE_IP}:${INSTALL_DIR}/"
scp "${SCRIPT_DIR}/config.yaml" "${SSH_USER}@${REMARKABLE_IP}:${INSTALL_DIR}/"

# Install dependencies
info "Installing Python dependencies..."
ssh "${SSH_USER}@${REMARKABLE_IP}" bash <<REMOTE_PIP
cd ${INSTALL_DIR}
${PYTHON_CMD} -m pip install --user -r requirements.txt 2>/dev/null || \
${PYTHON_CMD} -m pip install -r requirements.txt 2>/dev/null || \
pip3 install -r requirements.txt 2>/dev/null || \
echo "WARNING: pip install failed. You may need to install dependencies manually."
REMOTE_PIP

# Create systemd service
info "Installing systemd service..."
ssh "${SSH_USER}@${REMARKABLE_IP}" bash <<REMOTE_SERVICE
cat > /etc/systemd/system/${SERVICE_NAME}.service << 'EOF'
[Unit]
Description=InkSight Handwriting Improvement Daemon
After=home.mount xochitl.service
Wants=xochitl.service

[Service]
Type=simple
ExecStart=${PYTHON_CMD} -m inksight -f -c ${INSTALL_DIR}/config.yaml
WorkingDirectory=${INSTALL_DIR}
Environment=PYTHONPATH=${INSTALL_DIR}
Restart=on-failure
RestartSec=10
Nice=15
IOSchedulingClass=idle

# Resource limits to prevent interfering with xochitl
MemoryMax=128M
CPUQuota=25%

[Install]
WantedBy=multi-user.target
EOF

# Replace placeholder with actual Python path
sed -i "s|\${PYTHON_CMD}|${PYTHON_CMD}|g" /etc/systemd/system/${SERVICE_NAME}.service
sed -i "s|\${INSTALL_DIR}|${INSTALL_DIR}|g" /etc/systemd/system/${SERVICE_NAME}.service

systemctl daemon-reload
systemctl enable ${SERVICE_NAME}
REMOTE_SERVICE

info "Starting InkSight service..."
ssh "${SSH_USER}@${REMARKABLE_IP}" "systemctl start ${SERVICE_NAME}" || true

# Check status
sleep 2
STATUS=$(ssh "${SSH_USER}@${REMARKABLE_IP}" "systemctl is-active ${SERVICE_NAME}" 2>/dev/null || echo "unknown")

if [ "$STATUS" = "active" ]; then
    info "InkSight is running!"
else
    warn "Service status: ${STATUS}"
    warn "Check logs with: ssh ${SSH_USER}@${REMARKABLE_IP} 'journalctl -u ${SERVICE_NAME} -f'"
fi

echo ""
info "Installation complete!"
echo ""
echo "  Manage InkSight:"
echo "    Start:   ssh ${SSH_USER}@${REMARKABLE_IP} 'systemctl start ${SERVICE_NAME}'"
echo "    Stop:    ssh ${SSH_USER}@${REMARKABLE_IP} 'systemctl stop ${SERVICE_NAME}'"
echo "    Status:  ssh ${SSH_USER}@${REMARKABLE_IP} 'systemctl status ${SERVICE_NAME}'"
echo "    Logs:    ssh ${SSH_USER}@${REMARKABLE_IP} 'journalctl -u ${SERVICE_NAME} -f'"
echo "    Config:  ssh ${SSH_USER}@${REMARKABLE_IP} 'vi ${INSTALL_DIR}/config.yaml'"
echo ""
echo "  Edit config and restart to apply changes:"
echo "    ssh ${SSH_USER}@${REMARKABLE_IP} 'systemctl restart ${SERVICE_NAME}'"
