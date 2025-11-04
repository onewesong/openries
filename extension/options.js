import { getSettings, saveSettings, maskKey } from './settings.js';

const form = document.getElementById('settings-form');
const apiBaseInput = document.getElementById('api-base');
const apiPathInput = document.getElementById('api-path');
const apiKeyInput = document.getElementById('api-key');
const modelInput = document.getElementById('model');
const temperatureInput = document.getElementById('temperature');
const status = document.getElementById('status');
const translateSelectionBtn = document.getElementById('translate-selection');

let originalSettings = null;

async function testApi(settings) {
  const url = `${settings.apiBaseUrl.replace(/\/$/, '')}${settings.apiPath}`;
  const body = {
    model: settings.model,
    temperature: 0,
    max_tokens: 1,
    messages: [
      { role: 'system', content: 'You are a connectivity tester.' },
      { role: 'user', content: 'ping' }
    ]
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`API responded ${response.status}: ${text?.slice(0, 200) || 'Unknown error'}`);
  }

  const data = await response.json().catch(() => ({}));
  if (!data || !Array.isArray(data.choices)) {
    throw new Error('Unexpected API response shape');
  }

  return true;
}

async function hydrate() {
  const settings = await getSettings();
  originalSettings = settings;
  apiBaseInput.value = settings.apiBaseUrl;
  apiPathInput.value = settings.apiPath;
  apiKeyInput.value = settings.apiKey;
  modelInput.value = settings.model;
  temperatureInput.value = settings.temperature;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  status.textContent = 'Saving…';

  try {
    const latestSettings = await getSettings();
    const settings = await saveSettings({
      apiBaseUrl: apiBaseInput.value.trim(),
      apiPath: apiPathInput.value.trim() || '/v1/chat/completions',
      apiKey: apiKeyInput.value.trim(),
      model: modelInput.value.trim(),
      temperature: Number.parseFloat(temperatureInput.value) || 0.2,
      termTargetCount: latestSettings.termTargetCount,
      termDifficulty: latestSettings.termDifficulty,
      showTranslations: latestSettings.showTranslations,
      triggerKey: latestSettings.triggerKey
    });

    // Saved message
    status.textContent = `Saved. Using ${settings.model} · Key ${maskKey(settings.apiKey)}`;

    // If API key changed (or was newly set), trigger a quick connectivity test
    const keyChanged = !originalSettings || originalSettings.apiKey !== settings.apiKey;
    if (settings.apiKey && keyChanged) {
      status.textContent = `Saved. Testing API… Using ${settings.model} · Key ${maskKey(settings.apiKey)}`;
      try {
        await testApi(settings);
        status.textContent = `Saved. API test passed ✅ · Using ${settings.model} · Key ${maskKey(settings.apiKey)}`;
      } catch (e) {
        console.error('API test failed:', e);
        status.textContent = `Saved, but API test failed: ${e.message || e}`;
      }
    }
    // Update in-memory baseline after save
    originalSettings = settings;
  } catch (error) {
    console.error(error);
    status.textContent = 'Failed to save settings.';
  }
});

hydrate().catch((error) => {
  console.error('Failed to load settings', error);
  status.textContent = 'Failed to load settings. Check the console.';
});

// -------- Translate selection on current tab and show overlay --------

function queryPreferredTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      // Prefer active http(s) tab; otherwise pick the first http(s) tab
      const isHttp = (url) => typeof url === 'string' && /^https?:\/\//.test(url);
      const activeHttp = tabs.find((t) => t.active && isHttp(t.url));
      if (activeHttp) return resolve(activeHttp);
      const anyHttp = tabs.find((t) => isHttp(t.url));
      resolve(anyHttp || tabs[0]);
    });
  });
}

function executeOnTab(tabId, func) {
  return new Promise((resolve, reject) => {
    try {
      chrome.scripting.executeScript({ target: { tabId }, func }, (results) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(results);
      });
    } catch (e) {
      reject(e);
    }
  });
}

function sendToTab(tabId, message) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, message, () => resolve());
    } catch (_) {
      resolve();
    }
  });
}

function requestTranslation(text) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'RIES_TRANSLATE_TEXT', text }, (response) => {
      if (!response) {
        reject(new Error('No response from background script.'));
      } else if (!response.ok) {
        reject(new Error(response.error || 'Translation failed.'));
      } else {
        resolve(response.data);
      }
    });
  });
}

async function handleTranslateSelection() {
  try {
    status.textContent = 'Reading selection from current tab…';
    const tab = await queryPreferredTab();
    if (!tab?.id) {
      status.textContent = 'No active tab found.';
      return;
    }

    const results = await executeOnTab(tab.id, () => (window.getSelection()?.toString() || '').trim());
    const selectedText = (results && results[0] && results[0].result) ? String(results[0].result) : '';

    if (!selectedText) {
      status.textContent = '请先在当前页选中文本，然后再点击翻译。';
      return;
    }

    await sendToTab(tab.id, { type: 'RIES_TRANSLATION_STARTED' });
    status.textContent = 'Translating selection…';

    try {
      const data = await requestTranslation(selectedText);
      await sendToTab(tab.id, {
        type: 'RIES_TRANSLATION_RESULT',
        payload: {
          sourceText: selectedText,
          translationHtml: data.translationHtml,
          rawTranslation: data.translation,
          replacements: data.replacements || []
        }
      });
      status.textContent = '翻译结果已显示在当前页右下角。';
    } catch (e) {
      await sendToTab(tab.id, {
        type: 'RIES_TRANSLATION_ERROR',
        payload: { message: e.message || 'Translation failed.' }
      });
      status.textContent = `翻译失败：${e.message || e}`;
    }
  } catch (err) {
    console.error('Translate selection flow failed', err);
    status.textContent = `操作失败：${err.message || err}`;
  }
}

if (translateSelectionBtn) {
  translateSelectionBtn.addEventListener('click', handleTranslateSelection);
}
