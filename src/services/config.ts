import fs from "fs";
import path from "path";
import { ServerConfig } from "../types.js";
import { CONFIG_FILE } from "../constants.js";

export function getSyncRoot(): string {
  const syncRoot = process.env["NOTESNOOK_SYNC_ROOT"];
  if (!syncRoot) {
    throw new Error(
      "Set NOTESNOOK_SYNC_ROOT env var to your sync folder path"
    );
  }
  return syncRoot;
}

export function loadConfig(syncRoot: string): ServerConfig {
  const configPath = path.join(syncRoot, CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    return {
      syncRoot,
      enabledNotebooks: [],
      firstRunComplete: false,
      lastSyncAt: null,
    };
  }
  const raw = fs.readFileSync(configPath, "utf-8");
  const parsed = JSON.parse(raw) as Partial<ServerConfig>;
  return {
    syncRoot,
    enabledNotebooks: parsed.enabledNotebooks ?? [],
    firstRunComplete: parsed.firstRunComplete ?? false,
    lastSyncAt: parsed.lastSyncAt ?? null,
  };
}

export function saveConfig(config: ServerConfig): void {
  const configPath = path.join(config.syncRoot, CONFIG_FILE);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}
