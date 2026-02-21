# notesnook-mcp-server — Claude Code Build Brief

## Project Summary

Build a **TypeScript MCP (Model Context Protocol) server** that bridges Notesnook (a private, end-to-end encrypted note-taking app) with OpenClaw (a local AI agent framework). The server runs as a **background daemon** on Linux, syncs notes hourly via the filesystem (no Notesnook API exists), and exposes bidirectional note operations to OpenClaw via **MCP stdio transport**.

---

## Owner & License

- **Author**: Christopher Rehm  
- **License**: MIT + Commons Clause (non-commercial — see `LICENSE` file already created)
- **Target platform**: Linux desktop, Node.js 22+
- **Publish target**: OpenClaw skill registry (ClawHub)

---

## Architecture

```
Notesnook App (GUI)
    │
    │  User manually triggers export hourly OR automated via cron+xdotool (future)
    │  Exports as .zip of Markdown files to:  {SYNC_ROOT}/export/
    │
    ▼
{SYNC_ROOT}/
├── export/          ← Notesnook drops .zip exports here
├── import/          ← MCP server writes new/updated .md files here
│                      Notesnook imports from here on next open
└── notesnook.db     ← SQLite index maintained by MCP server

notesnook-mcp-server (daemon)
    ├── Sync Engine (node-cron, hourly)
    │     ├── Unzips latest export → parses Markdown + front matter
    │     ├── Diffs against SQLite index (last-write-wins on conflict)
    │     ├── Updates index
    │     └── Writes agent-created/modified notes to import/ as .md
    │
    ├── MCP stdio server (@modelcontextprotocol/sdk)
    │     └── Tools (see full list below)
    │
    └── First-run wizard
          ├── Asks user for SYNC_ROOT path
          ├── Discovers all notebooks from export
          ├── Asks which notebooks OpenClaw may access
          └── Writes config.json
```

### Key Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Sync mechanism | Filesystem (zip export/import) | No Notesnook API exists |
| Sync frequency | Hourly cron | User specified |
| Conflict resolution | Last-write-wins | User specified |
| Local index | SQLite (better-sqlite3) | Fast, zero-config, file-based |
| Transport | MCP stdio | Local daemon, single OpenClaw client |
| Note format | Markdown with YAML front matter | Notesnook's native export format |
| New note notebook | Infer from context, fallback "OpenClaw" | User specified |
| Todo note | Single rolling note titled "Daily To-Do List" | User specified |
| Bidirectional | Yes — read AND write | User specified |

---

## Directory Structure to Build

```
notesnook-mcp-server/
├── LICENSE                         ← already created
├── package.json                    ← already created
├── tsconfig.json                   ← already created
├── README.md                       ← create
├── SKILL.md                        ← create (OpenClaw skill descriptor)
├── install.sh                      ← create (setup script)
├── notesnook-mcp.service           ← create (systemd unit file)
└── src/
    ├── index.ts                    ← create (MCP server entry point)
    ├── constants.ts                ← already created
    ├── types.ts                    ← already created
    ├── wizard.ts                   ← create (first-run notebook discovery)
    ├── schemas/
    │   └── tool-schemas.ts         ← create (all Zod input schemas)
    ├── services/
    │   ├── db.ts                   ← create (SQLite init + CRUD)
    │   ├── parser.ts               ← create (Markdown + front matter parser)
    │   ├── sync.ts                 ← create (export unzip + import write)
    │   └── config.ts               ← create (read/write config.json)
    └── tools/
        ├── notes.ts                ← create (search, get, create, update)
        ├── notebooks.ts            ← create (list, configure access)
        └── todo.ts                 ← create (get/update daily todo)
```

---

## Files Already Created (do not recreate)

