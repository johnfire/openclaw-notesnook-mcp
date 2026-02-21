import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import Database from "better-sqlite3";
import { ServerConfig } from "../types.js";
import {
  ListNotebooksSchema,
  ConfigureNotebookAccessSchema,
} from "../schemas/tool-schemas.js";
import { getAllNotebooks } from "../services/db.js";
import { saveConfig } from "../services/config.js";

function errorResult(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: `Error: ${message}` }],
  };
}

export function registerNotebookTools(
  server: McpServer,
  db: Database.Database,
  config: ServerConfig
): void {
  server.tool(
    "notesnook_list_notebooks",
    "List all notebooks and their OpenClaw access status",
    ListNotebooksSchema.shape,
    async (params) => {
      try {
        const allNotebooks = getAllNotebooks(db);
        const notebooks = allNotebooks
          .map((name) => ({
            name,
            enabled: config.enabledNotebooks.includes(name),
          }))
          .filter((nb) => params.include_disabled || nb.enabled);

        if (params.response_format === "json") {
          return {
            content: [{ type: "text", text: JSON.stringify(notebooks, null, 2) }],
          };
        }

        const md =
          notebooks.length === 0
            ? "No notebooks found."
            : notebooks
                .map((nb) => `- **${nb.name}** ${nb.enabled ? "(enabled)" : "(disabled)"}`)
                .join("\n");

        return { content: [{ type: "text", text: md }] };
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );

  server.tool(
    "notesnook_configure_notebook_access",
    "Grant or revoke OpenClaw access to a specific notebook",
    ConfigureNotebookAccessSchema.shape,
    async (params) => {
      try {
        const allNotebooks = getAllNotebooks(db);
        if (!allNotebooks.includes(params.notebook)) {
          return errorResult(
            `Notebook "${params.notebook}" not found. Known notebooks: ${allNotebooks.join(", ")}`
          );
        }

        if (params.enabled) {
          if (!config.enabledNotebooks.includes(params.notebook)) {
            config.enabledNotebooks.push(params.notebook);
          }
        } else {
          config.enabledNotebooks = config.enabledNotebooks.filter(
            (nb) => nb !== params.notebook
          );
        }

        saveConfig(config);

        return {
          content: [
            {
              type: "text",
              text: `Notebook "${params.notebook}" ${params.enabled ? "enabled" : "disabled"} for OpenClaw access.`,
            },
          ],
        };
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );
}
