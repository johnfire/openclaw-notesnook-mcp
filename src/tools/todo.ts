import crypto from "crypto";
import path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import Database from "better-sqlite3";
import { ServerConfig, TodoItem, TodoNote } from "../types.js";
import {
  TODO_NOTE_TITLE,
  TODO_NOTEBOOK,
  DEFAULT_IMPORT_DIR,
} from "../constants.js";
import { GetTodoSchema, UpdateTodoSchema } from "../schemas/tool-schemas.js";
import { getNoteByTitle, upsertNote } from "../services/db.js";
import { writeNoteToImport } from "../services/sync.js";

function errorResult(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: `Error: ${message}` }],
  };
}

function parseItems(content: string): TodoItem[] {
  const items: TodoItem[] = [];
  const now = new Date().toISOString();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- [x] ") || trimmed.startsWith("- [X] ")) {
      items.push({ text: trimmed.slice(6), done: true, addedAt: now });
    } else if (trimmed.startsWith("- [ ] ")) {
      items.push({ text: trimmed.slice(6), done: false, addedAt: now });
    } else if (trimmed.startsWith("- ") && trimmed.length > 2) {
      items.push({ text: trimmed.slice(2), done: false, addedAt: now });
    }
  }
  return items;
}

function serializeItems(items: TodoItem[]): string {
  return items
    .map((item) => (item.done ? `- [x] ${item.text}` : `- [ ] ${item.text}`))
    .join("\n");
}

export function registerTodoTools(
  server: McpServer,
  db: Database.Database,
  config: ServerConfig
): void {
  server.tool(
    "notesnook_get_todo",
    "Get the daily to-do list",
    GetTodoSchema.shape,
    async (params) => {
      try {
        const note = getNoteByTitle(db, TODO_NOTE_TITLE);
        if (!note) {
          const msg = `No to-do note found. Create one titled "${TODO_NOTE_TITLE}" or use notesnook_update_todo to add items.`;
          return { content: [{ type: "text", text: msg }] };
        }

        const items = parseItems(note.content);
        const todoNote: TodoNote = { items, updatedAt: note.updatedAt };

        if (params.response_format === "json") {
          return {
            content: [{ type: "text", text: JSON.stringify(todoNote, null, 2) }],
          };
        }

        const pending = items.filter((i) => !i.done);
        const done = items.filter((i) => i.done);
        const lines = [
          `# ${TODO_NOTE_TITLE}`,
          `\n**Pending (${pending.length}):**`,
          ...pending.map((i) => `- [ ] ${i.text}`),
          `\n**Done (${done.length}):**`,
          ...done.map((i) => `- [x] ${i.text}`),
        ];

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );

  server.tool(
    "notesnook_update_todo",
    "Add, complete, or remove items from the daily to-do list",
    UpdateTodoSchema.shape,
    async (params) => {
      try {
        if (
          !params.add &&
          !params.complete &&
          !params.remove &&
          !params.replace_all
        ) {
          return errorResult(
            "At least one of add, complete, remove, or replace_all must be provided."
          );
        }

        const importDir = path.join(config.syncRoot, DEFAULT_IMPORT_DIR);
        const now = new Date().toISOString();

        // Load or create the todo note
        let existingNote = getNoteByTitle(db, TODO_NOTE_TITLE);
        let items: TodoItem[] = existingNote
          ? parseItems(existingNote.content)
          : [];

        if (params.replace_all) {
          items = params.replace_all.map((text) => ({
            text,
            done: false,
            addedAt: now,
          }));
        } else {
          if (params.add) {
            for (const text of params.add) {
              items.push({ text, done: false, addedAt: now });
            }
          }
          if (params.complete) {
            for (const snippet of params.complete) {
              for (const item of items) {
                if (item.text.toLowerCase().includes(snippet.toLowerCase())) {
                  item.done = true;
                }
              }
            }
          }
          if (params.remove) {
            for (const snippet of params.remove) {
              items = items.filter(
                (i) => !i.text.toLowerCase().includes(snippet.toLowerCase())
              );
            }
          }
        }

        const content = serializeItems(items);
        const noteId = existingNote?.id ?? crypto.randomUUID();

        const updatedNote = {
          id: noteId,
          title: TODO_NOTE_TITLE,
          notebook: TODO_NOTEBOOK,
          tags: [],
          content,
          rawFrontMatter: existingNote?.rawFrontMatter ?? "",
          filePath:
            existingNote?.filePath ??
            path.join(importDir, TODO_NOTEBOOK, `${noteId}.md`),
          createdAt: existingNote?.createdAt ?? now,
          updatedAt: now,
        };

        upsertNote(db, updatedNote);
        await writeNoteToImport(updatedNote, importDir);

        const todoNote: TodoNote = { items, updatedAt: now };
        return {
          content: [
            {
              type: "text",
              text: `To-do list updated. ${items.filter((i) => !i.done).length} pending, ${items.filter((i) => i.done).length} done.\n\n${JSON.stringify(todoNote, null, 2)}`,
            },
          ],
        };
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );
}