### `package.json`
```json
{
  "name": "notesnook-mcp-server",
  "version": "1.0.0",
  "description": "MCP server for Notesnook — bidirectional sync with OpenClaw agent support",
  "main": "dist/index.js",
  "bin": { "notesnook-mcp": "dist/index.js" },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "ts-node src/index.ts",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "adm-zip": "^0.5.12",
    "better-sqlite3": "^9.4.3",
    "chokidar": "^3.6.0",
    "node-cron": "^3.0.3",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/adm-zip": "^0.5.5",
    "@types/better-sqlite3": "^7.6.8",
    "@types/node": "^20.11.0",
    "@types/node-cron": "^3.0.11",
    "typescript": "^5.3.3"
  },
  "engines": { "node": ">=22.0.0" }
}
```

### `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### `src/constants.ts`
```typescript
export const SERVER_NAME = "notesnook-mcp-server";
export const SERVER_VERSION = "1.0.0";
export const SYNC_INTERVAL_MINUTES = 60;
export const SYNC_CRON = "0 * * * *";
export const IMPORT_DELAY_MS = 2000;
export const DEFAULT_EXPORT_DIR = "export";
export const DEFAULT_IMPORT_DIR = "import";
export const DEFAULT_DB_FILE = "notesnook.db";
export const CONFIG_FILE = "config.json";
export const EXPORT_ZIP_GLOB = "*.zip";
export const NOTE_EXTENSION = ".md";
export const FRONTMATTER_SEPARATOR = "---";
export const CHARACTER_LIMIT = 8000;
export const MAX_RESULTS_DEFAULT = 20;
export const MAX_RESULTS_LIMIT = 100;
export const TODO_NOTE_TITLE = "Daily To-Do List";
export const TODO_NOTEBOOK = "OpenClaw";
export const CONFLICT_STRATEGY = "last-write-wins" as const;
```

### `src/types.ts`
```typescript
export interface NoteMetadata {
  id: string;
  title: string;
  notebook: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  filePath: string;
}

export interface Note extends NoteMetadata {
  content: string;
  rawFrontMatter: string;
}

export interface Notebook {
  name: string;
  noteCount: number;
  enabled: boolean;
}

export interface ServerConfig {
  syncRoot: string;
  enabledNotebooks: string[];
  firstRunComplete: boolean;
  lastSyncAt: string | null;
}

export type SyncDirection = "import" | "export" | "both";

export interface SyncResult {
  direction: SyncDirection;
  notesRead: number;
  notesWritten: number;
  conflicts: number;
  errors: string[];
  syncedAt: string;
}

export interface SearchResult {
  id: string;
  title: string;
  notebook: string;
  tags: string[];
  updatedAt: string;
  excerpt: string;
}

export interface TodoItem {
  text: string;
  done: boolean;
  addedAt: string;
}

export interface TodoNote {
  items: TodoItem[];
  updatedAt: string;
}

export interface NoteRow {
  id: string;
  title: string;
  notebook: string;
  tags: string;
  content: string;
  raw_front_matter: string;
  file_path: string;
  created_at: string;
  updated_at: string;
}

export interface ConfigRow {
  key: string;
  value: string;
}
```

---

## Files to Build — Detailed Specifications

---

### `src/services/config.ts`

Reads and writes `config.json` in the sync root. Handles first-run detection.

```typescript
// Functions to implement:

// loadConfig(syncRoot: string): ServerConfig
//   - reads {syncRoot}/config.json
//   - returns defaults if file doesn't exist:
//     { syncRoot, enabledNotebooks: [], firstRunComplete: false, lastSyncAt: null }

// saveConfig(config: ServerConfig): void
//   - writes config to {config.syncRoot}/config.json

// getSyncRoot(): string
//   - reads NOTESNOOK_SYNC_ROOT env var
//   - if not set, throws with helpful message:
//     "Set NOTESNOOK_SYNC_ROOT env var to your sync folder path"
```

---

### `src/services/db.ts`

SQLite database layer using `better-sqlite3` (synchronous API — correct for this use case).

