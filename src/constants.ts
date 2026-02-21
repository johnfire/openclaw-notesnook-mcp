// constants.ts — shared configuration and limits for notesnook-mcp-server

export const SERVER_NAME = "notesnook-mcp-server";
export const SERVER_VERSION = "1.0.0";

// Sync
export const SYNC_INTERVAL_MINUTES = 60;       // hourly sync cycle
export const SYNC_CRON = "0 * * * *";          // top of every hour
export const IMPORT_DELAY_MS = 2000;            // wait after writing before Notesnook picks up

// File system
export const DEFAULT_EXPORT_DIR = "export";     // subfolder under SYNC_ROOT
export const DEFAULT_IMPORT_DIR = "import";     // subfolder under SYNC_ROOT
export const DEFAULT_DB_FILE = "notesnook.db";  // SQLite index filename
export const CONFIG_FILE = "config.json";        // notebook access config

// Notesnook export zip
export const EXPORT_ZIP_GLOB = "*.zip";         // Notesnook exports a single zip
export const NOTE_EXTENSION = ".md";

// Notesnook metadata markers (written into front matter by export)
export const FRONTMATTER_SEPARATOR = "---";

// Response limits
export const CHARACTER_LIMIT = 8000;            // max chars in a single tool response
export const MAX_RESULTS_DEFAULT = 20;
export const MAX_RESULTS_LIMIT = 100;

// Todo note
export const TODO_NOTE_TITLE = "Daily To-Do List";
export const TODO_NOTEBOOK = "OpenClaw";        // default notebook for agent-created notes

// Conflict resolution
export const CONFLICT_STRATEGY = "last-write-wins" as const;
