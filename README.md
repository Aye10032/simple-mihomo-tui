# simple-mihomo-tui

一个专注于日常节点操作的轻量 Mihomo 终端面板：

- 查看和切换 proxy provider
- 更新远程 provider 订阅
- 触发 provider 全量健康检查
- 测试单个节点的延迟
- 把节点应用到包含它的 `Selector` 代理组

## 安装与运行

最终用户不需要安装 Bun。推荐直接从 [GitHub Releases](https://github.com/Aye10032/simple-mihomo-tui/releases) 下载与系统对应的可执行文件，赋予执行权限后放入 `PATH`：

```bash
chmod +x mihomo-tui-linux-x64
sudo install mihomo-tui-linux-x64 /usr/local/bin/mihomo-tui
mihomo-tui
```

也可以从 GitHub 通过 npm 调试安装；这种方式仅要求 Node.js 20+，首次运行会下载并校验对应版本的 standalone executable：

```bash
npm install -g --allow-git=all github:Aye10032/simple-mihomo-tui#main
mihomo-tui
```

> npm 12 默认禁用 Git 依赖，所以从 GitHub 安装时需要显式传入 `--allow-git=all`。正式发布到 npm registry 后不需要此参数。

首次运行会创建用户配置文件，并使用权限 `0600` 保存：

```text
Linux:   ~/.config/simple-mihomo-tui/config.json
macOS:   ~/Library/Application Support/simple-mihomo-tui/config.json
Windows: %APPDATA%\simple-mihomo-tui\config.json
```

Linux 上会优先遵循 `$XDG_CONFIG_HOME`。可以用参数或环境变量指定其他路径：

```bash
mihomo-tui --config /path/to/config.json
MIHOMO_TUI_CONFIG=/path/to/config.json mihomo-tui
```

不会在 `npm install` 阶段修改 Home 目录；CLI 二进制和配置都在第一次运行 `mihomo-tui` 时初始化。下载的二进制会缓存在系统用户缓存目录中。

## 本地开发

开发与构建阶段需要 [Bun](https://bun.sh/)，并与用户配置完全分开：

```bash
bun install
cp config.dev.example.json config.dev.json
bun dev
```

`bun dev` 固定读取仓库中的 `config.dev.json`。该文件已加入 `.gitignore`，不会误提交 Mihomo 密钥。`bun start` 则和正式 CLI 一样读取用户配置。

构建当前或指定平台的独立可执行文件：

```bash
bun run build bun-linux-x64-baseline dist/mihomo-tui-linux-x64
```

推送 `v*` tag 后，GitHub Actions 会构建 Linux、macOS、Windows 的 x64/arm64 二进制并创建带 SHA-256 校验文件的 Release。

配置字段：

| 字段 | 用途 | 默认值 |
| --- | --- | --- |
| `controller` | Mihomo REST API 地址 | `http://127.0.0.1:9090` |
| `secret` | Mihomo `secret`，使用 Bearer 认证 | 空 |
| `username` / `password` | 控制器前置网关的 Basic 认证；仅在 `secret` 为空时启用 | 空 |
| `testUrl` | 节点测速 URL | Google 204 地址 |
| `timeout` | 请求和测速超时（毫秒） | `5000` |

> Mihomo 原生控制器通常只有一个 `secret`，并没有用户名字段。`username/password` 是为 Nginx、Caddy 等前置网关提供的兼容选项。若两种认证同时填写，优先使用 `secret`。

## 快捷键

| 按键 | 操作 |
| --- | --- |
| `h/l`、`←/→` | 切换 Provider |
| `j/k`、`↓/↑` | 选择节点 |
| `g` | 切换包含当前节点的 Selector 组 |
| `Enter` | 应用节点 |
| `t` | 测试当前节点 |
| `a` | 检测当前 Provider 的全部节点 |
| `u` | 更新当前 Provider 订阅 |
| `r` | 刷新界面数据 |
| `?` | 显示帮助 |
| `q` | 退出 |

Mihomo API 的 Provider 更新与健康检查接口参考[官方文档](https://wiki.metacubex.one/api/)。
