#!/usr/bin/env node

const { createHash } = require("node:crypto");
const { createReadStream, existsSync } = require("node:fs");
const { chmod, mkdir, rename, rm } = require("node:fs/promises");
const { homedir } = require("node:os");
const { dirname, join } = require("node:path");
const { pipeline } = require("node:stream/promises");
const { Readable } = require("node:stream");
const { spawnSync } = require("node:child_process");
const { version } = require("../package.json");

const REPOSITORY = "Aye10032/simple-mihomo-tui";

async function main() {
  const asset = assetName(process.platform, process.arch);
  const binary = process.env.MIHOMO_TUI_BINARY || join(cacheRoot(), version, asset);

  if (!existsSync(binary)) {
    await installBinary(binary, asset, version);
  }

  const result = spawnSync(binary, process.argv.slice(2), { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.signal) {
    process.kill(process.pid, result.signal);
    return;
  }
  process.exitCode = result.status ?? 1;
}

function assetName(platform, arch) {
  const platforms = { linux: "linux", darwin: "darwin", win32: "windows" };
  const architectures = { x64: "x64", arm64: "arm64" };
  const platformName = platforms[platform];
  const architectureName = architectures[arch];
  if (!platformName || !architectureName) {
    throw new Error(`Unsupported platform: ${platform}-${arch}`);
  }
  return `mihomo-tui-${platformName}-${architectureName}${platform === "win32" ? ".exe" : ""}`;
}

function cacheRoot(env = process.env, platform = process.platform, home = homedir()) {
  if (env.XDG_CACHE_HOME) return join(env.XDG_CACHE_HOME, "simple-mihomo-tui");
  if (platform === "win32" && env.LOCALAPPDATA) return join(env.LOCALAPPDATA, "simple-mihomo-tui");
  if (platform === "darwin") return join(home, "Library", "Caches", "simple-mihomo-tui");
  return join(home, ".cache", "simple-mihomo-tui");
}

function releaseUrl(releaseVersion, asset) {
  const base = process.env.MIHOMO_TUI_RELEASE_BASE_URL || `https://github.com/${REPOSITORY}/releases/download`;
  return `${base.replace(/\/$/, "")}/v${releaseVersion}/${asset}`;
}

async function installBinary(binary, asset, releaseVersion) {
  const checksumUrl = releaseUrl(releaseVersion, "checksums.txt");
  const expected = parseChecksum(await fetchText(checksumUrl), asset);
  const temporary = `${binary}.download-${process.pid}`;

  console.error(`Downloading ${asset} v${releaseVersion}…`);
  await mkdir(dirname(binary), { recursive: true });
  try {
    await download(releaseUrl(releaseVersion, asset), temporary);
    const actual = await sha256(temporary);
    if (actual !== expected) {
      throw new Error(`Checksum mismatch for ${asset}`);
    }
    if (process.platform !== "win32") await chmod(temporary, 0o755);
    await rename(temporary, binary);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function fetchText(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  return response.text();
}

async function download(url, destination) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}): ${url}`);
  const { createWriteStream } = require("node:fs");
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination, { mode: 0o600 }));
}

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function parseChecksum(contents, asset) {
  for (const line of contents.split(/\r?\n/)) {
    const match = line.trim().match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
    if (match && match[2] === asset) return match[1].toLowerCase();
  }
  throw new Error(`No checksum found for ${asset}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`mihomo-tui: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

module.exports = { assetName, cacheRoot, parseChecksum, releaseUrl };
