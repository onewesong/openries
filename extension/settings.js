const STORAGE_KEY = 'ries-translator-settings';
const WORDBOOK_KEY = 'ries-wordbook';

const DEFAULT_SETTINGS = {
  apiBaseUrl: 'https://api.openai.com',
  apiPath: '/v1/chat/completions',
  apiKey: '',
  model: 'gpt-4o-mini',
  temperature: 0.2,
  termTargetCount: 3,
  termDifficulty: 'intermediate',
  showTranslations: true,
  triggerKey: 'ctrl',
  hotkeyShowTranslations: ''
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

export async function getWordbook() {
  const stored = await chrome.storage.sync.get(WORDBOOK_KEY);
  return stored?.[WORDBOOK_KEY] || [];
}

export async function addToWordbook(item) {
  const wordbook = await getWordbook();
  const exists = wordbook.find(entry => entry.chinese === item.chinese && entry.english === item.english);
  if (exists) {
    return wordbook;
  }
  const newEntry = {
    ...item,
    id: Date.now().toString(),
    addedAt: new Date().toISOString()
  };
  wordbook.push(newEntry);
  await chrome.storage.sync.set({ [WORDBOOK_KEY]: wordbook });
  return wordbook;
}

export async function removeFromWordbook(id) {
  const wordbook = await getWordbook();
  const newWordbook = wordbook.filter(entry => entry.id !== id);
  await chrome.storage.sync.set({ [WORDBOOK_KEY]: newWordbook });
  return newWordbook;
}

export async function clearWordbook() {
  await chrome.storage.sync.set({ [WORDBOOK_KEY]: [] });
  return [];
}

export async function exportWordbook() {
  const wordbook = await getWordbook();
  return wordbook.map(entry => ({
    英文: entry.english,
    中文: entry.chinese,
    上下文: entry.context || '',
    添加时间: entry.addedAt
  }));
}
