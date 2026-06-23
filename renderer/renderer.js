/* ============================================================
   MarkPad — WYSIWYG (Toast UI Editor) that stores Markdown
   ============================================================ */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let filePath = null;       // absolute path of current file (null = unsaved)
let curName = '未命名.md';
let folderRoot = null;
let dirty = false;

const WELCOME = `# 欢迎使用 MarkPad

这是一个**所见即所得**的本地 Markdown 编辑器 —— 直接像普通编辑器一样写作，文件仍以 \`.md\` 格式保存。

## 用法
- 加粗、标题、列表、表格、引用都所见即所得，无需手写标记
- 顶部 \`</>\` 切源码 · 查找替换 ⌘F · 打字机主题 ⌘⇧P
- 数学公式：写 \`$E = mc^2$\`，切到源码模式可看到 KaTeX 渲染
- ⌘N 新建 · ⌘O 打开 · ⌘S 保存 · ⌘\\ 侧栏

> 直接在这里开始输入试试。
`;

/* ---------- Toast UI Editor ---------- */
async function onImagePaste(blob, callback) {
  const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
  const b64 = await blobToBase64(blob);
  const res = await window.api.saveImage(filePath, b64, ext);
  callback(res.relative, '');
  return false;
}
function blobToBase64(blob) {
  return new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(blob); });
}

// KaTeX renders in the markdown-mode preview only (display-only; the document
// model is never touched, so saved markdown always keeps clean `$...$`).
function renderPreviewMath() {
  if (editor.isWysiwygMode()) return;
  const el = document.querySelector('#tui .toastui-editor-md-preview .toastui-editor-contents');
  if (!el || typeof renderMathInElement !== 'function') return;
  try {
    renderMathInElement(el, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
      ],
      throwOnError: false,
    });
  } catch {}
}

const editor = new toastui.Editor({
  el: $('#tui'),
  height: '100%',
  initialEditType: 'wysiwyg',
  previewStyle: 'vertical',
  hideModeSwitch: true,
  usageStatistics: false,
  autofocus: false,
  initialValue: WELCOME,
  toolbarItems: [
    ['heading', 'bold', 'italic', 'strike'],
    ['hr', 'quote'],
    ['ul', 'ol', 'task', 'indent', 'outdent'],
    ['table', 'image', 'link'],
    ['code', 'codeblock'],
  ],
  hooks: { addImageBlobHook: onImagePaste },
});
const tuiRoot = $('#tui .toastui-editor-defaultUI');

editor.on('change', () => { markDirty(true); scheduleUpdate(); });

/* ---------- Stats / title / dirty ---------- */
let updateTimer = null;
function scheduleUpdate() { clearTimeout(updateTimer); updateTimer = setTimeout(() => { updateStats(); buildOutline(); renderPreviewMath(); }, 150); }
function updateStats() {
  const t = editor.getMarkdown();
  const words = (t.trim().match(/[一-龥]|[a-zA-Z0-9_]+/g) || []).length;
  $('#stat-words').textContent = words + ' 字';
  $('#stat-chars').textContent = t.length + ' 字符';
  $('#stat-read').textContent = Math.max(1, Math.ceil(words / 300)) + ' 分钟';
}
function markDirty(d) {
  dirty = d;
  document.title = (d ? '● ' : '') + curName + ' — MarkPad';
}
function setFile(p, name) {
  filePath = p;
  curName = name || (p ? p.split(/[\\/]/).pop() : '未命名.md');
  markDirty(dirty);
  highlightActiveInTree();
  updateBase();
  if (p) localStorage.setItem('markpad-lastfile', p);
  else localStorage.removeItem('markpad-lastfile');
}
// Resolve relative image paths against the document folder so they display.
function updateBase() {
  const b = $('#docbase');
  if (filePath) b.href = 'file://' + encodeURI(filePath.replace(/[^/\\]+$/, ''));
  else b.removeAttribute('href');
}
function toast(msg) {
  const h = $('#hint'); h.textContent = msg; h.classList.add('show');
  clearTimeout(h._t); h._t = setTimeout(() => h.classList.remove('show'), 1600);
}