```typescript
// Schema to create on init:

// TABLE notes (
//   id           TEXT PRIMARY KEY,
//   title        TEXT NOT NULL,
//   notebook     TEXT NOT NULL,
//   tags         TEXT NOT NULL DEFAULT '[]',   -- JSON array string
//   content      TEXT NOT NULL DEFAULT '',
//   raw_front_matter TEXT NOT NULL DEFAULT '',
//   file_path    TEXT NOT NULL,
//   created_at   TEXT NOT NULL,
//   updated_at   TEXT NOT NULL
// )

// TABLE sync_meta (
//   key   TEXT PRIMARY KEY,
//   value TEXT NOT NULL
// )

// Functions to implement:

// initDb(dbPath: string): Database
//   - opens/creates SQLite db
//   - runs CREATE TABLE IF NOT EXISTS for both tables
//   - returns db instance

// upsertNote(db, note: Note): void
//   - INSERT OR REPLACE into notes table
//   - tags stored as JSON.stringify(note.tags)

// getNoteById(db, id: string): Note | null

// getNoteByTitle(db, title: string): Note | null

// searchNotes(db, query: string, notebooks: string[], limit: number, offset: number): SearchResult[]
//   - full-text search on title + content using LIKE %query%
//   - filter to enabled notebooks only
//   - returns SearchResult[] (id, title, notebook, tags, updatedAt, excerpt)
//   - excerpt = first 200 chars of content

// listNotesByNotebook(db, notebook: string, limit: number, offset: number): SearchResult[]

// getAllNotebooks(db): string[]
//   - SELECT DISTINCT notebook FROM notes

// deleteNote(db, id: string): void

// getLastSyncTime(db): string | null
//   - SELECT value FROM sync_meta WHERE key = 'last_sync'

// setLastSyncTime(db, isoString: string): void
```

---

### `src/services/parser.ts`

Parses Notesnook Markdown export format (YAML front matter + body).

Notesnook export format example:
```
---
title: My Note Title
notebook: Work
tags: [project, ideas]
created: 2024-01-15T10:30:00Z
updated: 2024-01-20T14:22:00Z
id: abc123def456
---

# My Note Title

Note body content here...
```

```typescript
// Functions to implement:

// parseFrontMatter(raw: string): { meta: Record<string, unknown>, body: string, rawFrontMatter: string }
//   - splits on first pair of '---' delimiters
//   - parses YAML-like key: value pairs (simple parser, no full YAML lib needed)
//   - returns meta object, body text, and the raw front matter block

// noteFromFile(filePath: string, notebook: string): Note
//   - reads file
//   - calls parseFrontMatter
//   - constructs Note object
//   - generates stable id: use meta.id if present, else sha256 of filePath

// noteToMarkdown(note: Note): string
//   - serialises a Note back to Markdown with front matter
//   - always writes: title, notebook, tags, created, updated, id
//   - appends note.content as body

// generateId(input: string): string
//   - returns hex sha256 of input (use Node crypto module)

// sanitizeFilename(title: string): string
//   - replaces spaces with underscores, strips special chars
//   - max 80 chars, lowercase
//   - appends .md
```

---

### `src/services/sync.ts`

The core sync engine. Runs on cron and on demand.

```typescript
// Functions to implement:

// findLatestExportZip(exportDir: string): string | null
//   - lists .zip files in exportDir
//   - returns the most recently modified one, or null if none

// unzipExport(zipPath: string, targetDir: string): string[]
//   - uses adm-zip to extract all .md files to targetDir/extracted/
//   - returns array of extracted file paths

// syncFromExport(db: Database, config: ServerConfig): Promise<SyncResult>
//   - calls findLatestExportZip
//   - calls unzipExport to a temp subdirectory
//   - walks extracted .md files
//   - for each file: calls parser.noteFromFile
//   - checks if note already in db
//   - CONFLICT: if note exists and fileMtime > db.updated_at → update (last-write-wins)
//   - if note doesn't exist → insert
//   - returns SyncResult

// writeNoteToImport(note: Note, importDir: string): Promise<void>
//   - calls noteToMarkdown
//   - writes to {importDir}/{sanitizeFilename(note.title)}
//   - waits IMPORT_DELAY_MS

// runFullSync(db: Database, config: ServerConfig): Promise<SyncResult>
//   - calls syncFromExport
//   - logs result to stderr (NOT stdout — MCP uses stdout)
//   - updates last sync time in db
```

