# notesnook-mcp-server

MCP server bridging [Notesnook](https://notesnook.com) with OpenClaw. Syncs notes hourly via the filesystem and exposes bidirectional note operations over HTTP/SSE.

## Prerequisites

- Node.js >= 22
- Notesnook desktop app (Linux)

## Installation

```bash
./install.sh
```

The installer will:
1. Check Node.js version
2. Run `npm install` and `npm run build`
3. Prompt for your sync folder path
4. Create `export/` and `import/` subdirectories
5. Install and enable the systemd user service
6. Run the first-run wizard to configure notebook access

## Sync Model

```
Notesnook App (GUI)
    │
    │  Export all notes → Markdown → save zip to {SYNC_ROOT}/export/
    │
    ▼
{SYNC_ROOT}/
├── export/          ← Notesnook drops .zip exports here
│   └── extracted/  ← MCP server extracts zips here (auto-managed)
├── import/          ← MCP server writes new/updated .md files here
│   └── {notebook}/ ← One subfolder per notebook
└── notesnook.db     ← SQLite index maintained by MCP server

notesnook-mcp-server (HTTP/SSE daemon on :3457)
    ├── Sync Engine (hourly cron + chokidar watcher)
    │     ├── Unzips latest export → parses Markdown
    │     ├── Derives notebook from folder structure
    │     ├── Diffs against SQLite index (last-write-wins)
    │     └── Writes agent notes to import/{notebook}/*.md
    │
    └── MCP HTTP/SSE server
          └── 9 tools (search, get, create, update, notebooks, todo, sync)
```

## Export from Notesnook

1. Open Notesnook desktop
2. Go to **Settings → Backup & Export**
3. Choose **Export all notes → Markdown**
4. Save the `.zip` file to `{SYNC_ROOT}/export/`

The server will detect the new zip within seconds (chokidar watcher) or at the next hourly cron tick.

## Import to Notesnook

Notes created or updated by OpenClaw are written to `{SYNC_ROOT}/import/{notebook}/`. Notesnook will pick them up on the next app open.

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NOTESNOOK_SYNC_ROOT` | Yes | — | Path to your sync folder |
| `PORT` | No | `3457` | HTTP server port |

### config.json

Stored at `{SYNC_ROOT}/config.json`. Edited via the first-run wizard or `notesnook_configure_notebook_access` tool.

```json
{
  "syncRoot": "/path/to/sync",
  "enabledNotebooks": ["daily survival", "art stuff"],
  "firstRunComplete": true,
  "lastSyncAt": "2025-01-01T12:00:00.000Z"
}
```

## OpenClaw Integration

Add to your `openclaw.json`:

```json
{
  "agents": {
    "list": [{
      "id": "main",
      "mcp": {
        "servers": [{
          "name": "notesnook",
          "type": "sse",
          "url": "http://localhost:3457/sse"
        }]
      }
    }]
  }
}
```

The server must be running (started automatically by systemd after installation).

## Available Tools

| Tool | Description |
|------|-------------|
| `notesnook_search_notes` | Search notes by keyword, notebook, or tag |
| `notesnook_get_note` | Retrieve full content of a note by ID |
| `notesnook_create_note` | Create a new note |
| `notesnook_update_note` | Update a note's content, title, or tags |
| `notesnook_list_notebooks` | List notebooks and their access status |
| `notesnook_configure_notebook_access` | Enable or disable notebook access |
| `notesnook_get_todo` | Get the daily to-do list |
| `notesnook_update_todo` | Add, complete, or remove to-do items |
| `notesnook_trigger_sync` | Force an immediate sync |

## Note Format

Notes are plain Markdown with no YAML front matter:

```markdown
# Note Title

Note body content here...

- [ ] Incomplete item
- [x] Completed item
```

Notebooks are represented by folder names in the export zip.

## License

MIT + Commons Clause — non-commercial use only. See [LICENSE](LICENSE).
