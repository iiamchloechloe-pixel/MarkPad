# MarkPad

所见即所得的 markdown 编辑器（macOS）。编辑时像普通富文本编辑器一样写作，文件始终以纯 `.md` 保存。

## 下载安装

前往 [**Releases**](https://github.com/iiamchloechloe-pixel/MarkPad/releases/latest) 下载：

- **`MarkPad-1.0.0-mac-universal.zip`** —— 通用版，**Intel 和 Apple Silicon 都能用**（推荐，下这个就行）
- 想要体积更小的单架构包，也可选 `...-arm64.zip`（Apple Silicon）或 `...-x64.zip`（Intel）

1. 解压得到 `MarkPad.app`，拖入「应用程序」。
2. **首次打开**：右键点 App →「打开」，弹窗里再点「打开」。
   （未经 Apple 公证，故首次需手动允许；或终端执行 `xattr -dr com.apple.quarantine /Applications/MarkPad.app`）

## 功能

- **所见即所得编辑**：标题、加粗、斜体、列表、任务列表、表格、引用、代码块、链接、图片都直接可视化编辑，保存为干净的 markdown
- **源码模式**：`⌘/` 在所见即所得与 markdown 源码间切换；源码模式右侧带实时预览
- **数学公式**：支持 `$..$` 行内与 `$$..$$` 块级，在源码模式预览里用 KaTeX 渲染（保存的 `.md` 始终是原始 `$` 文本）
- **侧栏**：打开文件夹后浏览文件树（右键可新建 / 重命名 / 移到废纸篓 / 在访达中显示）、大纲（标题导航，点击跳转），`⌘\` 切换
- **查找替换**：`⌘F`，支持大小写、上一个 / 下一个、单个 / 全部替换
- **图片**：粘贴 / 拖拽图片自动存入 `<文档名>.assets/` 并插入引用
- **文件**：打开 / 保存 / 另存为、双击 `.md` 直接打开、最近文件、拖拽打开、启动显示欢迎文档
- **导出**：导出 PDF、导出 HTML
- **主题**：外观跟随系统日 / 夜（也可手动浅 / 深，`⌘D` 循环）；打字机主题（`⌘⇧P`，米黄纸张 + 衬线 / 等宽字体）
- **通用二进制**：一个 App 同时原生支持 Intel 与 Apple Silicon

## 快捷键

- `⌘N` 新建 · `⌘O` 打开 · `⌘⇧O` 打开文件夹 · `⌘S` 保存 · `⌘⇧S` 另存为
- `⌘F` 查找替换 · `⌘/` 源码 ↔ 所见即所得 · `⌘\` 侧栏
- `⌘D` 外观循环（跟随系统 → 浅 → 深）· `⌘⇧P` 打字机主题
- 加粗 `⌘B`、斜体 `⌘I` 等格式快捷键由编辑器内置工具栏提供

---

## 开发与构建

### 运行

```bash
cd MarkPad
npm install      # 首次需要
npm start
```

### 打包

单架构（当前机器架构，离线、基于本地 Electron 二进制重组）：

```bash
bash build/make-app.sh          # 产出 dist/MarkPad.app（已 ad-hoc 签名）
```

通用二进制（Intel + Apple Silicon 合并为一个 App）：

```bash
# 需先准备好另一架构的 Electron.app（如用镜像下载并解压）
#   x64 输入 → /tmp/MarkPad-x64.app
#   arm64 输入 → SRC_APP=<arm64 Electron.app> bash build/make-app.sh 后复制到 /tmp/MarkPad-arm64.app
node build/make-universal.js    # 用 @electron/universal 合并 → dist/MarkPad-universal.app
codesign --force --deep --sign - dist/MarkPad-universal.app
```

安装到「应用程序」（让启动台 / 双击 `.md` 关联生效）：

```bash
rm -rf /Applications/MarkPad.app
cp -R dist/MarkPad.app /Applications/MarkPad.app
/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -f /Applications/MarkPad.app
open -a /Applications/MarkPad.app
```

### 应用图标

图标源文件与脚本都在 `build/` 下：

- `build/render-icon.js` —— 当前图标：白底 + 黑色 Didot 衬线体「M」。用 Electron/Chrome 渲染，因此能用到 macOS 系统字体（Didot/Bodoni 这类 fontconfig 找不到的字体）
- `build/icon.svg` —— 备用的线框/几何版图标
- `build/dock-icon.png` —— 运行时 Dock 图标（`main.js` 里 `app.dock.setIcon()` 用它强制刷新，绕过系统图标缓存）

重新生成：

```bash
./node_modules/.bin/electron build/render-icon.js     # → build/icon_1024.png
# 切字体/字重：ICON_FONT="Bodoni 72" ICON_WEIGHT=700 ./node_modules/.bin/electron build/render-icon.js
sips -z 1024 1024 build/icon_1024.png --out build/dock-icon.png
# 重建 .icns：sips 生成各尺寸 → iconutil 合成 build/icon.icns
bash build/make-app.sh
```

改了图标但启动台 / 访达不更新时（IconServices 缓存很顽固）：

```bash
rm -rf "$(getconf DARWIN_USER_CACHE_DIR)com.apple.iconservices.store"
killall -KILL IconServicesAgent; killall Dock
# 仍不更新：sudo rm -rf /Library/Caches/com.apple.iconservices.store && killall Dock，或重启 Mac
```

> Dock 图标用 `app.dock.setIcon()` 在运行时即时刷新，无需清缓存。

## 技术说明

- 编辑器引擎：**Toast UI Editor**（所见即所得，直接存储 markdown），用 esbuild 打成离线 bundle（`renderer/vendor/`）
- 渲染辅助：KaTeX（数学公式）、marked + DOMPurify（导出 HTML / PDF）
- 安全：`contextIsolation` 开启，`nodeIntegration` 关闭，磁盘操作经 preload 的 IPC 桥接
- 打包：通用二进制（Intel + Apple Silicon），见 `build/make-universal.js`