---

### `src/wizard.ts`

Interactive first-run setup. Runs when `config.firstRunComplete === false`.

```typescript
// Flow:
// 1. Print welcome message to stderr
// 2. Prompt: "Enter the full path to your Notesnook sync folder:"
//    - use readline from Node stdlib
//    - validate the path exists and is a directory
//    - create export/ and import/ subdirs if they don't exist
// 3. Print: "Scanning for notebooks in export folder..."
//    - look for any .zip in export/ dir
//    - if found, unzip and parse to discover notebook names
//    - if not found, print instructions for exporting from Notesnook
// 4. Print discovered notebooks, numbered list
// 5. Prompt: "Enter notebook numbers to give OpenClaw access (comma-separated, or 'all'):"
// 6. Save config with selections
// 7. Print OpenClaw config snippet to add to openclaw.json (see below)
// 8. Set config.firstRunComplete = true, save

// OpenClaw config snippet to print:
// {
//   "agents": {
//     "list": [{
//       "id": "main",
//       "mcp": {
//         "servers": [{
//           "name": "notesnook",
//           "command": "node",
//           "args": ["/path/to/notesnook-mcp-server/dist/index.js"],
//           "env": {
//             "NOTESNOOK_SYNC_ROOT": "/path/to/sync/folder"
//           }
//         }]
//       }
//     }]
//   }
// }
```

---

### `src/schemas/tool-schemas.ts`

All Zod input schemas. Import these into the tool files.

```typescript
import { z } from "zod";

export const SearchNotesSchema = z.object({
  query: z.string().min(1).max(200).describe("Search terms to find in note titles and content"),
  notebook: z.string().optional().describe("Filter to a specific notebook name"),
  tags: z.array(z.string()).optional().describe("Filter by tags (AND logic)"),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  response_format: z.enum(["markdown", "json"]).default("markdown")
}).strict();

export const GetNoteSchema = z.object({
  id: z.string().describe("Note ID from search results"),
  response_format: z.enum(["markdown", "json"]).default("markdown")
}).strict();

export const CreateNoteSchema = z.object({
  title: z.string().min(1).max(200).describe("Note title"),
  content: z.string().describe("Note body in Markdown format"),
  notebook: z.string().optional().describe("Notebook to create in. If omitted, inferred from content or defaults to 'OpenClaw'"),
  tags: z.array(z.string()).optional().describe("Tags to apply")
}).strict();

export const UpdateNoteSchema = z.object({
  id: z.string().describe("Note ID to update"),
  content: z.string().optional().describe("New note body (replaces existing)"),
  append: z.string().optional().describe("Text to append to existing content"),
  title: z.string().min(1).max(200).optional().describe("New title"),
  tags: z.array(z.string()).optional().describe("Replace tags list")
}).strict().refine(
  data => data.content !== undefined || data.append !== undefined || data.title !== undefined || data.tags !== undefined,
  { message: "At least one of content, append, title, or tags must be provided" }
);

export const ListNotebooksSchema = z.object({
  include_disabled: z.boolean().default(false).describe("Include notebooks not enabled for OpenClaw access"),
  response_format: z.enum(["markdown", "json"]).default("markdown")
}).strict();

export const ConfigureNotebookAccessSchema = z.object({
  notebook: z.string().describe("Notebook name to configure"),
  enabled: z.boolean().describe("True to grant OpenClaw access, false to revoke")
}).strict();

export const GetTodoSchema = z.object({
  response_format: z.enum(["markdown", "json"]).default("markdown")
}).strict();

export const UpdateTodoSchema = z.object({
  add: z.array(z.string()).optional().describe("Items to add to the to-do list"),
  complete: z.array(z.string()).optional().describe("Item text snippets to mark as done (partial match)"),
  remove: z.array(z.string()).optional().describe("Item text snippets to remove entirely (partial match)"),
  replace_all: z.array(z.string()).optional().describe("Replace entire list with these items")
}).strict().refine(
  data => data.add || data.complete || data.remove || data.replace_all,
  { message: "At least one of add, complete, remove, or replace_all must be provided" }
);

export const TriggerSyncSchema = z.object({}).strict();
```

