# Installing notesnook-mcp-server with OpenClaw

## Prerequisites

- Node.js >= 22 (`node --version`)
- Notesnook desktop app installed and running
- OpenClaw installed and configured

---

## Step 1 — Clone and build

```bash
git clone https://github.com/johnfire/openclaw-notesnook-mcp.git
cd openclaw-notesnook-mcp
./install.sh
```

The installer will:
- Install Node dependencies and build the TypeScript
- Ask for your sync folder path (e.g. `~/notesnook-sync`)
- Create `export/` and `import/` subdirectories inside it
- Install and enable a systemd user service so the server starts on login
- Run the first-run wizard to select which notebooks OpenClaw can access

---

## Step 2 — Export your notes from Notesnook

1. Open Notesnook desktop
2. Go to **Settings → Backup & Export**
3. Select **Export all notes → Markdown**
4. Save the `.zip` file into your sync folder's `export/` directory

The server will detect it automatically and index your notes.

---

## Step 3 — Add to OpenClaw

In your `openclaw.json`, add the notesnook server to your agent's MCP servers list:

```json
{
  "agents": {
    "list": [
      {
        "id": "main",
        "mcp": {
          "servers": [
            {
              "name": "notesnook",
              "type": "sse",
              "url": "http://localhost:3457/sse"
            }
          ]
        }
      }
    ]
  }
}
```

---

## Step 4 — Start the server

If the systemd service was installed:

```bash
systemctl --user start notesnook-mcp
systemctl --user status notesnook-mcp
```

Or run it directly for testing:

```bash
NOTESNOOK_SYNC_ROOT=~/notesnook-sync node dist/index.js
```

The server listens on `http://127.0.0.1:3457`. Restart OpenClaw and the `notesnook_*` tools will be available.

---

## Keeping notes in sync

| Direction | How |
|-----------|-----|
| Notesnook → OpenClaw | Re-export from Notesnook, drop zip in `export/` — server picks it up within seconds |
| OpenClaw → Notesnook | Agent writes to `import/` automatically; Notesnook imports on next app open |

The server also syncs automatically every hour via cron.

---

## Troubleshooting

**Tools not appearing in OpenClaw**
- Confirm the server is running: `curl http://localhost:3457/health`
- Check logs: `journalctl --user -u notesnook-mcp -f`

**No notes found after sync**
- Make sure you saved the Notesnook export zip into `{SYNC_ROOT}/export/`
- Run a manual sync via the `notesnook_trigger_sync` tool or restart the server

**Notebook not accessible**
- Use the `notesnook_list_notebooks` tool (with `include_disabled: true`) to see all notebooks
- Enable access with `notesnook_configure_notebook_access`

**Change which notebooks OpenClaw can access**
- Use the `notesnook_configure_notebook_access` tool from within OpenClaw
- Or edit `{SYNC_ROOT}/config.json` directly and restart the server
