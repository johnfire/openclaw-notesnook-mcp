import http from "http";
import path from "path";
import fs from "fs";
import chokidar from "chokidar";
import cron from "node-cron";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  SERVER_NAME,
  SERVER_VERSION,
  SYNC_CRON,
  DEFAULT_EXPORT_DIR,
  DEFAULT_DB_FILE,
  DEFAULT_IMPORT_DIR,
  EXPORT_ZIP_GLOB,
} from "./constants.js";
import { getSyncRoot, loadConfig, saveConfig } from "./services/config.js";
import { initDb } from "./services/db.js";
import { runFullSync } from "./services/sync.js";
import { runWizard } from "./wizard.js";
import { registerNoteTools } from "./tools/notes.js";
import { registerNotebookTools } from "./tools/notebooks.js";
import { registerTodoTools } from "./tools/todo.js";
import { TriggerSyncSchema } from "./schemas/tool-schemas.js";

async function main(): Promise<void> {
  // 1. Get sync root
  let syncRoot: string;
  try {
    syncRoot = getSyncRoot();
  } catch (err) {
    console.error(`[startup] ${String(err)}`);
    process.exit(1);
  }

  // 2. Load config
  let config = loadConfig(syncRoot);

  // 3. First-run wizard
  if (!config.firstRunComplete) {
    config = await runWizard(syncRoot);
    saveConfig(config);
  }

  // 4. Init database
  const dbPath = path.join(syncRoot, DEFAULT_DB_FILE);
  const db = initDb(dbPath);

  // 5. Create MCP server
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  // 6. Register tools
  registerNoteTools(server, db, config);
  registerNotebookTools(server, db, config);
  registerTodoTools(server, db, config);

  // notesnook_trigger_sync
  server.tool(
    "notesnook_trigger_sync",
    "Force an immediate sync with Notesnook without waiting for the hourly schedule",
    TriggerSyncSchema.shape,
    async () => {
      try {
        const result = await runFullSync(db, config);
        return {
          content: [
            {
              type: "text",
              text:
                `Sync complete.\n` +
                `Read: ${result.notesRead} | Written: ${result.notesWritten} | ` +
                `Conflicts: ${result.conflicts} | Errors: ${result.errors.length}\n` +
                (result.errors.length > 0
                  ? `\nErrors:\n${result.errors.join("\n")}`
                  : ""),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true as const,
          content: [{ type: "text" as const, text: `Sync failed: ${String(err)}` }],
        };
      }
    }
  );

  // 7. Cron sync (hourly)
  cron.schedule(SYNC_CRON, () => {
    runFullSync(db, config).catch((err) =>
      console.error("[cron] Sync error:", err)
    );
  });

  // 8. Initial sync on startup
  runFullSync(db, config).catch((err) =>
    console.error("[startup] Initial sync error:", err)
  );

  // 9. Watch export dir for new zips (chokidar secondary trigger)
  const exportDir = path.join(syncRoot, DEFAULT_EXPORT_DIR);
  fs.mkdirSync(exportDir, { recursive: true });
  fs.mkdirSync(path.join(syncRoot, DEFAULT_IMPORT_DIR), { recursive: true });

  const zipPattern = EXPORT_ZIP_GLOB;
  chokidar
    .watch(path.join(exportDir, zipPattern), { ignoreInitial: true })
    .on("add", (filePath) => {
      console.error(`[watch] New export detected: ${filePath}. Syncing...`);
      runFullSync(db, config).catch((err) =>
        console.error("[watch] Sync error:", err)
      );
    });

  // 10. HTTP/SSE server
  const port = parseInt(process.env["PORT"] ?? "3457", 10);
  let activeTransport: SSEServerTransport | null = null;

  const httpServer = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);

      if (req.method === "GET" && url.pathname === "/sse") {
        if (activeTransport) {
          try {
            await activeTransport.close();
          } catch {
            // ignore close errors
          }
        }
        activeTransport = new SSEServerTransport("/message", res);
        await server.connect(activeTransport);
        console.error(`[http] Client connected via SSE`);
      } else if (req.method === "POST" && url.pathname === "/message") {
        if (!activeTransport) {
          res.writeHead(503);
          res.end("No active SSE session");
          return;
        }
        await activeTransport.handlePostMessage(req, res);
      } else if (req.method === "GET" && url.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", version: SERVER_VERSION }));
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    } catch (err) {
      console.error("[http] Request error:", err);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("Internal server error");
      }
    }
  });

  httpServer.listen(port, "127.0.0.1", () => {
    console.error(
      `[startup] ${SERVER_NAME} v${SERVER_VERSION} listening on http://127.0.0.1:${port}/sse`
    );
  });
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