---

### `src/tools/notes.ts`

```typescript
// Register these 4 tools on the McpServer instance:

// 1. notesnook_search_notes
//    inputSchema: SearchNotesSchema
//    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
//    - calls db.searchNotes with enabled notebooks filter
//    - returns list of SearchResult
//    - truncates to CHARACTER_LIMIT with message if exceeded

// 2. notesnook_get_note
//    inputSchema: GetNoteSchema
//    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
//    - calls db.getNoteById
//    - returns full Note content
//    - error if note not found or notebook not enabled

// 3. notesnook_create_note
//    inputSchema: CreateNoteSchema
//    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
//    - infers notebook: if notebook param given, use it; else scan content for context clues
//      (e.g. "project" → Projects notebook if it exists; default → TODO_NOTEBOOK constant)
//    - creates Note object with new UUID
//    - upserts to db
//    - writes .md to import dir via sync.writeNoteToImport
//    - returns created note id and title

// 4. notesnook_update_note
//    inputSchema: UpdateNoteSchema
//    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
//    - fetches existing note from db
//    - applies content/append/title/tags changes
//    - updates updatedAt to now
//    - upserts to db
//    - writes .md to import dir
//    - returns updated note id and title
```

---

### `src/tools/notebooks.ts`

```typescript
// Register these 2 tools:

// 1. notesnook_list_notebooks
//    inputSchema: ListNotebooksSchema
//    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
//    - calls db.getAllNotebooks
//    - joins with config.enabledNotebooks to show enabled status
//    - returns Notebook[]

// 2. notesnook_configure_notebook_access
//    inputSchema: ConfigureNotebookAccessSchema
//    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
//    - validates notebook exists in db
//    - updates config.enabledNotebooks
//    - saves config
//    - returns confirmation message
```

---

### `src/tools/todo.ts`

```typescript
// Register these 2 tools:

// 1. notesnook_get_todo
//    inputSchema: GetTodoSchema
//    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
//    - finds note with title === TODO_NOTE_TITLE in db
//    - parses content as todo list:
//      - lines starting with "- [ ]" → incomplete items
//      - lines starting with "- [x]" → complete items
//      - other non-empty lines → incomplete items (legacy)
//    - returns TodoNote

// 2. notesnook_update_todo
//    inputSchema: UpdateTodoSchema
//    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
//    - loads existing todo note (or creates one if absent)
//    - applies add / complete / remove / replace_all operations
//    - serialises back to Markdown checkbox format
//    - calls notesnook_update_note internally (or direct db + write)
//    - returns updated TodoNote
```

---

### `src/index.ts` — Main Entry Point

```typescript
// Structure:

// 1. Import McpServer, StdioServerTransport from MCP SDK
// 2. Import all tool registration functions from tools/
// 3. Import sync engine, db, config, wizard

// Startup sequence:
// a) getSyncRoot() — read env var or error
// b) loadConfig(syncRoot)
// c) if !config.firstRunComplete → run wizard, then re-load config
// d) initDb(path.join(syncRoot, DEFAULT_DB_FILE))
// e) Register all tools on McpServer
// f) Start cron job: SYNC_CRON → runFullSync(db, config)
// g) Run initial sync on startup (don't wait for first cron tick)
// h) Connect StdioServerTransport and start listening

// Also register one extra tool:
// notesnook_trigger_sync
//   inputSchema: TriggerSyncSchema
//   description: "Force an immediate sync with Notesnook without waiting for the hourly schedule"
//   annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
//   - calls runFullSync(db, config)
//   - returns SyncResult summary

// CRITICAL: All logging must go to process.stderr, NEVER process.stdout
//           MCP uses stdout for the protocol — any console.log will break it
//           Use: console.error(...) for all logging
```

