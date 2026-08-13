import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../src/config";
import { latestDelay, MihomoApi } from "../src/mihomo";

describe("MihomoApi", () => {
  test("loads and normalizes a snapshot", async () => {
    const fetcher = async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      if (path === "/version") return json({ version: "1.19.0" });
      if (path === "/providers/proxies") return json({ providers: { airport: { proxies: [{ name: "HK", type: "ss" }] } } });
      if (path === "/proxies") return json({ proxies: {
        GLOBAL: { name: "GLOBAL", type: "Selector", now: "HK", all: ["HK"] },
        HK: { name: "HK", type: "Shadowsocks" },
      } });
      return new Response(null, { status: 404 });
    };
    const api = new MihomoApi(DEFAULT_CONFIG, fetcher);

    expect(await api.snapshot()).toEqual({
      version: "1.19.0",
      providers: [{ name: "airport", proxies: [{ name: "HK", type: "ss" }] }],
      groups: [{ name: "GLOBAL", type: "Selector", now: "HK", all: ["HK"] }],
    });
  });

  test("uses bearer auth and encodes names when selecting", async () => {
    let request: { url: string; init?: RequestInit } | undefined;
    const api = new MihomoApi({ ...DEFAULT_CONFIG, secret: "token" }, async (input, init) => {
      request = { url: String(input), init };
      return new Response(null, { status: 204 });
    });

    await api.selectNode("节点 选择", "香港/01");
    expect(request?.url).toEndWith("/proxies/%E8%8A%82%E7%82%B9%20%E9%80%89%E6%8B%A9");
    expect(new Headers(request?.init?.headers).get("Authorization")).toBe("Bearer token");
    expect(request?.init?.body).toBe('{"name":"香港/01"}');
  });

  test("surfaces API errors", async () => {
    const api = new MihomoApi(DEFAULT_CONFIG, async () => json({ message: "Unauthorized" }, 401));
    expect(api.version()).rejects.toThrow("Mihomo 返回 401：Unauthorized");
  });
});

test("latestDelay ignores failed samples", () => {
  expect(latestDelay({ name: "node", type: "ss", history: [{ delay: 20 }, { delay: 0 }, { delay: 35 }] })).toBe(35);
});

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}
