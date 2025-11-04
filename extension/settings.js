const STORAGE_KEY = 'ries-translator-settings';

const DEFAULT_SETTINGS = {
  apiBaseUrl: 'https://api.openai.com',
  apiPath: '/v1/chat/completions',
  apiKey: '',
  model: 'gpt-4o-mini',
  temperature: 0.2,
  termTargetCount: 3,
  termDifficulty: 'intermediate',
  showTranslations: true,
  triggerKey: 'ctrl'
};

export async function getSettings() {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored?.[STORAGE_KEY] || {}) };
}

export async function saveSettings(newSettings) {
  const settings = { ...DEFAULT_SETTINGS, ...newSettings };
  await chrome.storage.sync.set({ [STORAGE_KEY]: settings });
  return settings;
}

export function maskKey(key) {
  if (!key) return '';
  if (key.length <= 6) return '*'.repeat(key.length);
  return `${key.slice(0, 3)}${'*'.repeat(key.length - 6)}${key.slice(-3)}`;
}