---

### `install.sh`

```bash
#!/bin/bash
# notesnook-mcp-server installer for Linux

# 1. Check node >= 22
# 2. npm install
# 3. npm run build
# 4. Prompt for SYNC_ROOT path
# 5. Create sync folder structure: {SYNC_ROOT}/export/ and {SYNC_ROOT}/import/
# 6. Write systemd user service file to ~/.config/systemd/user/notesnook-mcp.service
#    (using the template in notesnook-mcp.service, substituting paths)
# 7. systemctl --user daemon-reload
# 8. systemctl --user enable notesnook-mcp
# 9. Print success and instructions for adding to openclaw.json
# 10. Run: node dist/index.js (first-run wizard)
```

---

### `notesnook-mcp.service` — systemd unit file

```ini
[Unit]
Description=Notesnook MCP Server
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/node INSTALL_DIR/dist/index.js
Environment=NOTESNOOK_SYNC_ROOT=SYNC_ROOT_PATH
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
```

---

### `SKILL.md` — OpenClaw skill descriptor

```markdown
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
4. In Notesnook: Settings → Backup → Export all notes → Markdown → save to {SYNC_ROOT}/export/

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

- **Export**: Notesnook → export/ folder (zip of Markdown files)
- **Import**: import/ folder → Notesnook (on next app open)
- **Frequency**: Hourly (or manual via `notesnook_trigger_sync`)
- **Conflicts**: Last-write-wins
```

---

### `README.md`

Include:
- Project description
- Prerequisites (Node 22+, Notesnook desktop)
- Installation steps (run install.sh)
- How the sync model works (diagram as ASCII art)
- All available tools with descriptions
- Configuration (env vars, config.json structure)
- How to export from Notesnook (step by step)
- How to set up Notesnook auto-import
- OpenClaw integration snippet
- License note

---

## Build & Validation Steps

After writing all files, Claude Code should:

```bash
cd notesnook-mcp-server
npm install
npm run build
```

The build must complete with zero TypeScript errors. If there are errors, fix them before finishing.

Then verify the entry point exists:
```bash
ls -la dist/index.js
```

---

## Important Implementation Notes

1. **Never use `console.log`** — MCP stdio uses stdout for the protocol. All logging must use `console.error()`.

2. **better-sqlite3 is synchronous** — that's intentional and correct. Do not add async wrappers.

3. **Tags in SQLite** — stored as JSON string `'["tag1","tag2"]'`, always `JSON.parse` on read and `JSON.stringify` on write.

4. **File watching** — chokidar is included as a dependency for watching the export folder, but the primary trigger is cron. Use chokidar as a secondary trigger if a new zip appears in the export folder between cron ticks.

5. **ID stability** — notes must have stable IDs. Prefer Notesnook's own ID from front matter if present. Only generate a new ID when creating brand new notes from OpenClaw.

6. **Notebook inference** — when creating a note without explicit notebook:
   - Check if content mentions a keyword matching any enabled notebook name
   - Fall back to `TODO_NOTEBOOK` constant ("OpenClaw")

7. **Front matter preservation** — when updating a note, preserve the original `rawFrontMatter` fields not managed by the server (any custom fields the user may have).

8. **Error handling** — all tool handlers must catch errors and return `{ isError: true, content: [{ type: "text", text: "Error: ..." }] }` — never let exceptions propagate to the MCP transport layer.

9. **Character limit** — if a tool response would exceed `CHARACTER_LIMIT` (8000 chars), truncate and append: `"\n\n[Truncated — use get_note with specific ID for full content]"`

10. **Zod `.strict()`** — all schemas use `.strict()` to reject unknown fields.
