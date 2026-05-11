import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { OpenChannelsConfig } from "./types";

const CONFIG_FILENAME = "opencode-link.json";

export function getConfigPath(directory: string): string {
  return join(directory, ".opencode", CONFIG_FILENAME);
}

export function readConfig(directory: string): OpenChannelsConfig | null {
  const path = getConfigPath(directory);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function writeConfig(directory: string, config: OpenChannelsConfig): void {
  const path = getConfigPath(directory);
  const dir = join(directory, ".opencode");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2));
}
