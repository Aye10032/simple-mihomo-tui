#!/usr/bin/env bun

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./app";
import { loadConfig } from "./config";
import { MihomoApi } from "./mihomo";

try {
  const { config, path, usedDefaults } = await loadConfig();
  const renderer = await createCliRenderer({ exitOnCtrlC: true });
  createRoot(renderer).render(
    <App api={new MihomoApi(config)} config={config} configPath={path} usedDefaults={usedDefaults} />,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
