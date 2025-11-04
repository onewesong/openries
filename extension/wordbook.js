function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  if (!Number.isFinite(diffMs)) return '';
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  const month = Math.floor(day / 30);
  const year = Math.floor(day / 365);
  if (sec < 10) return '刚刚';
  if (sec < 60) return `${sec} 秒前`;
  if (min < 60) return `${min} 分钟前`;
  if (hr < 24) return `${hr} 小时前`;
  if (day < 30) return `${day} 天前`;
  if (month < 12) return `${month} 个月前`;
  return `${year} 年前`;
}

async function fetchWordbook() {
  const res = await chrome.runtime.sendMessage({ type: 'RIES_GET_WORDBOOK' });
  if (!res?.ok) throw new Error(res?.error || 'Failed to get wordbook');
  return res.data || [];
}

async function removeItem(id) {
  const res = await chrome.runtime.sendMessage({ type: 'RIES_REMOVE_FROM_WORDBOOK', id });
  if (!res?.ok) throw new Error(res?.error || 'Failed to remove');
  return res.data || [];
}

async function clearAll() {
  const res = await chrome.runtime.sendMessage({ type: 'RIES_CLEAR_WORDBOOK' });
  if (!res?.ok) throw new Error(res?.error || 'Failed to clear');
  return res.data || [];
}

async function exportCSV() {
  const res = await chrome.runtime.sendMessage({ type: 'RIES_EXPORT_WORDBOOK' });
  if (!res?.ok) throw new Error(res?.error || 'Failed to export');
  const data = res.data || [];
  const csv = [
    ['英文', '中文', '上下文', '添加时间'],
    ...data.map(item => [item['英文'], item['中文'], item['上下文'], item['添加时间']])
  ].map(row => row.map(cell => `"${cell ?? ''}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ries-wordbook-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Remembered terms helpers
async function fetchRemembered() {
  const res = await chrome.runtime.sendMessage({ type: 'RIES_GET_REMEMBERED' });
  if (!res?.ok) throw new Error(res?.error || 'Failed to get remembered');
  return res.data || [];
}

async function rememberItem(english, chinese) {
  const res = await chrome.runtime.sendMessage({ type: 'RIES_REMEMBER_TERM', item: { english, chinese } });
  if (!res?.ok) throw new Error(res?.error || 'Failed to remember');
  return res.data || [];
}

async function forgetItem(english, chinese) {
  const res = await chrome.runtime.sendMessage({ type: 'RIES_FORGET_TERM', item: { english, chinese } });
  if (!res?.ok) throw new Error(res?.error || 'Failed to forget');
  return res.data || [];
}

function pairKey(e) { return `${(e.english||'').trim()}|||${(e.chinese||'').trim()}`; }
function mergeWithStatus(wordbook, remembered) {
  const remSet = new Set(remembered.map(pairKey));
  return wordbook.map(item => ({ ...item, remembered: remSet.has(pairKey(item)) }));
}

let cache = [];
let cacheR = [];

function renderTable(wordbook, remembered, keyword = '', status = 'all') {
  const tbody = document.getElementById('wb-tbody');
  const countEl = document.getElementById('count');
  const emptyEl = document.getElementById('empty');
  tbody.innerHTML = '';

  let merged = mergeWithStatus(wordbook, remembered);
  const q = (keyword || '').trim().toLowerCase();
  let data = merged;
  if (q) {
    data = data.filter(x =>
      (x.english || '').toLowerCase().includes(q) ||
      (x.chinese || '').toLowerCase().includes(q) ||
      (x.context || '').toLowerCase().includes(q)
    );
  }
  if (status === 'remembered') data = data.filter(x => x.remembered);
  if (status === 'unremembered') data = data.filter(x => !x.remembered);

  // 排序：未记住在前，已记住放下面；同组按时间降序
  data.sort((a, b) => {
    if (a.remembered !== b.remembered) return a.remembered ? 1 : -1;
    const at = a.addedAt ? new Date(a.addedAt).getTime() : 0;
    const bt = b.addedAt ? new Date(b.addedAt).getTime() : 0;
    return bt - at;
  });

  countEl.textContent = `${data.length} 项`;
  emptyEl.style.display = data.length ? 'none' : 'block';

  for (const item of data) {
    const tr = document.createElement('tr');
    if (item.remembered) tr.classList.add('remembered');
    tr.innerHTML = `
      <td><div class="en">${item.english}</div></td>
      <td><div class="cn">${item.chinese}</div></td>
      <td><div class="ctx">${item.context || ''}</div></td>
      <td>${formatDate(item.addedAt)}</td>
      <td>
        <div class="ops">
          <button class="op-btn op-toggle">${item.remembered ? '忘记' : '记住'}</button>
          <button class="op-btn op-del">删除</button>
        </div>
      </td>
    `;

    tr.querySelector('.op-del').addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        cache = await removeItem(item.id);
        renderTable(cache, cacheR, document.getElementById('search').value, document.getElementById('status-filter').value);
      } catch (err) {
        console.error(err); alert('删除失败');
      }
    });

    tr.querySelector('.op-toggle').addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        if (item.remembered) {
          cacheR = await forgetItem(item.english, item.chinese);
        } else {
          cacheR = await rememberItem(item.english, item.chinese);
        }
        renderTable(cache, cacheR, document.getElementById('search').value, document.getElementById('status-filter').value);
      } catch (err) {
        console.error(err); alert('操作失败');
      }
    });

    tbody.appendChild(tr);
  }
}

async function init() {
  const search = document.getElementById('search');
  const exportBtn = document.getElementById('export-btn');
  const clearBtn = document.getElementById('clear-btn');
  const statusFilter = document.getElementById('status-filter');

  try {
    cache = await fetchWordbook();
    cacheR = await fetchRemembered();
    renderTable(cache, cacheR);
  } catch (err) {
    console.error(err);
  }

  search.addEventListener('input', () => renderTable(cache, cacheR, search.value, statusFilter.value));
  statusFilter.addEventListener('change', () => renderTable(cache, cacheR, search.value, statusFilter.value));

  exportBtn.addEventListener('click', async () => {
    try { await exportCSV(); } catch { alert('导出失败'); }
  });
  clearBtn.addEventListener('click', async () => {
    if (!confirm('确定要清空单词本吗？此操作不可撤销。')) return;
    try {
      cache = await clearAll();
      renderTable(cache, cacheR, search.value, statusFilter.value);
    } catch { alert('清空失败'); }
  });
}

document.addEventListener('DOMContentLoaded', init);
