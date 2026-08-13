import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const APP_NAME = "simple-mihomo-tui";

export interface AppConfig {
  controller: string;
  secret: string;
  username: string;
  password: string;
  testUrl: string;
  timeout: number;
}

export const DEFAULT_CONFIG: AppConfig = {
  controller: "http://127.0.0.1:9090",
  secret: "",
  username: "",
  password: "",
  testUrl: "https://www.gstatic.com/generate_204",
  timeout: 5000,
};

export function resolveConfigPath(
  argv = process.argv,
  env = process.env,
  platform = process.platform,
  home = homedir(),
): string {
  const flagIndex = argv.findIndex((argument) => argument === "--config" || argument === "-c");
  const flagValue = flagIndex >= 0 ? argv[flagIndex + 1] : undefined;
  const configuredPath = flagValue || env.MIHOMO_TUI_CONFIG;

  return configuredPath
    ? resolve(configuredPath)
    : defaultConfigPath(env, platform, home);
}

export function defaultConfigPath(
  env = process.env,
  platform = process.platform,
  home = homedir(),
): string {
  if (env.XDG_CONFIG_HOME?.trim()) {
    return resolve(env.XDG_CONFIG_HOME, APP_NAME, "config.json");
  }
  if (platform === "win32" && env.APPDATA?.trim()) {
    return resolve(env.APPDATA, APP_NAME, "config.json");
  }
  if (platform === "darwin") {
    return join(home, "Library", "Application Support", APP_NAME, "config.json");
  }
  return join(home, ".config", APP_NAME, "config.json");
}

export function parseConfig(input: unknown): AppConfig {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("配置文件必须是 JSON 对象");
  }

  const value = input as Record<string, unknown>;
  const config: AppConfig = {
    controller: stringValue(value.controller, DEFAULT_CONFIG.controller),
    secret: stringValue(value.secret, DEFAULT_CONFIG.secret),
    username: stringValue(value.username, DEFAULT_CONFIG.username),
    password: stringValue(value.password, DEFAULT_CONFIG.password),
    testUrl: stringValue(value.testUrl, DEFAULT_CONFIG.testUrl),
    timeout: numberValue(value.timeout, DEFAULT_CONFIG.timeout),
  };

  for (const [label, candidate] of [
    ["controller", config.controller],
    ["testUrl", config.testUrl],
  ] as const) {
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      throw new Error(`${label} 不是有效 URL`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`${label} 只支持 http 或 https`);
    }
  }

  if (!Number.isFinite(config.timeout) || config.timeout < 500 || config.timeout > 120_000) {
    throw new Error("timeout 必须在 500 到 120000 毫秒之间");
  }

  config.controller = config.controller.replace(/\/+$/, "");
  return config;
}

export async function loadConfig(path = resolveConfigPath()): Promise<{ config: AppConfig; path: string; usedDefaults: boolean }> {
  try {
    const contents = await readFile(path, "utf8");
    return { config: parseConfig(JSON.parse(contents)), path, usedDefaults: false };
  } catch (error) {
    if (isMissingFile(error)) {
      const created = await createConfig(path);
      if (created) return { config: { ...DEFAULT_CONFIG }, path, usedDefaults: true };

      const contents = await readFile(path, "utf8");
      return { config: parseConfig(JSON.parse(contents)), path, usedDefaults: false };
    }
    if (error instanceof SyntaxError) {
      throw new Error(`配置文件不是有效 JSON：${path}`);
    }
    throw error;
  }
}

export async function createConfig(path: string): Promise<boolean> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  try {
    await writeFile(path, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    return true;
  } catch (error) {
    // Another process may have initialized it between readFile and writeFile.
    if (!isAlreadyExists(error)) throw error;
    return false;
  }
}

function stringValue(value: unknown, fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== "string") throw new Error("配置中的文本字段必须是字符串");
  return value.trim();
}

function numberValue(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number") throw new Error("配置中的 timeout 必须是数字");
  return value;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isAlreadyExists(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}
