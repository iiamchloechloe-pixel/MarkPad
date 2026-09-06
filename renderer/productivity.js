/* MarkPad 1.2: recovery, document search, quick opening, writing preferences. */
function persistDraft() {
  try {
    if (dirty) localStorage.setItem('markpad-draft', JSON.stringify({
      path: filePath, name: curName, content: editor.getMarkdown(), baseline: savedMarkdown,
    }));
    else localStorage.removeItem('markpad-draft');
    $('#stat-save').textContent = dirty ? '未保存 · 草稿已备份' : '已保存';
  } catch { $('#stat-save').textContent = '草稿备份失败，请手动保存'; }
}
function restoreDraft() {
  if (!recoveryDraft || typeof recoveryDraft.content !== 'string') return false;
  const draft = recoveryDraft; recoveryDraft = null;
  loadContent(draft.path || null, draft.content);
  curName = draft.name || '未命名.md'; savedMarkdown = draft.baseline ?? null;
  markDirty(true); persistDraft(); toast('已恢复上次未保存的草稿'); return true;
}
let closeApproved = false, closePending = false;
window.addEventListener('beforeunload', e => {
  if (closeApproved || !dirty) return;
  e.preventDefault(); e.returnValue = false;
  if (closePending) return;
  closePending = true;
  guard().then(ok => {
    closePending = false;
    if (ok) { closeApproved = true; window.api.closeWindow(); }
  }).catch(() => { closePending = false; });
});

// Search positions belong to the Markdown editor, never the surrounding UI.
let documentMatches = [], searchedMarkdown = '', findWasRich = false;
function sourcePosition(text, offset) {
  const lines = text.slice(0, offset).split('\n');
  return [lines.length, lines[lines.length - 1].length + 1];
}
function collectMatches() {
  searchedMarkdown = editor.getMarkdown();
  const q = $('#find-input').value;
  documentMatches = q ? [...searchedMarkdown.matchAll(new RegExp(escapeRe(q), $('#find-case').checked ? 'g' : 'gi'))]
    .map(m => ({ start: m.index, end: m.index + m[0].length })) : [];
  findMatches = documentMatches.length;
}
doFind = function(forward = true, next = false) {
  if (editor.isWysiwygMode()) toggleMode();
  collectMatches();
  findOrdinal = findMatches ? (next ? ((findOrdinal - 1 + (forward ? 1 : -1) + findMatches) % findMatches) + 1 : 1) : 0;
  updateFindCount();
  const m = documentMatches[findOrdinal - 1];
  if (m) editor.setSelection(sourcePosition(searchedMarkdown, m.start), sourcePosition(searchedMarkdown, m.end));
};
openFind = function() {
  if ($('#findbar').hidden) findWasRich = editor.isWysiwygMode();
  if (editor.isWysiwygMode()) toggleMode();
  $('#findbar').hidden = false;
  $('#find-input').focus(); $('#find-input').select();
  doFind();
};
closeFind = function() {
  $('#findbar').hidden = true;
  if (findWasRich && !editor.isWysiwygMode()) toggleMode();
  editor.focus();
};
replaceOne = function() {
  if (editor.getMarkdown() !== searchedMarkdown) doFind();
  const m = documentMatches[findOrdinal - 1]; if (!m) return;
  separateUndo();
  editor.replaceSelection($('#replace-input').value, sourcePosition(searchedMarkdown, m.start), sourcePosition(searchedMarkdown, m.end));
  separateUndo();
  doFind();
};
replaceAll = function() {
  collectMatches(); if (!findMatches) return;
  const replacement = $('#replace-input').value;
  const re = new RegExp(escapeRe($('#find-input').value), $('#find-case').checked ? 'g' : 'gi');
  const output = searchedMarkdown.replace(re, () => replacement);
  // One editor transaction keeps the entire replacement undoable.
  separateUndo();
  editor.replaceSelection(output, [1, 1], sourcePosition(searchedMarkdown, searchedMarkdown.length));
  separateUndo();
  doFind(); toast('已全部替换，可用 ⌘Z 撤销');
};
function separateUndo() {
  // Adapter for the bundled Toast UI 3.2.2 / ProseMirror history plugin.
  // Its closeHistory PluginKey is `closeHistory$`; covered by the smoke test.
  const view = editor.getCurrentModeEditor().view;
  view.dispatch(view.state.tr.setMeta('closeHistory$', true));
}
// Earlier listeners that received function objects need rebinding.
$('#btn-find').onclick = openFind;
$('#replace-one').onclick = replaceOne;
$('#replace-all').onclick = replaceAll;
$('#find-close').onclick = closeFind;