/* ---------- Guard + file operations ---------- */
async function guard() {
  if (!dirty) return true;
  const c = await window.api.confirmUnsaved(curName);
  if (c === 'cancel') return false;
  if (c === 'save') return await save();
  return true;
}
async function newFile() {
  if (!(await guard())) return;
  editor.setMarkdown(''); setFile(null, '未命名.md');
  updateStats(); buildOutline(); markDirty(false); editor.focus();
}
async function open() {
  if (!(await guard())) return;
  const res = await window.api.openDialog();
  if (res) { loadContent(res.filePath, res.content); toast('已打开 ' + curName); }
}
function loadContent(p, content) {
  editor.setMarkdown(content); setFile(p);
  updateStats(); buildOutline(); markDirty(false);
}
async function save() {
  if (!filePath) return saveAs();
  await window.api.saveFile(filePath, editor.getMarkdown());
  markDirty(false); toast('已保存'); return true;
}
async function saveAs() {
  const res = await window.api.saveAsDialog(editor.getMarkdown(), curName);
  if (!res) return false;
  setFile(res.filePath); markDirty(false); toast('已保存 ' + curName); return true;
}
async function restoreLastFile() {
  const last = localStorage.getItem('markpad-lastfile');
  if (!last) return;
  try {
    const content = await window.api.readFile(last);
    if (filePath === null && !dirty) loadContent(last, content);
  } catch { /* file moved/deleted — keep welcome */ }
}

