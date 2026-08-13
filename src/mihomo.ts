import type { AppConfig } from "./config";

export interface DelayHistory {
  time?: string;
  delay?: number;
  meanDelay?: number;
}

export interface ProxyNode {
  name: string;
  type: string;
  alive?: boolean;
  udp?: boolean;
  history?: DelayHistory[];
}

export interface ProxyProvider {
  name: string;
  type?: string;
  vehicleType?: string;
  updatedAt?: string;
  proxies?: ProxyNode[];
  subscriptionInfo?: {
    upload?: number;
    download?: number;
    total?: number;
    expire?: number;
  };
}

export interface ProxyGroup extends ProxyNode {
  now?: string;
  all?: string[];
}

export interface MihomoSnapshot {
  version: string;
  providers: ProxyProvider[];
  groups: ProxyGroup[];
}

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class MihomoApi {
  constructor(
    private readonly config: AppConfig,
    private readonly fetcher: Fetcher = fetch,
  ) {}

  async snapshot(): Promise<MihomoSnapshot> {
    const [version, providers, groups] = await Promise.all([
      this.version(),
      this.providers(),
      this.proxyGroups(),
    ]);
    return { version, providers, groups };
  }

  async version(): Promise<string> {
    const response = await this.request<{ version?: string }>("GET", "/version");
    return response.version || "unknown";
  }

  async providers(): Promise<ProxyProvider[]> {
    const response = await this.request<{ providers?: Record<string, ProxyProvider> }>("GET", "/providers/proxies");
    return Object.entries(response.providers || {})
      .map(([name, provider]) => ({ ...provider, name: provider.name || name }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async proxyGroups(): Promise<ProxyGroup[]> {
    const response = await this.request<{ proxies?: Record<string, ProxyGroup> }>("GET", "/proxies");
    return Object.entries(response.proxies || {})
      .map(([name, proxy]) => ({ ...proxy, name: proxy.name || name }))
      .filter((proxy) => proxy.type.toLowerCase() === "selector" && Array.isArray(proxy.all));
  }

  async updateProvider(provider: string): Promise<void> {
    await this.request("PUT", `/providers/proxies/${encodeURIComponent(provider)}`);
  }

  async healthCheckProvider(provider: string): Promise<void> {
    await this.request("GET", `/providers/proxies/${encodeURIComponent(provider)}/healthcheck`);
  }

  async testNode(provider: string, node: string): Promise<number | undefined> {
    const params = new URLSearchParams({
      url: this.config.testUrl,
      timeout: String(this.config.timeout),
    });
    const result = await this.request<{ delay?: number }>(
      "GET",
      `/providers/proxies/${encodeURIComponent(provider)}/${encodeURIComponent(node)}/healthcheck?${params}`,
    );
    return result.delay;
  }

  async selectNode(group: string, node: string): Promise<void> {
    await this.request("PUT", `/proxies/${encodeURIComponent(group)}`, { name: node });
  }

  private async request<T = void>(method: string, path: string, body?: unknown): Promise<T> {
    const headers = new Headers({ Accept: "application/json" });
    if (this.config.secret) {
      headers.set("Authorization", `Bearer ${this.config.secret}`);
    } else if (this.config.username || this.config.password) {
      headers.set("Authorization", `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`, "utf8").toString("base64")}`);
    }
    if (body !== undefined) headers.set("Content-Type", "application/json");

    let response: Response;
    try {
      response = await this.fetcher(`${this.config.controller}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeout),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new Error(`请求超时（${this.config.timeout}ms）`);
      }
      throw new Error(`无法连接 Mihomo：${errorMessage(error)}`);
    }

    const text = await response.text();
    if (!response.ok) {
      let detail = text.trim();
      try {
        const parsed = JSON.parse(text) as { message?: string };
        detail = parsed.message || detail;
      } catch {
        // Keep the plain-text response.
      }
      throw new Error(`Mihomo 返回 ${response.status}${detail ? `：${detail}` : ""}`);
    }
    if (!text) return undefined as T;

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error("Mihomo 返回了无法解析的数据");
    }
  }
}

export function latestDelay(node: ProxyNode | undefined): number | undefined {
  const values = (node?.history || [])
    .map((item) => item.delay)
    .filter((delay): delay is number => typeof delay === "number" && delay > 0);
  return values.at(-1);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
