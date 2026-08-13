import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG, defaultConfigPath, loadConfig, parseConfig, resolveConfigPath } from "../src/config";

describe("config", () => {
  test("fills optional fields with defaults", () => {
    expect(parseConfig({ controller: "http://localhost:9090/" })).toEqual({
      ...DEFAULT_CONFIG,
      controller: "http://localhost:9090",
    });
  });

  test("rejects unsafe URL schemes and invalid timeouts", () => {
    expect(() => parseConfig({ controller: "file:///tmp/socket" })).toThrow("只支持 http 或 https");
    expect(() => parseConfig({ timeout: 100 })).toThrow("timeout");
  });

  test("prefers CLI config path over the environment", () => {
    expect(resolveConfigPath(["bun", "index.tsx", "-c", "./chosen.json"], { MIHOMO_TUI_CONFIG: "./ignored.json" })).toEndWith("chosen.json");
  });

  test("uses XDG config home for an installed CLI", () => {
    expect(defaultConfigPath({ XDG_CONFIG_HOME: "/tmp/xdg" }, "linux", "/home/example"))
      .toBe("/tmp/xdg/simple-mihomo-tui/config.json");
  });

  test("creates a private config on first run", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mihomo-tui-config-"));
    const path = join(directory, "nested", "config.json");
    try {
      const loaded = await loadConfig(path);
      expect(loaded.usedDefaults).toBe(true);
      expect(JSON.parse(await readFile(path, "utf8"))).toEqual(DEFAULT_CONFIG);
      if (process.platform !== "win32") {
        expect((await stat(path)).mode & 0o777).toBe(0o600);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