let quickFiles = [], filteredFiles = [], quickIndex = 0;
function flattenFiles(items) {
  return items.flatMap(item => item.type === 'file' ? [item.path] : flattenFiles(item.children || []));
}
function drawQuickFiles() {
  const q = $('#quick-query').value.toLocaleLowerCase();
  filteredFiles = quickFiles.filter(p => p.toLocaleLowerCase().includes(q)).slice(0, 100);
  quickIndex = Math.max(0, Math.min(quickIndex, filteredFiles.length - 1));
  const list = $('#quick-results'); list.replaceChildren();
  filteredFiles.forEach((p, i) => {
    const button = document.createElement('button'); button.type = 'button';
    button.className = 'quick-result' + (i === quickIndex ? ' selected' : '');
    button.textContent = p.split('/').pop();
    const small = document.createElement('small'); small.textContent = p; button.append(small);
    button.onclick = () => openQuickFile(p); list.append(button);
  });
  if (!filteredFiles.length) list.textContent = '没有匹配文件。可先打开文件或文件夹。';
  list.children[quickIndex]?.scrollIntoView({ block: 'nearest' });
}
async function openQuickFile(p) {
  $('#quick-dialog').close();
  if (!(await guard())) return;
  try { loadContent(p, await window.api.readFile(p)); editor.focus(); }
  catch (err) { toast('打开失败：' + err.message); }
}
async function openQuick() {
  try {
    const recent = await window.api.recentFiles();
    const tree = folderRoot ? flattenFiles((await window.api.readFolder(folderRoot)).tree) : [];
    quickFiles = [...new Set([...recent, ...tree])];
    quickIndex = 0; $('#quick-query').value = ''; drawQuickFiles();
    if (!$('#quick-dialog').open) $('#quick-dialog').showModal();
    $('#quick-query').focus();
  } catch (err) { toast('读取文件列表失败：' + err.message); }
}
$('#quick-query').oninput = () => { quickIndex = 0; drawQuickFiles(); };
$('#quick-query').onkeydown = e => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); quickIndex += e.key === 'ArrowDown' ? 1 : -1; drawQuickFiles();
  } else if (e.key === 'Enter' && filteredFiles[quickIndex]) {
    e.preventDefault(); openQuickFile(filteredFiles[quickIndex]);
  }
};

const writingDefaults = { size: 16, line: 1.8, width: 820 };
let writing = { ...writingDefaults };
try { Object.assign(writing, JSON.parse(localStorage.getItem('markpad-writing'))); } catch {}
function applyWriting() {
  for (const [key, min, max, unit] of [['size', 12, 28, 'px'], ['line', 1.2, 2.4, ''], ['width', 520, 1100, 'px']]) {
    writing[key] = Math.min(max, Math.max(min, Number(writing[key]) || writingDefaults[key]));
    document.documentElement.style.setProperty('--writing-' + key, writing[key] + unit);
    $('#writing-' + key).value = writing[key];
    $('#writing-' + key + '-value').textContent = writing[key];
  }
  localStorage.setItem('markpad-writing', JSON.stringify(writing));
}
for (const key of Object.keys(writingDefaults)) $('#writing-' + key).oninput = e => { writing[key] = e.target.value; applyWriting(); };
$('#writing-reset').onclick = () => { writing = { ...writingDefaults }; applyWriting(); };
function openWriting() { if (!$('#writing-dialog').open) $('#writing-dialog').showModal(); }
$('#btn-quick').onclick = openQuick;
$('#btn-writing').onclick = openWriting;
window.api.onMenu('quick', openQuick);
window.api.onMenu('writing', openWriting);
applyWriting();
