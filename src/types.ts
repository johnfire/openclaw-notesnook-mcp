// types.ts — shared TypeScript interfaces for notesnook-mcp-server

// ─── Note model ─────────────────────────────────────────────────────────────

export interface NoteMetadata {
  id: string;             // stable UUID derived from filename or front matter
  title: string;
  notebook: string;       // parent notebook name
  tags: string[];
  createdAt: string;      // ISO 8601
  updatedAt: string;      // ISO 8601
  filePath: string;       // absolute path to the .md file on disk
}

export interface Note extends NoteMetadata {
  content: string;        // full markdown body (without front matter)
  rawFrontMatter: string; // original front matter block, preserved on write
}

// ─── Notebook model ──────────────────────────────────────────────────────────

export interface Notebook {
  name: string;
  noteCount: number;
  enabled: boolean;       // whether OpenClaw has access (user-configured)
}

// ─── Config ──────────────────────────────────────────────────────────────────

export interface ServerConfig {
  syncRoot: string;                  // abs path to the shared sync folder
  enabledNotebooks: string[];        // notebook names the user has granted access to
  firstRunComplete: boolean;
  lastSyncAt: string | null;         // ISO 8601 or null
}

// ─── Sync ────────────────────────────────────────────────────────────────────

export type SyncDirection = "import" | "export" | "both";

export interface SyncResult {
  direction: SyncDirection;
  notesRead: number;
  notesWritten: number;
  conflicts: number;
  errors: string[];
  syncedAt: string;       // ISO 8601
}

// ─── Tool responses ───────────────────────────────────────────────────────────

export interface SearchResult {
  id: string;
  title: string;
  notebook: string;
  tags: string[];
  updatedAt: string;
  excerpt: string;        // first ~200 chars of content
}

export interface TodoItem {
  text: string;
  done: boolean;
  addedAt: string;        // ISO 8601
}

export interface TodoNote {
  items: TodoItem[];
  updatedAt: string;
}

// ─── Database row shapes ─────────────────────────────────────────────────────

export interface NoteRow {
  id: string;
  title: string;
  notebook: string;
  tags: string;           // JSON string — stored as text in SQLite
  content: string;
  raw_front_matter: string;
  file_path: string;
  created_at: string;
  updated_at: string;
}

export interface ConfigRow {
  key: string;
  value: string;          // JSON string
}
