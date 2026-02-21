import crypto from "crypto";
import path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import Database from "better-sqlite3";
import { ServerConfig } from "../types.js";
import {
  CHARACTER_LIMIT,
  DEFAULT_IMPORT_DIR,
  TODO_NOTEBOOK,
} from "../constants.js";
import {
  SearchNotesSchema,
  GetNoteSchema,
  CreateNoteSchema,
  UpdateNoteSchema,
} from "../schemas/tool-schemas.js";
import {
  searchNotes,
  getNoteById,
  upsertNote,
  getAllNotebooks,
} from "../services/db.js";
import { writeNoteToImport } from "../services/sync.js";

function truncate(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return (
    text.slice(0, CHARACTER_LIMIT) +
    "\n\n[Truncated — use get_note with specific ID for full content]"
  );
}

function errorResult(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: `Error: ${message}` }],
  };
}

export function registerNoteTools(
  server: McpServer,
  db: Database.Database,
  config: ServerConfig
): void {
  server.tool(
    "notesnook_search_notes",
    "Search notes by keyword, notebook, or tag",
    SearchNotesSchema.shape,
    async (params) => {
      try {
        const notebooks =
          params.notebook
            ? [params.notebook]
            : config.enabledNotebooks;

        if (notebooks.length === 0) {
          return errorResult("No notebooks enabled. Configure access with notesnook_configure_notebook_access.");
        }

        let results = searchNotes(db, params.query, notebooks, params.limit, params.offset);

        // Filter by tags if provided
        if (params.tags && params.tags.length > 0) {
          results = results.filter((r) =>
            params.tags!.every((tag) => r.tags.includes(tag))
          );
        }

        if (params.response_format === "json") {
          return {
            content: [{ type: "text", text: truncate(JSON.stringify(results, null, 2)) }],
          };
        }

        const md =
          results.length === 0
            ? "No notes found."
            : results
                .map(
                  (r) =>
                    `**${r.title}** (${r.notebook})\nID: ${r.id}\nUpdated: ${r.updatedAt}\n${r.excerpt}`
                )
                .join("\n\n---\n\n");

        return { content: [{ type: "text", text: truncate(md) }] };
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );

  server.tool(
    "notesnook_get_note",
    "Retrieve full content of a specific note by ID",
    GetNoteSchema.shape,
    async (params) => {
      try {
        const note = getNoteById(db, params.id);
        if (!note) return errorResult(`Note not found: ${params.id}`);

        if (!config.enabledNotebooks.includes(note.notebook)) {
          return errorResult(`Notebook "${note.notebook}" is not enabled for OpenClaw access.`);
        }

        if (params.response_format === "json") {
          return {
            content: [{ type: "text", text: truncate(JSON.stringify(note, null, 2)) }],
          };
        }

        const md = `# ${note.title}\n\n**Notebook:** ${note.notebook}\n**Tags:** ${note.tags.join(", ") || "(none)"}\n**Updated:** ${note.updatedAt}\n\n---\n\n${note.content}`;
        return { content: [{ type: "text", text: truncate(md) }] };
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );

  server.tool(
    "notesnook_create_note",
    "Create a new note in Notesnook",
    CreateNoteSchema.shape,
    async (params) => {
      try {
        // Infer notebook
        let notebook = params.notebook;
        if (!notebook) {
          const existingNotebooks = getAllNotebooks(db);
          notebook =
            existingNotebooks.find((nb) =>
              params.content.toLowerCase().includes(nb.toLowerCase())
            ) ?? TODO_NOTEBOOK;
        }

        const now = new Date().toISOString();
        const id = crypto.randomUUID();
        const importDir = path.join(config.syncRoot, DEFAULT_IMPORT_DIR);

        const note = {
          id,
          title: params.title,
          notebook,
          tags: params.tags ?? [],
          content: params.content,
          rawFrontMatter: "",
          filePath: path.join(importDir, notebook, `${id}.md`),
          createdAt: now,
          updatedAt: now,
        };

        upsertNote(db, note);
        await writeNoteToImport(note, importDir);

        return {
          content: [
            {
              type: "text",
              text: `Created note "${params.title}" (ID: ${id}) in notebook "${notebook}"`,
            },
          ],
        };
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );

  server.tool(
    "notesnook_update_note",
    "Update an existing note's content, title, or tags",
    UpdateNoteSchema.shape,
    async (params) => {
      try {
        if (
          params.content === undefined &&
          params.append === undefined &&
          params.title === undefined &&
          params.tags === undefined
        ) {
          return errorResult("At least one of content, append, title, or tags must be provided.");
        }

        const note = getNoteById(db, params.id);
        if (!note) return errorResult(`Note not found: ${params.id}`);

        if (!config.enabledNotebooks.includes(note.notebook)) {
          return errorResult(`Notebook "${note.notebook}" is not enabled for OpenClaw access.`);
        }

        const updated = {
          ...note,
          title: params.title ?? note.title,
          tags: params.tags ?? note.tags,
          content:
            params.content !== undefined
              ? params.content
              : params.append !== undefined
              ? note.content + "\n" + params.append
              : note.content,
          updatedAt: new Date().toISOString(),
        };

        upsertNote(db, updated);
        const importDir = path.join(config.syncRoot, DEFAULT_IMPORT_DIR);
        await writeNoteToImport(updated, importDir);

        return {
          content: [
            {
              type: "text",
              text: `Updated note "${updated.title}" (ID: ${updated.id})`,
            },
          ],
        };
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );
}
