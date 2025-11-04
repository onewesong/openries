import { translateWithReplacements } from './translator.js';
import {
  getSettings,
  addToWordbook,
  getWordbook,
  removeFromWordbook,
  clearWordbook,
  exportWordbook
} from './settings.js';

const CONTEXT_MENU_ID = 'ries-translate-selection';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Translate selection with Ries glossary',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !info.selectionText || !tab?.id) {
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: 'RIES_TRANSLATION_STARTED' });

  try {
    const settings = await getSettings();
    const response = await translateWithReplacements(info.selectionText, settings);

    chrome.tabs.sendMessage(tab.id, {
      type: 'RIES_TRANSLATION_RESULT',
      payload: {
        sourceText: info.selectionText,
        translationHtml: response.translationHtml,
        rawTranslation: response.translation,
        replacements: response.replacements
      }
    });
  } catch (error) {
    console.error('Translation failed', error);
    chrome.tabs.sendMessage(tab.id, {
      type: 'RIES_TRANSLATION_ERROR',
      payload: {
        message: error.message || 'Translation failed. Please check the background console.'
      }
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'RIES_TRANSLATE_TEXT') {
    (async () => {
      try {
        const settings = await getSettings();
        const response = await translateWithReplacements(message.text, settings);
        sendResponse({ ok: true, data: response });
      } catch (error) {
        console.error('Translation via popup failed', error);
        sendResponse({ ok: false, error: error.message || 'Translation failed' });
      }
    })();
    return true; // Keep channel open for async response.
  }

  if (message?.type === 'RIES_ADD_TO_WORDBOOK') {
    (async () => {
      try {
        const wordbook = await addToWordbook(message.data);
        sendResponse({ ok: true, data: wordbook });
      } catch (error) {
        console.error('Add to wordbook failed', error);
        sendResponse({ ok: false, error: error.message || 'Failed to add to wordbook' });
      }
    })();
    return true;
  }

  if (message?.type === 'RIES_GET_WORDBOOK') {
    (async () => {
      try {
        const wordbook = await getWordbook();
        sendResponse({ ok: true, data: wordbook });
      } catch (error) {
        console.error('Get wordbook failed', error);
        sendResponse({ ok: false, error: error.message || 'Failed to get wordbook' });
      }
    })();
    return true;
  }

  if (message?.type === 'RIES_REMOVE_FROM_WORDBOOK') {
    (async () => {
      try {
        const wordbook = await removeFromWordbook(message.id);
        sendResponse({ ok: true, data: wordbook });
      } catch (error) {
        console.error('Remove from wordbook failed', error);
        sendResponse({ ok: false, error: error.message || 'Failed to remove from wordbook' });
      }
    })();
    return true;
  }

  if (message?.type === 'RIES_CLEAR_WORDBOOK') {
    (async () => {
      try {
        const wordbook = await clearWordbook();
        sendResponse({ ok: true, data: wordbook });
      } catch (error) {
        console.error('Clear wordbook failed', error);
        sendResponse({ ok: false, error: error.message || 'Failed to clear wordbook' });
      }
    })();
    return true;
  }

  if (message?.type === 'RIES_EXPORT_WORDBOOK') {
    (async () => {
      try {
        const exported = await exportWordbook();
        sendResponse({ ok: true, data: exported });
      } catch (error) {
        console.error('Export wordbook failed', error);
        sendResponse({ ok: false, error: error.message || 'Failed to export wordbook' });
      }
    })();
    return true;
  }

  return false;
});
