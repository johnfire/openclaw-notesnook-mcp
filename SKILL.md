---
name: notesnook
description: >
  Connects OpenClaw to your Notesnook note-taking app via MCP.
  Enables reading, searching, creating, and updating notes and notebooks.
  Manages a daily rolling to-do list. Syncs hourly via filesystem export/import.
  Use when the user mentions notes, to-do lists, Notesnook, notebooks, or
  asks to remember, record, or retrieve information.
version: 1.0.0
author: Christopher Rehm
license: MIT + Commons Clause (non-commercial)
requires:
  - node >= 22
  - Notesnook desktop app
---

## Setup

1. Run `./install.sh` from the project directory
2. Follow the first-run wizard to select your sync folder and notebooks
3. Add the generated config snippet to your `openclaw.json`
4. In Notesnook: Settings → Backup & Export → Export all notes → Markdown → save to {SYNC_ROOT}/export/

## Connection

The server runs as an HTTP/SSE daemon on `http://localhost:3457/sse`.

OpenClaw config:
```json
{
  "name": "notesnook",
  "type": "sse",
  "url": "http://localhost:3457/sse"
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `notesnook_search_notes` | Search notes by keyword, notebook, or tag |
| `notesnook_get_note` | Retrieve full content of a specific note |
| `notesnook_create_note` | Create a new note (written to Notesnook import folder) |
| `notesnook_update_note` | Update an existing note's content, title, or tags |
| `notesnook_list_notebooks` | List all notebooks and their OpenClaw access status |
| `notesnook_configure_notebook_access` | Grant or revoke OpenClaw access to a notebook |
| `notesnook_get_todo` | Get the daily to-do list |
| `notesnook_update_todo` | Add, complete, or remove to-do items |
| `notesnook_trigger_sync` | Force an immediate sync without waiting for hourly schedule |

## Sync Model

- **Export**: Notesnook → export/ folder (zip of Markdown files, folder per notebook)
- **Import**: import/ folder → Notesnook (on next app open)
- **Frequency**: Hourly (or manual via `notesnook_trigger_sync`)
- **Conflicts**: Last-write-wins
- **Format**: Plain Markdown, `# Title` heading, notebook from folder structure
