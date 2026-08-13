import { describe, expect, test } from "bun:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { assetName, cacheRoot, parseChecksum, releaseUrl } = require("../bin/mihomo-tui.cjs") as {
  assetName(platform: string, arch: string): string;
  cacheRoot(env: Record<string, string>, platform: string, home: string): string;
  parseChecksum(contents: string, asset: string): string;
  releaseUrl(version: string, asset: string): string;
};

describe("release launcher", () => {
  test("maps supported platforms to release assets", () => {
    expect(assetName("linux", "x64")).toBe("mihomo-tui-linux-x64");
    expect(assetName("darwin", "arm64")).toBe("mihomo-tui-darwin-arm64");
    expect(assetName("win32", "x64")).toBe("mihomo-tui-windows-x64.exe");
    expect(() => assetName("freebsd", "x64")).toThrow("Unsupported platform");
  });

  test("uses the platform cache directory", () => {
    expect(cacheRoot({ XDG_CACHE_HOME: "/cache" }, "linux", "/home/me"))
      .toBe("/cache/simple-mihomo-tui");
    expect(cacheRoot({}, "darwin", "/Users/me"))
      .toBe("/Users/me/Library/Caches/simple-mihomo-tui");
  });

  test("parses checksums and builds versioned URLs", () => {
    const checksum = "a".repeat(64);
    expect(parseChecksum(`${checksum}  mihomo-tui-linux-x64\n`, "mihomo-tui-linux-x64")).toBe(checksum);
    expect(releaseUrl("0.1.0", "mihomo-tui-linux-x64"))
      .toBe("https://github.com/Aye10032/simple-mihomo-tui/releases/download/v0.1.0/mihomo-tui-linux-x64");
  });
});
