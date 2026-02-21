import fs from "fs";
import path from "path";
import readline from "readline";
import { ServerConfig } from "./types.js";
import { DEFAULT_EXPORT_DIR, DEFAULT_IMPORT_DIR } from "./constants.js";
import { saveConfig } from "./services/config.js";
import { findLatestExportZip, unzipExport } from "./services/sync.js";

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

export async function runWizard(syncRoot: string): Promise<ServerConfig> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  process.stderr.write("\n=== Notesnook MCP Server — First Run Setup ===\n\n");

  // Validate or re-prompt for sync root
  let root = syncRoot;
  while (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    root = await prompt(
      rl,
      `Path "${root}" does not exist or is not a directory.\nEnter the full path to your Notesnook sync folder: `
    );
    root = root.trim();
  }

  // Create subdirs
  const exportDir = path.join(root, DEFAULT_EXPORT_DIR);
  const importDir = path.join(root, DEFAULT_IMPORT_DIR);
  fs.mkdirSync(exportDir, { recursive: true });
  fs.mkdirSync(importDir, { recursive: true });
  process.stderr.write(`\nSync folder: ${root}\n`);
  process.stderr.write(`  export/ and import/ subdirectories ready.\n\n`);

  // Discover notebooks
  process.stderr.write("Scanning for notebooks in export folder...\n");
  const notebooks: string[] = [];

  const zipPath = findLatestExportZip(exportDir);
  if (zipPath) {
    process.stderr.write(`Found export: ${path.basename(zipPath)}\n`);
    try {
      const mdFiles = unzipExport(zipPath, exportDir);
      const notebookSet = new Set<string>();
      for (const f of mdFiles) {
        const rel = path.relative(path.join(exportDir, "extracted"), f);
        const parts = rel.split(path.sep);
        if (parts.length > 1 && parts[0]) {
          notebookSet.add(parts[0]);
        } else {
          notebookSet.add("Default");
        }
      }
      notebooks.push(...Array.from(notebookSet).sort());
    } catch (err) {
      process.stderr.write(`Warning: could not parse export zip: ${String(err)}\n`);
    }
  } else {
    process.stderr.write(
      "No export zip found.\n\n" +
      "To export from Notesnook:\n" +
      "  Settings → Backup & Export → Export all notes → Markdown\n" +
      "  Save the zip to: " + exportDir + "\n" +
      "Then re-run this setup.\n\n"
    );
  }

  let enabledNotebooks: string[] = [];

  if (notebooks.length > 0) {
    process.stderr.write("\nDiscovered notebooks:\n");
    notebooks.forEach((nb, i) => {
      process.stderr.write(`  ${i + 1}. ${nb}\n`);
    });

    const answer = await prompt(
      rl,
      '\nEnter notebook numbers to give OpenClaw access (comma-separated, or "all"): '
    );

    if (answer.trim().toLowerCase() === "all") {
      enabledNotebooks = [...notebooks];
    } else {
      const indices = answer
        .split(",")
        .map((s) => parseInt(s.trim(), 10) - 1)
        .filter((i) => i >= 0 && i < notebooks.length);
      enabledNotebooks = indices
        .map((i) => notebooks[i])
        .filter((n): n is string => n !== undefined);
    }

    process.stderr.write(
      `\nEnabled notebooks: ${enabledNotebooks.join(", ") || "(none)"}\n`
    );
  }

  const port = process.env["PORT"] ?? "3457";
  const installDir = path.resolve(
    new URL(import.meta.url).pathname,
    "../../.."
  );

  process.stderr.write(`
=== Add to your openclaw.json ===

{
  "agents": {
    "list": [{
      "id": "main",
      "mcp": {
        "servers": [{
          "name": "notesnook",
          "type": "sse",
          "url": "http://localhost:${port}/sse"
        }]
      }
    }]
  }
}

(The MCP server must be running — start it with: node ${installDir}/dist/index.js)
=================================
`);

  rl.close();

  const config: ServerConfig = {
    syncRoot: root,
    enabledNotebooks,
    firstRunComplete: true,
    lastSyncAt: null,
  };
  saveConfig(config);
  return config;
}
