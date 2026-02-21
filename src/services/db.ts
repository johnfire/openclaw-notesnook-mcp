import Database from "better-sqlite3";
import { Note, NoteRow, SearchResult } from "../types.js";

export function initDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id           TEXT PRIMARY KEY,
      title        TEXT NOT NULL,
      notebook     TEXT NOT NULL,
      tags         TEXT NOT NULL DEFAULT '[]',
      content      TEXT NOT NULL DEFAULT '',
      raw_front_matter TEXT NOT NULL DEFAULT '',
      file_path    TEXT NOT NULL,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

export function upsertNote(db: Database.Database, note: Note): void {
  db.prepare(`
    INSERT OR REPLACE INTO notes
      (id, title, notebook, tags, content, raw_front_matter, file_path, created_at, updated_at)
    VALUES
      (@id, @title, @notebook, @tags, @content, @raw_front_matter, @file_path, @created_at, @updated_at)
  `).run({
    id: note.id,
    title: note.title,
    notebook: note.notebook,
    tags: JSON.stringify(note.tags),
    content: note.content,
    raw_front_matter: note.rawFrontMatter,
    file_path: note.filePath,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
  });
}

function rowToNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    notebook: row.notebook,
    tags: JSON.parse(row.tags) as string[],
    content: row.content,
    rawFrontMatter: row.raw_front_matter,
    filePath: row.file_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToSearchResult(row: NoteRow): SearchResult {
  return {
    id: row.id,
    title: row.title,
    notebook: row.notebook,
    tags: JSON.parse(row.tags) as string[],
    updatedAt: row.updated_at,
    excerpt: row.content.slice(0, 200),
  };
}

export function getNoteById(db: Database.Database, id: string): Note | null {
  const row = db.prepare("SELECT * FROM notes WHERE id = ?").get(id) as NoteRow | undefined;
  return row ? rowToNote(row) : null;
}

export function getNoteByTitle(db: Database.Database, title: string): Note | null {
  const row = db.prepare("SELECT * FROM notes WHERE title = ? COLLATE NOCASE").get(title) as NoteRow | undefined;
  return row ? rowToNote(row) : null;
}

export function searchNotes(
  db: Database.Database,
  query: string,
  notebooks: string[],
  limit: number,
  offset: number
): SearchResult[] {
  const term = `%${query}%`;
  const placeholders = notebooks.map(() => "?").join(", ");
  const rows = db.prepare(`
    SELECT * FROM notes
    WHERE (title LIKE ? OR content LIKE ?)
      AND notebook IN (${placeholders})
    ORDER BY updated_at DESC
    LIMIT ? OFFSET ?
  `).all(term, term, ...notebooks, limit, offset) as NoteRow[];
  return rows.map(rowToSearchResult);
}

export function listNotesByNotebook(
  db: Database.Database,
  notebook: string,
  limit: number,
  offset: number
): SearchResult[] {
  const rows = db.prepare(`
    SELECT * FROM notes WHERE notebook = ?
    ORDER BY updated_at DESC
    LIMIT ? OFFSET ?
  `).all(notebook, limit, offset) as NoteRow[];
  return rows.map(rowToSearchResult);
}

export function getAllNotebooks(db: Database.Database): string[] {
  const rows = db.prepare("SELECT DISTINCT notebook FROM notes ORDER BY notebook").all() as { notebook: string }[];
  return rows.map((r) => r.notebook);
}

export function deleteNote(db: Database.Database, id: string): void {
  db.prepare("DELETE FROM notes WHERE id = ?").run(id);
}

export function getLastSyncTime(db: Database.Database): string | null {
  const row = db.prepare("SELECT value FROM sync_meta WHERE key = 'last_sync'").get() as { value: string } | undefined;
  return row ? row.value : null;
}

export function setLastSyncTime(db: Database.Database, isoString: string): void {
  db.prepare("INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('last_sync', ?)").run(isoString);
}
