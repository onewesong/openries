import { getSettings, saveSettings } from './settings.js';

const displayToggle = document.getElementById('display-toggle');
const termCountInput = document.getElementById('popup-term-count');
const termDifficultySelect = document.getElementById('popup-term-difficulty');
const triggerKeySelect = document.getElementById('popup-trigger-key');
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

openOptionsLink.addEventListener('click', (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

hydrate().catch(() => {
  showStatus('加载设置失败，请检查控制台。', 0);
});
