# MarkPad

一个对标 **Typora** 的本地 Markdown 桌面编辑器，基于 Electron。所见即所得编辑，文件以 `.md` 保存。

## 下载安装（macOS）

前往 [**Releases**](https://github.com/iiamchloechloe-pixel/MarkPad/releases/latest) 按你的芯片下载：

| 你的 Mac | 下载文件 |
|----------|----------|
| **Apple Silicon**（M1/M2/M3/M4） | `MarkPad-1.0.0-mac-arm64.zip` |
| **Intel** | `MarkPad-1.0.0-mac-x64.zip` |

> 不确定芯片？点左上角  → 关于本机，看「芯片 / 处理器」。

1. 解压得到 `MarkPad.app`，拖入「应用程序」。
2. **首次打开**：右键点 App →「打开」，弹窗里再点「打开」。
   （未经 Apple 公证，故首次需手动允许；或终端执行 `xattr -dr com.apple.quarantine /Applications/MarkPad.app`）

## 运行

```bash
cd MarkPad
npm install      # 首次需要
npm start
```

## 打包成 .app

> `npm run dist:mac`（electron-builder）需要联网下载打包资源。网络受限时用下面的**离线打包脚本**，基于本地已安装的 Electron 二进制重组应用包：

```bash
bash build/make-app.sh          # 产出 dist/MarkPad.app（已 ad-hoc 签名）
```

安装到「应用程序」（让启动台 / 双击 .md 关联生效）：

```bash
rm -rf /Applications/MarkPad.app
cp -R dist/MarkPad.app /Applications/MarkPad.app
/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -f /Applications/MarkPad.app
open -a /Applications/MarkPad.app
```

## 应用图标

图标源文件与产物都在 `build/` 下：

- `build/icon.svg` —— 备用的线框/几何版图标（用 `rsvg-convert` 渲染）
- `build/render-icon.js` —— **当前图标**：白底 + 黑色 Didot 衬线体「M」。用 Electron/Chrome 渲染，因此能用到 macOS 系统字体（Didot/Bodoni 这类 fontconfig 找不到的字体）
- `build/dock-icon.png` —— 运行时 Dock 图标（`main.js` 里 `app.dock.setIcon()` 用它强制刷新，绕过系统图标缓存）

重新生成图标：

```bash
./node_modules/.bin/electron build/render-icon.js     # → build/icon_1024.png
# 切字体/字重：ICON_FONT="Bodoni 72" ICON_WEIGHT=700 ./node_modules/.bin/electron build/render-icon.js
sips -z 1024 1024 build/icon_1024.png --out build/dock-icon.png
# 重建 .icns：见 build/ 里的 sips/iconutil 流程（生成 icon.iconset → icon.icns）
bash build/make-app.sh          # 把新图标打进应用包
```

### macOS 图标缓存（改了图标却不更新时）

macOS 的 IconServices 缓存非常顽固。本项目用 `app.dock.setIcon()` 让 **Dock 图标**在运行时即时刷新，无需清缓存。但**启动台 / 访达**用的是静态缓存，若仍显示旧图标：

```bash
# 清每用户缓存 + 重启 Dock（无需密码）
rm -rf "$(getconf DARWIN_USER_CACHE_DIR)com.apple.iconservices.store"
killall -KILL IconServicesAgent; killall Dock

# 仍不更新时，清系统级缓存（需管理员密码），然后注销重登或重启
sudo rm -rf /Library/Caches/com.apple.iconservices.store && killall Dock
```

> 最省事的办法：**重启一次 Mac**，所有图标缓存自动重建。

## 功能

| 分类 | 功能 |
|------|------|
| 文件 | 打开/保存/另存为本地文件、**双击 .md 直接打开**、最近文件、拖拽打开 |
| 侧栏 | **文件树**（打开文件夹）、**大纲**（标题导航，点击跳转），⌘\\ 切换 |
| 编辑 | 格式工具栏、⌘B/⌘I/⌘E/⌘K 快捷键、自动配对括号、列表自动续行、Tab 缩进 |
| 预览 | 实时分屏、滚动同步、**代码高亮**（highlight.js）、**数学公式**（KaTeX）、任务列表可点选 |
| 查找 | **查找 / 替换**（⌘F），支持大小写、上一个/下一个、全部替换 |
| 图片 | 粘贴 / 拖拽图片自动存入 `<文档名>.assets/` 并插入引用 |
| 导出 | **导出 PDF**、导出 HTML |
| 视图 | 仅编辑 / 分屏 / 仅预览（⌘1/2/3）、**打字机滚动**（⌘⇧T） |
| 主题 | **外观跟随系统**日/夜（也可手动浅色/深色，⌘D 循环切换）、**打字机编辑器主题**（⌘⇧P，米黄纸张 + 衬线/等宽字体） |
| 界面 | 工具栏统一使用线框（line）SVG 图标，跟随主题色 |

## 快捷键

- `⌘N` 新建 · `⌘O` 打开 · `⌘⇧O` 打开文件夹 · `⌘S` 保存 · `⌘⇧S` 另存为
- `⌘B` 加粗 · `⌘I` 斜体 · `⌘E` 行内代码 · `⌘K` 链接 · `⌘⌥1/2/3` 标题
- `⌘F` 查找替换 · `⌘\` 侧栏 · `⌘1/2/3` 视图
- `⌘D` 循环切换外观（跟随系统→浅→深）· `⌘⇧P` 打字机主题 · `⌘⇧T` 打字机滚动

## 技术说明

- 渲染：marked + DOMPurify（防 XSS）+ highlight.js + KaTeX
- 安全：`contextIsolation` 开启，`nodeIntegration` 关闭，预加载脚本经 IPC 桥接磁盘操作
- 当前依赖的 Electron 为 x64 构建，在 Apple Silicon 上通过 Rosetta 运行（网络受限时无法下载 arm64 原生版）

## 真正的 WYSIWYG（待办）

Typora 最核心的「源码即所见」内联编辑（输入时隐藏标记符号）尚未实现，目前为分屏式实时预览。这是后续可做的最大单项。
