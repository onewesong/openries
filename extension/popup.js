import { getSettings, saveSettings } from './settings.js';

const displayToggle = document.getElementById('display-toggle');
const termCountInput = document.getElementById('popup-term-count');
const termDifficultySelect = document.getElementById('popup-term-difficulty');
const triggerKeySelect = document.getElementById('popup-trigger-key');
const hotkeyShowTranslationsInput = document.getElementById('hotkey-show-translations');
const statusEl = document.getElementById('status');
const openOptionsLink = document.getElementById('open-options');
const modelMeta = document.getElementById('model-meta');

const allowedDifficulties = new Set(['basic', 'intermediate', 'advanced']);
let currentSettings = null;
let statusTimer = null;

function showStatus(message, timeout = 1800) {
  if (!statusEl) return;
  statusEl.textContent = message || '';
  if (statusTimer) {
    clearTimeout(statusTimer);
    statusTimer = null;
  }
  if (message && timeout > 0) {
    statusTimer = setTimeout(() => {
      statusEl.textContent = '';
      statusTimer = null;
    }, timeout);
  }
}

function clampTermCount(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 3;
  return Math.min(10, Math.max(1, parsed));
}

async function hydrate() {
  try {
    const settings = await getSettings();
    currentSettings = settings;
    displayToggle.checked = settings.showTranslations !== false;
    termCountInput.value = settings.termTargetCount;
    termDifficultySelect.value = allowedDifficulties.has(settings.termDifficulty)
      ? settings.termDifficulty
      : 'intermediate';
    triggerKeySelect.value = settings.triggerKey || 'ctrl';
    hotkeyShowTranslationsInput.value = settings.hotkeyShowTranslations || '';
    modelMeta.textContent = settings.model ? `模型 ${settings.model}` : '';
    showStatus('设置已同步', 1200);
  } catch (error) {
    console.error('Failed to load settings in popup', error);
    showStatus('加载设置失败，请稍后重试。', 0);
  }
}

async function persistSettings(partial, successMessage) {
  if (!currentSettings) {
    return;
  }
  try {
    const next = { ...currentSettings, ...partial };
    const saved = await saveSettings(next);
    currentSettings = saved;
    showStatus(successMessage || '已保存');
  } catch (error) {
    console.error('Failed to save settings from popup', error);
    showStatus('保存失败，请检查控制台。', 0);
  }
}

displayToggle.addEventListener('change', () => {
  const enabled = displayToggle.checked;
  persistSettings(
    { showTranslations: enabled },
    enabled ? '已切换为显示英文增强内容' : '已切换为仅显示原文'
  );
});

termCountInput.addEventListener('change', () => {
  const bounded = clampTermCount(termCountInput.value);
  termCountInput.value = bounded;
  persistSettings({ termTargetCount: bounded }, '术语数量已更新');
});

termDifficultySelect.addEventListener('change', () => {
  const value = allowedDifficulties.has(termDifficultySelect.value)
    ? termDifficultySelect.value
    : 'intermediate';
  termDifficultySelect.value = value;
  persistSettings({ termDifficulty: value }, '术语难度已更新');
});

triggerKeySelect.addEventListener('change', () => {
  const value = triggerKeySelect.value;
  persistSettings({ triggerKey: value }, '触发键已更新');
});

hotkeyShowTranslationsInput.addEventListener('change', () => {
  const value = hotkeyShowTranslationsInput.value.trim();
  persistSettings({ hotkeyShowTranslations: value }, '显示切换快捷键已保存');
});

async function loadWordbook() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'RIES_GET_WORDBOOK' });
    if (response?.ok) {
      renderWordbook(response.data);
    }
  } catch (error) {
    console.error('Failed to load wordbook', error);
  }
}

function relativeTime(iso) {
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

function renderWordbook(wordbook) {
  const listEl = document.getElementById('wordbook-list');
  if (!listEl) return;

  listEl.innerHTML = '';

  if (wordbook.length === 0) {
    listEl.innerHTML = '<p style="text-align: center; color: #64748b; font-size: 12px; padding: 16px 0;">单词本为空</p>';
    return;
  }

  wordbook.forEach(entry => {
    const itemEl = document.createElement('div');
    itemEl.className = 'wordbook-item';

    const dateStr = relativeTime(entry.addedAt);

    itemEl.innerHTML = `
      <div class="wordbook-item-en">${entry.english}</div>
      <div class="wordbook-item-cn">${entry.chinese}</div>
      ${entry.context ? `<div class="wordbook-item-context">${entry.context}</div>` : ''}
      <div class="wordbook-item-date">${dateStr}</div>
    `;

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '×';
    deleteBtn.style.cssText = `
      position: absolute;
      top: 6px;
      right: 6px;
      background: #334155;
      color: #f8fafc;
      border: none;
      border-radius: 4px;
      width: 20px;
      height: 20px;
      font-size: 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await removeWordbookItem(entry.id);
    });

    itemEl.appendChild(deleteBtn);
    listEl.appendChild(itemEl);
  });
}

async function removeWordbookItem(id) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'RIES_REMOVE_FROM_WORDBOOK',
      id
    });
    if (response?.ok) {
      renderWordbook(response.data);
      showStatus('已从单词本中删除', 1500);
    }
  } catch (error) {
    console.error('Failed to remove wordbook item', error);
    showStatus('删除失败', 0);
  }
}

async function exportWordbook() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'RIES_EXPORT_WORDBOOK' });
    if (response?.ok) {
      const data = response.data;
      const csv = [
        ['英文', '中文', '上下文', '添加时间'],
        ...data.map(item => [
          item['英文'],
          item['中文'],
          item['上下文'],
          item['添加时间']
        ])
      ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ries-wordbook-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showStatus('单词本已导出', 2000);
    }
  } catch (error) {
    console.error('Failed to export wordbook', error);
    showStatus('导出失败', 0);
  }
}

async function clearWordbook() {
  if (!confirm('确定要清空单词本吗？此操作不可撤销。')) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({ type: 'RIES_CLEAR_WORDBOOK' });
    if (response?.ok) {
      renderWordbook([]);
      showStatus('单词本已清空', 2000);
    }
  } catch (error) {
    console.error('Failed to clear wordbook', error);
    showStatus('清空失败', 0);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const exportBtn = document.getElementById('export-wordbook');
  const clearBtn = document.getElementById('clear-wordbook');
  const openPageBtn = document.getElementById('open-wordbook-page');

  if (exportBtn) {
    exportBtn.addEventListener('click', exportWordbook);
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', clearWordbook);
  }

  if (openPageBtn) {
    openPageBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const url = chrome.runtime.getURL('wordbook.html');
      if (chrome.tabs?.create) {
        chrome.tabs.create({ url });
      } else {
        window.open(url, '_blank');
      }
    });
  }
});

openOptionsLink.addEventListener('click', (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

hydrate().catch(() => {
  showStatus('加载设置失败，请检查控制台。', 0);
});

loadWordbook();
