import { TextAttributes } from "@opentui/core";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppConfig } from "./config";
import { errorMessage, latestDelay, type MihomoApi, type ProxyGroup, type ProxyNode, type ProxyProvider } from "./mihomo";

const COLOR = {
  bg: "#10151d",
  panel: "#151c26",
  border: "#334155",
  muted: "#7f8ea3",
  text: "#dce7f5",
  cyan: "#55d6be",
  blue: "#5aa9fa",
  yellow: "#f6c85f",
  red: "#ff6b6b",
  green: "#74d680",
  selected: "#24354a",
};

interface AppProps {
  api: MihomoApi;
  config: AppConfig;
  configPath: string;
  usedDefaults?: boolean;
}

export function App({ api, config, configPath, usedDefaults = false }: AppProps) {
  const renderer = useRenderer();
  const { width, height } = useTerminalDimensions();
  const [providers, setProviders] = useState<ProxyProvider[]>([]);
  const [groups, setGroups] = useState<ProxyGroup[]>([]);
  const [version, setVersion] = useState("—");
  const [providerIndex, setProviderIndex] = useState(0);
  const [nodeIndex, setNodeIndex] = useState(0);
  const [groupIndex, setGroupIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [status, setStatus] = useState(usedDefaults ? `已创建用户配置 · ${configPath}` : "正在连接 Mihomo…");
  const [statusKind, setStatusKind] = useState<"normal" | "error" | "success">("normal");

  const selectedProvider = providers[providerIndex];
  const nodes = selectedProvider?.proxies || [];
  const selectedNode = nodes[nodeIndex];
  const applicableGroups = useMemo(
    () => selectedNode ? groups.filter((group) => group.all?.includes(selectedNode.name)) : [],
    [groups, selectedNode],
  );
  const selectedGroup = applicableGroups[groupIndex];
  const compact = width < 96;
  const visibleRows = Math.max(3, height - 14);

  const refresh = useCallback(async (message = "数据已刷新") => {
    setBusy(true);
    setStatusKind("normal");
    setStatus("正在读取 Provider、节点和选择组…");
    try {
      const snapshot = await api.snapshot();
      setProviders(snapshot.providers);
      setGroups(snapshot.groups);
      setVersion(snapshot.version);
      setProviderIndex((index) => clampIndex(index, snapshot.providers.length));
      setConnected(true);
      setStatusKind("success");
      setStatus(`${message} · ${snapshot.providers.length} 个 Provider · ${snapshot.groups.length} 个选择组`);
    } catch (error) {
      setConnected(false);
      setStatusKind("error");
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }, [api]);

  const perform = useCallback(async (message: string, operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setStatusKind("normal");
    setStatus(`${message}…`);
    try {
      await operation();
      await refresh(message.replace("正在", "") + "完成");
    } catch (error) {
      setStatusKind("error");
      setStatus(errorMessage(error));
      setBusy(false);
    }
  }, [busy, refresh]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    setNodeIndex((index) => clampIndex(index, nodes.length));
  }, [nodes.length]);
  useEffect(() => {
    setGroupIndex((index) => clampIndex(index, applicableGroups.length));
  }, [applicableGroups.length, selectedNode?.name]);

  useKeyboard((key) => {
    if (key.ctrl && key.name === "c" || key.name === "q") {
      renderer.destroy();
      return;
    }
    if (key.sequence === "?" || key.name === "?") {
      setShowHelp((value) => !value);
      return;
    }
    if (showHelp) {
      if (key.name === "escape") setShowHelp(false);
      return;
    }
    if (key.name === "left" || key.name === "h") {
      setProviderIndex((index) => cycle(index, -1, providers.length));
      setNodeIndex(0);
      setGroupIndex(0);
    } else if (key.name === "right" || key.name === "l") {
      setProviderIndex((index) => cycle(index, 1, providers.length));
      setNodeIndex(0);
      setGroupIndex(0);
    } else if (key.name === "up" || key.name === "k") {
      setNodeIndex((index) => cycle(index, -1, nodes.length));
      setGroupIndex(0);
    } else if (key.name === "down" || key.name === "j") {
      setNodeIndex((index) => cycle(index, 1, nodes.length));
      setGroupIndex(0);
    } else if (key.name === "g") {
      setGroupIndex((index) => cycle(index, 1, applicableGroups.length));
    } else if (key.name === "r") {
      void refresh();
    } else if (key.name === "u" && selectedProvider) {
      void perform(`正在更新 ${selectedProvider.name}`, () => api.updateProvider(selectedProvider.name));
    } else if (key.name === "a" && selectedProvider) {
      void perform(`正在检测 ${selectedProvider.name} 的全部节点`, () => api.healthCheckProvider(selectedProvider.name));
    } else if (key.name === "t" && selectedProvider && selectedNode) {
      void perform(`正在测试 ${selectedNode.name}`, async () => {
        const delay = await api.testNode(selectedProvider.name, selectedNode.name);
        if (delay !== undefined) setStatus(`测速完成 · ${delay} ms`);
      });
    } else if ((key.name === "return" || key.name === "enter") && selectedNode && selectedGroup) {
      void perform(`正在切换 ${selectedGroup.name}`, () => api.selectNode(selectedGroup.name, selectedNode.name));
    }
  });

  const providerWindow = windowed(providers, providerIndex, visibleRows);
  const nodeWindow = windowed(nodes, nodeIndex, visibleRows);
  const statusColor = statusKind === "error" ? COLOR.red : statusKind === "success" ? COLOR.green : COLOR.muted;

  return (
    <box flexDirection="column" flexGrow={1} backgroundColor={COLOR.bg} padding={1}>
      <box height={3} borderStyle="rounded" borderColor={connected ? COLOR.cyan : COLOR.border} paddingX={1} flexDirection="row" justifyContent="space-between">
        <text fg={COLOR.text} attributes={TextAttributes.BOLD}>MIHOMO <span fg={COLOR.cyan}>PILOT</span></text>
        <text fg={COLOR.muted}>{connected ? "● 已连接" : "○ 未连接"}  v{version}  {config.controller}</text>
      </box>

      <box flexGrow={1} flexDirection="row" marginTop={1} gap={1}>
        <Panel title={`PROVIDERS ${providerIndex + 1}/${providers.length || 0}`} width={compact ? 26 : "27%"}>
          {providerWindow.items.length === 0 ? <Empty text="没有可用的 Provider" /> : providerWindow.items.map((provider, offset) => {
            const index = providerWindow.start + offset;
            const selected = index === providerIndex;
            return (
              <text key={provider.name} fg={selected ? COLOR.cyan : COLOR.text} bg={selected ? COLOR.selected : undefined}>
                {selected ? "› " : "  "}{fit(provider.name, compact ? 20 : 26)} <span fg={COLOR.muted}>{provider.proxies?.length || 0}</span>
              </text>
            );
          })}
        </Panel>

        <Panel title={`NODES ${nodeIndex + 1}/${nodes.length || 0}`} flexGrow={1}>
          {nodeWindow.items.length === 0 ? <Empty text="此 Provider 没有节点" /> : nodeWindow.items.map((node, offset) => {
            const index = nodeWindow.start + offset;
            const selected = index === nodeIndex;
            const active = groups.some((group) => group.now === node.name);
            return (
              <text key={`${node.name}-${index}`} fg={selected ? COLOR.text : COLOR.muted} bg={selected ? COLOR.selected : undefined}>
                <span fg={active ? COLOR.cyan : COLOR.border}>{active ? "●" : "○"}</span>{selected ? " › " : "   "}
                {fit(node.name, compact ? Math.max(12, width - 47) : 34)}  <span fg={healthColor(node)}>{healthText(node)}</span>  <span fg={delayColor(latestDelay(node))}>{delayText(node)}</span>
              </text>
            );
          })}
        </Panel>

        {!compact && (
          <Panel title="DETAIL" width="29%">
            <LabelValue label="Provider" value={selectedProvider?.name || "—"} />
            <LabelValue label="类型" value={selectedNode?.type || "—"} />
            <LabelValue label="UDP" value={selectedNode?.udp === undefined ? "未知" : selectedNode.udp ? "支持" : "不支持"} />
            <LabelValue label="状态" value={selectedNode ? healthText(selectedNode) : "—"} color={selectedNode ? healthColor(selectedNode) : COLOR.muted} />
            <LabelValue label="延迟" value={selectedNode ? delayText(selectedNode) : "—"} color={delayColor(latestDelay(selectedNode))} />
            <text> </text>
            <text fg={COLOR.muted}>目标选择组</text>
            <text fg={selectedGroup ? COLOR.yellow : COLOR.red} attributes={TextAttributes.BOLD}>{selectedGroup?.name || "没有包含此节点的选择组"}</text>
            {selectedGroup && <text fg={COLOR.muted}>当前：<span fg={COLOR.text}>{selectedGroup.now || "—"}</span></text>}
            {applicableGroups.length > 1 && <text fg={COLOR.muted}>按 g 切换 · {groupIndex + 1}/{applicableGroups.length}</text>}
            <text> </text>
            <text fg={COLOR.muted}>最近更新</text>
            <text fg={COLOR.text}>{formatDate(selectedProvider?.updatedAt)}</text>
            <Subscription provider={selectedProvider} />
          </Panel>
        )}
      </box>

      <box height={4} marginTop={1} borderStyle="rounded" borderColor={statusKind === "error" ? COLOR.red : COLOR.border} paddingX={1} flexDirection="column">
        <text fg={statusColor}>{busy ? "◌ " : ""}{fit(status, Math.max(20, width - 5))}</text>
        <text fg={COLOR.blue}>h/l provider · j/k node · g group · Enter select · t test · a check · u update · r refresh · ? help · q quit</text>
      </box>

      {showHelp && <HelpOverlay configPath={configPath} />}
    </box>
  );
}

function Panel({ title, children, width, flexGrow }: { title: string; children: React.ReactNode; width?: number | `${number}%`; flexGrow?: number }) {
  return <box title={` ${title} `} borderStyle="rounded" borderColor={COLOR.border} backgroundColor={COLOR.panel} paddingX={1} flexDirection="column" width={width} flexGrow={flexGrow}>{children}</box>;
}

function Empty({ text }: { text: string }) {
  return <box flexGrow={1} alignItems="center" justifyContent="center"><text fg={COLOR.muted}>{text}</text></box>;
}

function LabelValue({ label, value, color = COLOR.text }: { label: string; value: string; color?: string }) {
  return <text fg={COLOR.muted}>{label.padEnd(10)}<span fg={color}>{value}</span></text>;
}

function Subscription({ provider }: { provider?: ProxyProvider }) {
  const info = provider?.subscriptionInfo;
  if (!info) return null;
  const used = (info.upload || 0) + (info.download || 0);
  const percentage = info.total ? Math.min(100, Math.round(used / info.total * 100)) : 0;
  return (
    <box flexDirection="column" marginTop={1}>
      <text fg={COLOR.muted}>订阅用量</text>
      <text fg={COLOR.text}>{formatBytes(used)} / {formatBytes(info.total || 0)}  <span fg={COLOR.cyan}>{percentage}%</span></text>
      {info.expire ? <text fg={COLOR.muted}>到期 {new Date(info.expire * 1000).toLocaleDateString()}</text> : null}
    </box>
  );
}

function HelpOverlay({ configPath }: { configPath: string }) {
  return (
    <box position="absolute" left="12%" right="12%" top={3} bottom={3} zIndex={10} borderStyle="double" borderColor={COLOR.cyan} backgroundColor="#0d131b" padding={2} flexDirection="column">
      <text fg={COLOR.cyan} attributes={TextAttributes.BOLD}>快捷键与配置</text>
      <text> </text>
      <text fg={COLOR.text}>h/l 或 ←/→    切换 Provider</text>
      <text fg={COLOR.text}>j/k 或 ↑/↓    移动节点光标</text>
      <text fg={COLOR.text}>g               切换可应用的选择组</text>
      <text fg={COLOR.text}>Enter           将节点应用到目标选择组</text>
      <text fg={COLOR.text}>t / a           测试单节点 / 检测整个 Provider</text>
      <text fg={COLOR.text}>u / r           更新订阅 / 刷新数据</text>
      <text fg={COLOR.text}>q               退出</text>
      <text> </text>
      <text fg={COLOR.muted}>配置文件</text>
      <text fg={COLOR.yellow}>{configPath}</text>
      <text fg={COLOR.muted}>可用 -c/--config 或 MIHOMO_TUI_CONFIG 指定其他路径。</text>
      <box flexGrow={1} />
      <text fg={COLOR.cyan}>按 ? 或 Esc 返回</text>
    </box>
  );
}

function healthText(node: ProxyNode): string {
  if (node.alive === undefined) return "未知";
  return node.alive ? "在线" : "离线";
}

function healthColor(node: ProxyNode): string {
  if (node.alive === undefined) return COLOR.muted;
  return node.alive ? COLOR.green : COLOR.red;
}

function delayText(node: ProxyNode): string {
  const delay = latestDelay(node);
  return delay === undefined ? "— ms" : `${delay} ms`;
}

function delayColor(delay: number | undefined): string {
  if (delay === undefined) return COLOR.muted;
  if (delay < 150) return COLOR.green;
  if (delay < 400) return COLOR.yellow;
  return COLOR.red;
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

function formatDate(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

function fit(value: string, max: number): string {
  if (max <= 1) return "";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function clampIndex(index: number, length: number): number {
  return length <= 0 ? 0 : Math.min(Math.max(index, 0), length - 1);
}

function cycle(index: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return (index + delta + length) % length;
}

function windowed<T>(items: T[], index: number, size: number): { items: T[]; start: number } {
  const start = Math.max(0, Math.min(index - Math.floor(size / 2), items.length - size));
  return { items: items.slice(start, start + size), start };
}