/* ---------- Export ---------- */
function fullHtml() {
  marked.setOptions({ gfm: true, breaks: true });
  const body = DOMPurify.sanitize(marked.parse(editor.getMarkdown() || ''), { ADD_ATTR: ['target'] });
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${curName}</title>
<style>
body{font-family:-apple-system,"PingFang SC",sans-serif;max-width:820px;margin:40px auto;padding:0 20px;line-height:1.75;color:#222}
pre{background:#f6f8fa;padding:14px;border-radius:8px;overflow:auto}
code{background:#f6f8fa;padding:.2em .4em;border-radius:4px}pre code{background:none;padding:0}
blockquote{border-left:4px solid #4c6ef5;margin:0;padding:.3em 1em;color:#666}
table{border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px 12px}img{max-width:100%}
</style></head><body>${body}</body></html>`;
}
function exportHtml() {
  window.api.saveAsDialog(fullHtml(), curName.replace(/\.(md|markdown|txt)$/i, '') + '.html');
}
async function exportPdf() {
  const res = await window.api.exportPdf(fullHtml(), curName.replace(/\.(md|markdown|txt)$/i, ''));
  if (res) toast('已导出 PDF');
}

/* ---------- Editing mode (wysiwyg / markdown source) ---------- */
function toggleMode() {
  const md = editor.isWysiwygMode();
  editor.changeMode(md ? 'markdown' : 'wysiwyg', true);
  $('#stat-mode').textContent = md ? '源码模式' : '所见即所得';
  $('#btn-mode').classList.toggle('active', md);
  setTimeout(renderPreviewMath, 60);
}

/* ============================================================
   Sidebar: folder tree
   ============================================================ */
async function openFolder() {
  const res = await window.api.openFolderDialog();
  if (res) renderTree(res);
}
async function refreshTree() { if (folderRoot) renderTree(await window.api.readFolder(folderRoot)); }
function dirName(p) { return p.replace(/[/\\][^/\\]+$/, ''); }

function renderTree(res) {
  folderRoot = res.root;
  localStorage.setItem('markpad-lastfolder', res.root);
  $('#folder-name').textContent = res.name;
  $('#folder-name').title = res.root;
  $('#btn-new-file').hidden = false;
  $('#btn-refresh-tree').hidden = false;
  const tree = $('#tree'); tree.innerHTML = '';
  if (!res.tree.length) tree.innerHTML = '<div class="empty">没有 Markdown 文件</div>';
  else tree.appendChild(buildNodes(res.tree));
  highlightActiveInTree();
}
function buildNodes(items) {
  const frag = document.createDocumentFragment();
  for (const it of items) {
    const node = document.createElement('div');
    node.className = 'node ' + it.type;
    node.dataset.path = it.path;
    node.dataset.isdir = it.type === 'dir' ? '1' : '';
    const label = document.createElement('span');
    label.className = 'node-label';
    if (it.type === 'dir') {
      node.innerHTML = `<span class="caret">▾</span> 📁 `;
      label.textContent = it.name; node.appendChild(label);
      const children = document.createElement('div');
      children.className = 'children';
      children.appendChild(buildNodes(it.children));
      node.onclick = e => {
        e.stopPropagation();
        node.classList.toggle('collapsed');
        node.querySelector('.caret').style.transform =
          node.classList.contains('collapsed') ? 'rotate(-90deg)' : '';
      };
      node.oncontextmenu = e => showTreeMenu(e, node);
      frag.appendChild(node); frag.appendChild(children);
    } else {
      node.innerHTML = '📄 ';
      label.textContent = it.name; node.appendChild(label);
      node.onclick = async e => {
        e.stopPropagation();
        if (!(await guard())) return;
        loadContent(it.path, await window.api.readFile(it.path));
      };
      node.oncontextmenu = e => showTreeMenu(e, node);
      frag.appendChild(node);
    }
  }
  return frag;
}
function highlightActiveInTree() {
  $$('.tree .node').forEach(n => n.classList.toggle('active', n.dataset.path === filePath));
}
async function createFileIn(dir) {
  const res = await window.api.createFile(dir, '未命名.md');
  if (res?.filePath) {
    await refreshTree();
    if (await guard()) loadContent(res.filePath, '');
    const node = $(`.tree .node[data-path="${cssEscape(res.filePath)}"]`);
    if (node) startRename(node);
  }
}
function startRename(node) {
  const label = node.querySelector('.node-label');
  if (!label || node.querySelector('input')) return;
  const oldPath = node.dataset.path;
  const input = document.createElement('input');
  input.className = 'rename-input'; input.value = label.textContent;
  label.replaceWith(input); input.focus();
  const dot = input.value.lastIndexOf('.');
  input.setSelectionRange(0, dot > 0 ? dot : input.value.length);
  let done = false;
  const commit = async (saveIt) => {
    if (done) return; done = true;
    if (saveIt && input.value.trim() && input.value !== oldPath.split(/[/\\]/).pop()) {
      const res = await window.api.renameFile(oldPath, input.value);
      if (res?.error) toast(res.error);
      else if (res?.filePath && filePath === oldPath) setFile(res.filePath);
    }
    await refreshTree();
  };
  input.onkeydown = e => {
    if (e.key === 'Enter') { e.preventDefault(); commit(true); }
    else if (e.key === 'Escape') { e.preventDefault(); commit(false); }
  };
  input.onblur = () => commit(true);
}
async function deleteNode(node) {
  const p = node.dataset.path, name = p.split(/[/\\]/).pop();
  if (!confirm(`将“${name}”移到废纸篓？`)) return;
  await window.api.trashFile(p);
  if (filePath === p) { editor.setMarkdown(''); setFile(null, '未命名.md'); updateStats(); buildOutline(); markDirty(false); }
  await refreshTree();
}
function cssEscape(s) { return s.replace(/(["\\])/g, '\\$1'); }

let treeMenu = null;
function showTreeMenu(e, node) {
  e.preventDefault(); e.stopPropagation(); hideTreeMenu();
  const isDir = node.dataset.isdir === '1';
  const targetDir = isDir ? node.dataset.path : dirName(node.dataset.path);
  treeMenu = document.createElement('div');
  treeMenu.className = 'ctx-menu';
  [['新建文件', () => createFileIn(targetDir)],
   ['重命名', () => startRename(node)],
   ['移到废纸篓', () => deleteNode(node)],
   ['在访达中显示', () => window.api.revealInFinder(node.dataset.path)]
  ].forEach(([text, fn]) => {
    const mi = document.createElement('div');
    mi.className = 'ctx-item'; mi.textContent = text;
    mi.onclick = () => { hideTreeMenu(); fn(); };
    treeMenu.appendChild(mi);
  });
  document.body.appendChild(treeMenu);
  treeMenu.style.left = Math.min(e.clientX, window.innerWidth - 170) + 'px';
  treeMenu.style.top = Math.min(e.clientY, window.innerHeight - treeMenu.offsetHeight - 8) + 'px';
}
function hideTreeMenu() { if (treeMenu) { treeMenu.remove(); treeMenu = null; } }
document.addEventListener('click', hideTreeMenu);

/* ============================================================
   Sidebar: outline
   ============================================================ */
function buildOutline() {
  const lines = editor.getMarkdown().split('\n');
  const items = []; let inFence = false;
  lines.forEach(ln => {
    if (/^\s*```/.test(ln)) inFence = !inFence;
    const m = !inFence && ln.match(/^(#{1,6})\s+(.*)$/);
    if (m) items.push({ level: m[1].length, text: m[2].replace(/[#*`]/g, '').trim() });
  });
  const out = $('#outline');
  if (!items.length) { out.innerHTML = '<div class="empty">无标题</div>'; return; }
  out.innerHTML = '';
  items.forEach((it, idx) => {
    const el = document.createElement('div');
    el.className = `o-item l${it.level}`;
    el.textContent = it.text || '（无标题）';
    el.onclick = () => scrollToHeading(idx);
    out.appendChild(el);
  });
}
function scrollToHeading(idx) {
  const sel = editor.isWysiwygMode() ? '.toastui-editor-ww-container' : '.toastui-editor-md-container';
  const hs = document.querySelectorAll(`#tui ${sel} .toastui-editor-contents :is(h1,h2,h3,h4,h5,h6)`);
  if (hs[idx]) hs[idx].scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ============================================================
   View / theme
   ============================================================ */
function toggleSidebar() { document.body.dataset.sidebar = document.body.dataset.sidebar === 'hidden' ? '' : 'hidden'; }
function setSidebarTab(tab) {
  document.body.dataset.sidebar = '';
  $$('.side-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  $('#files-panel').hidden = tab !== 'files';
  $('#outline-panel').hidden = tab !== 'outline';
}

/* ---- Appearance (light/dark) — only affects the 默认 theme ---- */
let appearance = localStorage.getItem('markpad-appearance') || 'system';
const darkMQ = window.matchMedia('(prefers-color-scheme: dark)');
function setAppearance(mode) {
  appearance = mode; localStorage.setItem('markpad-appearance', mode); applyTheme();
  toast({ system: '外观：跟随系统', light: '外观：浅色', dark: '外观：深色' }[mode]);
}
function cycleAppearance() { setAppearance({ system: 'light', light: 'dark', dark: 'system' }[appearance]); }
darkMQ.addEventListener('change', () => { if (appearance === 'system' && skin === 'default') applyTheme(); });

/* ---- Editor themes (readable presets) ---- */
const SKINS = ['default', 'eyecare', 'sepia', 'typewriter', 'night'];
const SKIN_LABEL = { default: '默认', eyecare: '护眼', sepia: '棕褐', typewriter: '打字机', night: '夜读' };
const DARK_SKINS = new Set(['night']);          // these are dark-based palettes
let skin = SKINS.includes(localStorage.getItem('markpad-skin')) ? localStorage.getItem('markpad-skin') : 'default';

function effectiveDark() {
  if (DARK_SKINS.has(skin)) return true;
  if (skin !== 'default') return false;          // named light skins
  return appearance === 'dark' || (appearance === 'system' && darkMQ.matches);
}
function applyTheme() {
  const dark = effectiveDark();
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  if (skin === 'default') delete document.documentElement.dataset.skin;
  else document.documentElement.dataset.skin = skin;
  if (tuiRoot) tuiRoot.classList.toggle('toastui-editor-dark', dark);
  // toolbar buttons
  $('#btn-theme').classList.toggle('active', appearance !== 'system');
  $('#btn-theme').title = appearance === 'system' ? '外观：跟随系统（点击切换）'
    : (dark ? '外观：深色（点击切换）' : '外观：浅色（点击切换）');
  $('#btn-skin').classList.toggle('active', skin !== 'default');
  $('#btn-skin').title = '编辑器主题：' + SKIN_LABEL[skin] + '（点击切换）';
}
const applyAppearance = applyTheme;   // back-compat alias used at init
function applySkin() { applyTheme(); }
function setSkin(name) {
  if (!SKINS.includes(name)) return;
  skin = name; localStorage.setItem('markpad-skin', name); applyTheme();
  toast('主题：' + SKIN_LABEL[name]);
}
function cycleSkin() { setSkin(SKINS[(SKINS.indexOf(skin) + 1) % SKINS.length]); }

// Dropdown under the 🅰 button to pick a theme directly
let themeMenu = null;
function closeThemeMenu() { if (themeMenu) { themeMenu.remove(); themeMenu = null; } }
function showSkinMenu() {
  if (themeMenu) { closeThemeMenu(); return; }   // toggle
  themeMenu = document.createElement('div');
  themeMenu.className = 'ctx-menu theme-menu';
  SKINS.forEach(s => {
    const mi = document.createElement('div');
    mi.className = 'ctx-item' + (s === skin ? ' on' : '');
    mi.textContent = (s === skin ? '✓ ' : '   ') + SKIN_LABEL[s];
    mi.onclick = () => { closeThemeMenu(); setSkin(s); };
    themeMenu.appendChild(mi);
  });
  document.body.appendChild(themeMenu);
  const r = $('#btn-skin').getBoundingClientRect();
  themeMenu.style.left = Math.min(r.left, window.innerWidth - themeMenu.offsetWidth - 8) + 'px';
  themeMenu.style.top = (r.bottom + 4) + 'px';
}
document.addEventListener('click', closeThemeMenu);

/* ============================================================
   Find / Replace (native findInPage + markdown-level replace)
   ============================================================ */
let findMatches = 0, findOrdinal = 0;
window.api.onFound(r => { findMatches = r.matches; findOrdinal = r.activeMatchOrdinal; updateFindCount(); });
function updateFindCount() {
  $('#find-count').textContent = findMatches ? `${findOrdinal}/${findMatches}` : '0/0';
}
function doFind(forward = true, findNext = false) {
  const t = $('#find-input').value;
  if (!t) { window.api.stopFind(); findMatches = 0; findOrdinal = 0; updateFindCount(); return; }
  window.api.findInPage(t, { forward, findNext, matchCase: $('#find-case').checked });
}
function openFind() {
  $('#findbar').hidden = false;
  $('#find-input').focus(); $('#find-input').select();
  if ($('#find-input').value) doFind(true, false);
}
function closeFind() { $('#findbar').hidden = true; window.api.stopFind(); editor.focus(); }
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function replaceOne() {
  const q = $('#find-input').value; if (!q || !findMatches) return;
  const rep = $('#replace-input').value;
  const re = new RegExp(escapeRe(q), $('#find-case').checked ? 'g' : 'gi');
  let n = 0;
  const out = editor.getMarkdown().replace(re, m => (++n === findOrdinal ? rep : m));
  editor.setMarkdown(out, false); markDirty(true); updateStats(); buildOutline();
  setTimeout(() => doFind(true, false), 30);
}
function replaceAll() {
  const q = $('#find-input').value; if (!q) return;
  const rep = $('#replace-input').value;
  const re = new RegExp(escapeRe(q), $('#find-case').checked ? 'g' : 'gi');
  const md = editor.getMarkdown();
  if (!re.test(md)) { toast('无匹配'); return; }
  editor.setMarkdown(md.replace(re, rep), false);
  markDirty(true); updateStats(); buildOutline();
  setTimeout(() => doFind(true, false), 30);
  toast('已全部替换');
}

/* ============================================================
   Drag & drop to open
   ============================================================ */
['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); document.body.classList.add('dragging'); }));
['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => {
  if (ev === 'dragleave' && e.relatedTarget) return;
  e.preventDefault(); document.body.classList.remove('dragging');
}));
document.addEventListener('drop', async e => {
  const f = [...e.dataTransfer.files][0];
  if (f && /\.(md|markdown|txt)$/i.test(f.name)) {
    if (!(await guard())) return;
    loadContent(f.path, await window.api.readFile(f.path));
  }
});

/* ============================================================
   Wire up
   ============================================================ */
$('#btn-new').onclick = newFile;
$('#btn-open').onclick = open;
$('#btn-save').onclick = save;
$('#btn-mode').onclick = toggleMode;
$('#btn-theme').onclick = cycleAppearance;
$('#btn-skin').onclick = e => { e.stopPropagation(); showSkinMenu(); };
$('#btn-find').onclick = openFind;
$('#btn-toggle-sidebar').onclick = toggleSidebar;
$('#btn-open-folder').onclick = openFolder;
$('#btn-new-file').onclick = () => folderRoot && createFileIn(folderRoot);
$('#btn-refresh-tree').onclick = refreshTree;
$$('.side-tab').forEach(t => t.onclick = () => setSidebarTab(t.dataset.tab));

// Find bar controls
$('#find-input').addEventListener('input', () => doFind(true, false));
$('#find-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); doFind(!e.shiftKey, true); }
  else if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
});
$('#replace-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); replaceOne(); }
  else if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
});
$('#find-case').addEventListener('change', () => doFind(true, false));
$('#find-next').onclick = () => doFind(true, true);
$('#find-prev').onclick = () => doFind(false, true);
$('#replace-one').onclick = replaceOne;
$('#replace-all').onclick = replaceAll;
$('#find-close').onclick = closeFind;

window.api.onMenu('new', newFile);
window.api.onMenu('open', open);
window.api.onMenu('openFolder', openFolder);
window.api.onMenu('save', save);
window.api.onMenu('saveAs', saveAs);
window.api.onMenu('exportHtml', exportHtml);
window.api.onMenu('exportPdf', exportPdf);
window.api.onMenu('theme', cycleAppearance);
window.api.onMenu('appearance', m => setAppearance(m));
window.api.onMenu('mode', toggleMode);
window.api.onMenu('skin', m => (typeof m === 'string' && SKINS.includes(m)) ? setSkin(m) : cycleSkin());
window.api.onMenu('find', openFind);
window.api.onMenu('sidebar', toggleSidebar);
window.api.onMenu('sidebarTab', setSidebarTab);
window.api.onFileOpened(({ filePath: p, content }) => loadContent(p, content));

function blankDoc() {
  editor.setMarkdown(''); setFile(null, '未命名.md');
  updateStats(); buildOutline(); markDirty(false);
}
// Startup behaviour (welcome doc is already loaded as initialValue).
// Welcome doc only shows in 'welcome' mode; every other mode starts blank.
window.api.onStartup(async ({ mode, folder }) => {
  try {
    if (mode === 'blank') {
      blankDoc();
    } else if (mode === 'restore') {
      const lastDir = localStorage.getItem('markpad-lastfolder');
      if (lastDir) { try { renderTree(await window.api.readFolder(lastDir)); } catch {} }
      const lastFile = localStorage.getItem('markpad-lastfile');
      let loaded = false;
      if (lastFile) {
        try { loadContent(lastFile, await window.api.readFile(lastFile)); loaded = true; } catch {}
      }
      if (!loaded) blankDoc();          // no last file → blank, not welcome
    } else if (mode === 'folder' && folder) {
      blankDoc();                        // empty editor…
      try { renderTree(await window.api.readFolder(folder)); } catch {}  // …with the folder's tree
    }
    // 'welcome' → keep the welcome document already shown
  } catch {}
});

document.addEventListener('keydown', e => {
  if (!(e.metaKey || e.ctrlKey)) return;
  const k = e.key.toLowerCase();
  if (k === 's') { e.preventDefault(); e.shiftKey ? saveAs() : save(); }
  else if (k === 'o') { e.preventDefault(); open(); }
  else if (k === 'n') { e.preventDefault(); newFile(); }
  else if (k === '\\') { e.preventDefault(); toggleSidebar(); }
  else if (k === 'd') { e.preventDefault(); cycleAppearance(); }
  else if (k === '/') { e.preventDefault(); toggleMode(); }
  else if (k === 'f') { e.preventDefault(); openFind(); }
});

/* ---------- Init ---------- */
applyAppearance();
applySkin();
updateStats(); buildOutline(); markDirty(false);
// 启动时显示欢迎文档；上次的文件可从「文件 → 打开最近文件」重新打开。
