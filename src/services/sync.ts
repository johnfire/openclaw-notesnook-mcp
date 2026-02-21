import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import Database from "better-sqlite3";
import { ServerConfig, SyncResult } from "../types.js";
import {
  DEFAULT_EXPORT_DIR,
  DEFAULT_IMPORT_DIR,
  EXPORT_ZIP_GLOB,
  IMPORT_DELAY_MS,
  NOTE_EXTENSION,
} from "../constants.js";
import { noteFromFile, noteToMarkdown, sanitizeFilename } from "./parser.js";
import { upsertNote, getNoteById, setLastSyncTime } from "./db.js";
import { Note } from "../types.js";

const EXTRACTED_DIR = "extracted";

export function findLatestExportZip(exportDir: string): string | null {
  if (!fs.existsSync(exportDir)) return null;
  const pattern = EXPORT_ZIP_GLOB.replace("*", "");
  const files = fs
    .readdirSync(exportDir)
    .filter((f) => f.endsWith(pattern || ".zip"))
    .map((f) => ({
      name: f,
      mtime: fs.statSync(path.join(exportDir, f)).mtime.getTime(),
    }))
    .sort((a, b) => b.mtime - a.mtime);
  return files.length > 0 ? path.join(exportDir, files[0]!.name) : null;
}

export function unzipExport(zipPath: string, targetDir: string): string[] {
  const extractedDir = path.join(targetDir, EXTRACTED_DIR);
  if (fs.existsSync(extractedDir)) {
    fs.rmSync(extractedDir, { recursive: true });
  }
  fs.mkdirSync(extractedDir, { recursive: true });

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(extractedDir, true);

  const mdFiles: string[] = [];
  walkDir(extractedDir, (f) => {
    if (f.endsWith(NOTE_EXTENSION)) mdFiles.push(f);
  });
  return mdFiles;
}

function walkDir(dir: string, cb: (filePath: string) => void): void {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      walkDir(full, cb);
    } else {
      cb(full);
    }
  }
}

export async function syncFromExport(
  db: Database.Database,
  config: ServerConfig
): Promise<SyncResult> {
  const exportDir = path.join(config.syncRoot, DEFAULT_EXPORT_DIR);
  const result: SyncResult = {
    direction: "export",
    notesRead: 0,
    notesWritten: 0,
    conflicts: 0,
    errors: [],
    syncedAt: new Date().toISOString(),
  };

  const zipPath = findLatestExportZip(exportDir);
  if (!zipPath) {
    result.errors.push("No export zip found in " + exportDir);
    return result;
  }

  let mdFiles: string[];
  try {
    mdFiles = unzipExport(zipPath, exportDir);
  } catch (err) {
    result.errors.push(`Failed to unzip ${zipPath}: ${String(err)}`);
    return result;
  }

  const extractedDir = path.join(exportDir, EXTRACTED_DIR);

  for (const filePath of mdFiles) {
    result.notesRead++;
    try {
      const note = noteFromFile(filePath, extractedDir);
      const existing = getNoteById(db, note.id);

      if (existing) {
        const fileMtime = fs.statSync(filePath).mtime.getTime();
        const dbMtime = new Date(existing.updatedAt).getTime();
        if (fileMtime > dbMtime) {
          upsertNote(db, note);
          result.notesWritten++;
          result.conflicts++;
        }
      } else {
        upsertNote(db, note);
        result.notesWritten++;
      }
    } catch (err) {
      result.errors.push(`Error processing ${filePath}: ${String(err)}`);
    }
  }

  return result;
}

export async function writeNoteToImport(
  note: Note,
  importDir: string
): Promise<void> {
  const filename = sanitizeFilename(note.title);
  const dir =
    note.notebook && note.notebook !== "Default"
      ? path.join(importDir, note.notebook)
      : importDir;
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, noteToMarkdown(note), "utf-8");
  await new Promise<void>((resolve) => setTimeout(resolve, IMPORT_DELAY_MS));
}

export async function runFullSync(
  db: Database.Database,
  config: ServerConfig
): Promise<SyncResult> {
  console.error("[sync] Starting full sync...");
  const result = await syncFromExport(db, config);

  // Write any pending import notes (agent-created notes in import dir)
  const importDir = path.join(config.syncRoot, DEFAULT_IMPORT_DIR);
  if (!fs.existsSync(importDir)) {
    fs.mkdirSync(importDir, { recursive: true });
  }

  const now = new Date().toISOString();
  setLastSyncTime(db, now);

  console.error(
    `[sync] Done. Read: ${result.notesRead}, Written: ${result.notesWritten}, Conflicts: ${result.conflicts}, Errors: ${result.errors.length}`
  );
  if (result.errors.length > 0) {
    for (const e of result.errors) console.error(`[sync] Error: ${e}`);
  }

  return result;
}
