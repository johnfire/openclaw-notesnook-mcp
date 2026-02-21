#!/bin/bash
set -e

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Notesnook MCP Server Installer ==="
echo ""

# 1. Check node >= 22
NODE_VERSION=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 22 ]; then
  echo "ERROR: Node.js >= 22 is required. Found: $(node --version 2>/dev/null || echo 'not installed')"
  exit 1
fi
echo "Node.js $(node --version) — OK"

# 2. Install dependencies
echo ""
echo "Installing dependencies..."
cd "$INSTALL_DIR"
npm install

# 3. Build
echo ""
echo "Building TypeScript..."
npm run build

if [ ! -f "$INSTALL_DIR/dist/index.js" ]; then
  echo "ERROR: Build failed — dist/index.js not found"
  exit 1
fi
echo "Build successful."

# 4. Prompt for sync root
echo ""
read -rp "Enter the full path to your Notesnook sync folder: " SYNC_ROOT
SYNC_ROOT="${SYNC_ROOT/#\~/$HOME}"

if [ ! -d "$SYNC_ROOT" ]; then
  mkdir -p "$SYNC_ROOT"
  echo "Created: $SYNC_ROOT"
fi

# 5. Create folder structure
mkdir -p "$SYNC_ROOT/export"
mkdir -p "$SYNC_ROOT/import"
echo "Sync folder structure ready."

# 6. Write systemd user service
SERVICE_DIR="$HOME/.config/systemd/user"
SERVICE_FILE="$SERVICE_DIR/notesnook-mcp.service"
mkdir -p "$SERVICE_DIR"

sed \
  -e "s|INSTALL_DIR|$INSTALL_DIR|g" \
  -e "s|SYNC_ROOT_PATH|$SYNC_ROOT|g" \
  "$INSTALL_DIR/notesnook-mcp.service" > "$SERVICE_FILE"

echo "Systemd service written to: $SERVICE_FILE"

# 7. Enable service
systemctl --user daemon-reload
systemctl --user enable notesnook-mcp
echo "Service enabled."

# 8. Instructions
echo ""
echo "=== Setup complete ==="
echo ""
echo "To start the server now:"
echo "  systemctl --user start notesnook-mcp"
echo ""
echo "To run the first-run wizard:"
echo "  NOTESNOOK_SYNC_ROOT=\"$SYNC_ROOT\" node \"$INSTALL_DIR/dist/index.js\""
echo ""
echo "The server will listen on http://127.0.0.1:3457/sse"
echo ""
echo "Add to your openclaw.json:"
echo '{'
echo '  "agents": {'
echo '    "list": [{'
echo '      "id": "main",'
echo '      "mcp": {'
echo '        "servers": [{'
echo '          "name": "notesnook",'
echo '          "type": "sse",'
echo '          "url": "http://localhost:3457/sse"'
echo '        }]'
echo '      }'
echo '    }]'
echo '  }'
echo '}'
echo ""

# 9. Run first-time wizard
echo "Starting first-run wizard..."
NOTESNOOK_SYNC_ROOT="$SYNC_ROOT" node "$INSTALL_DIR/dist/index.js"
