(function () {
  const OVERLAY_ID = 'ries-translation-overlay';
  const ICON_ID = 'ries-selection-icon';
  const TOOLTIP_ID = 'ries-selection-tooltip';
  const INLINE_CLASS = 'ries-inline-translation';
  const INLINE_LOADING_CLASS = 'ries-inline-loading';
  const INLINE_MAX_LENGTH = 400;
  const SETTINGS_KEY = 'ries-translator-settings';

  const ENABLE_SELECTION_ICON = false;

  const DEFAULT_SETTINGS = {
    showTranslations: true,
    termTargetCount: 3,
    termDifficulty: 'intermediate',
    model: 'gpt-4o-mini',
    apiKey: '',
    apiBaseUrl: 'https://api.openai.com',
    apiPath: '/v1/chat/completions',
    temperature: 0.2,
    triggerKey: 'ctrl',
    hotkeyShowTranslations: ''
  };

  let floatingIcon = null;
  let floatingTooltip = null;
  let hideTooltipTimer = null;
  let currentSelectionText = '';
  let activeRequest = null;
  let iconHovered = false;
  const translationCache = new Map();
  const pendingTranslations = new Map();
  const autoInlines = new Set();
  let autoGeneration = 0;
  let autoAppliedOnce = false;

  let currentSettings = { ...DEFAULT_SETTINGS };
  let displayTranslations = true;
  let cacheKeyPrefix = computeCacheKeyPrefix(currentSettings);

  let triggerActive = false;
  let currentInline = null;
  let pendingTriggerEvent = null;
  let triggerHoverRAF = null;
  let wordbookPopover = null;
  let wordbookPopoverTarget = null;

  function ensureStyles() {
    if (document.getElementById('ries-translation-style')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'ries-translation-style';
    style.textContent = `
      #${OVERLAY_ID} {
        position: fixed;
        bottom: 24px;
        right: 24px;
        max-width: min(480px, calc(100vw - 48px));
        background: #101828;
        color: #f8fafc;
        padding: 16px 20px;
        border-radius: 12px;
        box-shadow: 0 12px 32px rgba(15, 23, 42, 0.35);
        font-family: 'Inter', 'SF Pro Display', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        line-height: 1.5;
        z-index: 2147483647;
      }

      #${OVERLAY_ID} strong {
        font-size: 14px;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        color: #9bb5ff;
      }

      #${OVERLAY_ID} .ries-body {
        margin-top: 8px;
        font-size: 15px;
        color: #f1f5f9;
      }

      #${OVERLAY_ID} .ries-meta {
        margin-top: 12px;
        font-size: 13px;
        color: #cbd5f5;
        display: flex;
        justify-content: space-between;
        gap: 16px;
      }

      #${OVERLAY_ID} .ries-close {
        position: absolute;
        top: 8px;
        right: 10px;
        background: transparent;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        font-size: 18px;
      }

      #${OVERLAY_ID} .ries-close:hover {
        color: #f1f5f9;
      }

      #${OVERLAY_ID} .ries-annotated {
        text-decoration: underline;
        text-decoration-style: dashed;
        text-decoration-thickness: 2px;
        text-decoration-color: rgba(148, 163, 184, 0.7);
        color: #fefefe;
        font-weight: 600;
        padding-bottom: 1px;
      }

      #${OVERLAY_ID}.ries-loading::after {
        content: 'Thinking…';
        display: block;
        color: #e2e8f0;
        font-style: italic;
        margin-top: 8px;
      }

      #${ICON_ID} {
        position: absolute;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: linear-gradient(135deg, #4c6ef5, #82aaff);
        color: #f8fafc;
        display: none;
        align-items: center;
        justify-content: center;
        box-shadow: 0 8px 18px rgba(15, 23, 42, 0.3);
        cursor: pointer;
        z-index: 2147483647;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
        font-family: 'Inter', 'SF Pro Display', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-weight: 600;
        font-size: 16px;
      }

      #${ICON_ID}:hover {
        transform: scale(1.05);
        box-shadow: 0 10px 24px rgba(30, 64, 175, 0.35);
      }

      #${TOOLTIP_ID} {
        position: absolute;
        max-width: min(360px, calc(100vw - 32px));
        background: #0f172a;
        color: #e2e8f0;
        border-radius: 12px;
        padding: 14px 16px;
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.45);
        font-size: 14px;
        line-height: 1.5;
        display: none;
        z-index: 2147483647;
        border: 1px solid rgba(148, 163, 184, 0.18);
      }

      #${TOOLTIP_ID} strong {
        color: #cbd5f5;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        font-size: 12px;
        display: block;
        margin-bottom: 6px;
      }

      #${TOOLTIP_ID} .ries-annotated {
        text-decoration: underline;
        text-decoration-style: dashed;
        text-decoration-color: rgba(148, 163, 184, 0.55);
        font-weight: 600;
      }

      #${TOOLTIP_ID} .ries-tooltip-body {
        margin-top: 6px;
        color: #e2e8f0;
        word-break: break-word;
      }

      #${TOOLTIP_ID} .ries-tooltip-terms {
        margin-top: 10px;
        font-size: 12px;
        color: #94a3b8;
        display: grid;
        gap: 4px;
      }

      #${TOOLTIP_ID} .ries-tooltip-terms span {
        display: block;
      }

      #${TOOLTIP_ID}.ries-loading::after {
        content: 'Translating...';
        display: block;
        color: #94a3b8;
        font-style: italic;
        margin-top: 6px;
      }

      .${INLINE_CLASS} {
        display: inline;
        color: inherit;
        transition: background 0.2s ease, color 0.2s ease;
      }

      .${INLINE_CLASS}.${INLINE_LOADING_CLASS} {
        animation: ries-inline-blink 1s ease-in-out infinite;
        background: rgba(76, 110, 245, 0.18);
        color: inherit;
      }

      .${INLINE_CLASS} .ries-annotated {
        text-decoration: underline;
        text-decoration-style: dashed;
        text-decoration-color: rgba(148, 163, 184, 0.55);
        font-weight: 600;
        cursor: pointer;
        position: relative;
      }

      .${INLINE_CLASS} .ries-annotated:hover {
        text-decoration-color: rgba(148, 163, 184, 0.85);
      }

      .${INLINE_CLASS} .ries-annotated.ries-bookmarked {
        text-decoration-color: #10b981;
        text-decoration-thickness: 2px;
      }

      .${INLINE_CLASS} .ries-annotated.ries-bookmarked::after {
        content: '🔖';
        position: absolute;
        top: -8px;
        right: -8px;
        font-size: 10px;
        opacity: 0.8;
      }

      @keyframes ries-inline-blink {
        0% {
          background: rgba(76, 110, 245, 0.18);
        }
        50% {
          background: rgba(148, 163, 184, 0.22);
        }
        100% {
          background: rgba(76, 110, 245, 0.18);
        }
      }
    `;

    document.head.appendChild(style);
  }

  function computeCacheKeyPrefix(settings) {
    const count = Number.isFinite(Number.parseInt(settings?.termTargetCount, 10))
      ? Number.parseInt(settings.termTargetCount, 10)
      : 3;
    const difficulty = typeof settings?.termDifficulty === 'string' ? settings.termDifficulty : 'intermediate';
    const model = settings?.model || '';
    const temperature = Number.isFinite(Number(settings?.temperature)) ? Number(settings.temperature).toFixed(2) : '0.20';
    const baseUrl = settings?.apiBaseUrl || '';
    const apiPath = settings?.apiPath || '';
    return `${count}|${difficulty}|${model}|${temperature}|${baseUrl}|${apiPath}`;
  }

  function getNamespacedKey(key) {
    return `${cacheKeyPrefix}::${key}`;
  }

  function applySettings(rawSettings) {
    const merged = { ...DEFAULT_SETTINGS, ...(rawSettings || {}) };
    const previousDisplay = displayTranslations;
    const previousCacheKey = cacheKeyPrefix;

    currentSettings = merged;
    displayTranslations = merged.showTranslations !== false;
    cacheKeyPrefix = computeCacheKeyPrefix(merged);

    const cacheChanged = cacheKeyPrefix !== previousCacheKey;
    if (cacheChanged) {
      translationCache.clear();
      pendingTranslations.clear();
    }

    const hasApiKey = Boolean(merged.apiKey);

    if (!displayTranslations || !hasApiKey) {
      clearCurrentInline({ revert: true });
      revertAutoTranslations();
      revertInlineSpans();
      removeOverlay();
      autoAppliedOnce = false;
      return;
    }

    if (cacheChanged) {
      revertInlineSpans();
    }

    if (!previousDisplay || cacheChanged || !autoAppliedOnce) {
      applyAutoTranslations();
      autoAppliedOnce = true;
    }
  }

  function hydrateSettings() {
    try {
      chrome.storage.sync.get(SETTINGS_KEY, (items) => {
        if (chrome.runtime.lastError) {
          console.warn('Failed to read Ries settings', chrome.runtime.lastError);
          return;
        }
        applySettings(items?.[SETTINGS_KEY]);
      });
    } catch (error) {
      console.warn('Failed to hydrate Ries settings', error);
    }
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync' || !changes[SETTINGS_KEY]) {
      return;
    }
    applySettings(changes[SETTINGS_KEY].newValue);
  });

  function isWithinWidget(node) {
    let current = node;
    while (current) {
      if (current.nodeType === Node.ELEMENT_NODE) {
        if (
          current.id === ICON_ID ||
          current.id === TOOLTIP_ID ||
          current.id === OVERLAY_ID ||
          current.classList?.contains(INLINE_CLASS)
        ) {
          return true;
        }
      }
      current = current.parentNode;
    }
    return false;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function isTriggerKeyPressed(settings) {
    const triggerKey = settings?.triggerKey || 'ctrl';
    if (triggerKey === 'none') {
      return false;
    }
    switch (triggerKey) {
      case 'ctrl':
        return event.ctrlKey;
      case 'alt':
        return event.altKey;
      case 'shift':
        return event.shiftKey;
      case 'meta':
        return event.metaKey;
      default:
        return event.ctrlKey;
    }
  }

  function shouldProcessTriggerKey(event) {
    const triggerKey = currentSettings?.triggerKey || 'ctrl';
    if (triggerKey === 'none') {
      return false;
    }
    switch (triggerKey) {
      case 'ctrl':
        return event.key === 'Control';
      case 'alt':
        return event.key === 'Alt';
      case 'shift':
        return event.key === 'Shift';
      case 'meta':
        return event.key === 'Meta';
      default:
        return event.key === 'Control';
    }
  }

  function parseHotkey(hotkeyString) {
    if (!hotkeyString || typeof hotkeyString !== 'string') {
      return null;
    }

    const parts = hotkeyString.toLowerCase().split('+').map(p => p.trim());
    const modifiers = new Set();
    let key = '';

    for (const part of parts) {
      if (part === 'ctrl' || part === 'control') {
        modifiers.add('ctrl');
      } else if (part === 'alt' || part === 'option') {
        modifiers.add('alt');
      } else if (part === 'shift') {
        modifiers.add('shift');
      } else if (part === 'meta' || part === 'cmd' || part === 'command' || part === '⌘') {
        modifiers.add('meta');
      } else if (part) {
        key = part;
      }
    }

    if (!key) {
      return null;
    }

    return { modifiers, key };
  }

  function matchesHotkey(event, hotkey) {
    if (!hotkey) {
      return false;
    }

    const { modifiers, key } = hotkey;

    if (event.ctrlKey && !modifiers.has('ctrl')) {
      return false;
    }
    if (!event.ctrlKey && modifiers.has('ctrl')) {
      return false;
    }

    if (event.altKey && !modifiers.has('alt')) {
      return false;
    }
    if (!event.altKey && modifiers.has('alt')) {
      return false;
    }

    if (event.shiftKey && !modifiers.has('shift')) {
      return false;
    }
    if (!event.shiftKey && modifiers.has('shift')) {
      return false;
    }

    if (event.metaKey && !modifiers.has('meta')) {
      return false;
    }
    if (!event.metaKey && modifiers.has('meta')) {
      return false;
    }

    const eventKey = event.key.toLowerCase();
    if (eventKey !== key) {
      return false;
    }

    return true;
  }

  function handleGlobalHotkey(event) {
    const hotkeyString = currentSettings?.hotkeyShowTranslations;
    if (!hotkeyString) {
      return;
    }

    const hotkey = parseHotkey(hotkeyString);
    if (!hotkey) {
      return;
    }

    if (matchesHotkey(event, hotkey)) {
      event.preventDefault();

      const newShowTranslations = !displayTranslations;
      chrome.storage.sync.set({
        [SETTINGS_KEY]: {
          ...currentSettings,
          showTranslations: newShowTranslations
        }
      });
    }
  }

  function handleWordbookClick(event) {
    const target = event.target;

    if (target.classList.contains('ries-annotated')) {
      const inlineSpan = target.closest(`.${INLINE_CLASS}`);

      // 从点击文本中解析 英文(中文)
      const raw = (target.textContent || '').trim();
      let english = raw;
      let chineseBracket = '';
      const m = raw.match(/^(.*?)\s*\((.*?)\)$/);
      if (m) {
        english = (m[1] || '').trim();
        chineseBracket = (m[2] || '').trim();
      }

      // 从内联翻译数据中查找匹配项
      const inlineData = inlineSpan?.translationData;
      let chinese = '';
      if (inlineData?.replacements && Array.isArray(inlineData.replacements)) {
        const found = inlineData.replacements.find(r => (r?.english || '').trim() === english);
        if (found?.chinese) {
          chinese = String(found.chinese).trim();
        }
      }
      if (!chinese) {
        chinese = chineseBracket; // 兜底使用括号内文本
      }

      const context = inlineSpan ? getContextFromInline(inlineSpan) : '';

      if (english) {
        showWordbookPopover(english, chinese, context, inlineSpan || null, target);
      }
    }
  }

  function removeWordbookPopover() {
    if (wordbookPopover && wordbookPopover.isConnected) {
      wordbookPopover.remove();
    }
    wordbookPopover = null;
    wordbookPopoverTarget = null;
    const style = document.getElementById('ries-wordbook-popover-style');
    if (style) style.remove();
  }

  function positionWordbookPopover() {
    if (!wordbookPopover || !wordbookPopoverTarget) return;
    const rect = wordbookPopoverTarget.getBoundingClientRect();
    const pop = wordbookPopover;
    const margin = 6;
    const maxWidth = Math.min(360, window.innerWidth - 20);
    pop.style.maxWidth = `${maxWidth}px`;
    const top = Math.max(8, rect.top + window.scrollY - pop.offsetHeight - margin);
    let left = rect.left + window.scrollX + (rect.width / 2) - (pop.offsetWidth / 2);
    left = Math.max(8, Math.min(left, window.scrollX + window.innerWidth - pop.offsetWidth - 8));
    pop.style.top = `${top}px`;
    pop.style.left = `${left}px`;
  }

  function showWordbookPopover(english, chinese, context, inlineSpan, targetEl) {
    removeWordbookPopover();

    const style = document.createElement('style');
    style.id = 'ries-wordbook-popover-style';
    style.textContent = `
      #ries-wordbook-popover {
        position: absolute;
        z-index: 2147483647;
        background: #0f172a;
        color: #e2e8f0;
        border: 1px solid rgba(148,163,184,0.18);
        box-shadow: 0 12px 28px rgba(15, 23, 42, 0.45);
        border-radius: 10px;
        padding: 12px 14px;
        font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      #ries-wordbook-popover .wb-en { font-weight: 700; font-size: 14px; color: #f8fafc; }
      #ries-wordbook-popover .wb-cn { margin-top: 4px; font-size: 13px; color: #cbd5f5; }
      #ries-wordbook-popover .wb-ctx { margin-top: 6px; font-size: 12px; color: #94a3b8; max-width: 320px; word-break: break-word; }
      #ries-wordbook-popover .wb-actions { margin-top: 10px; display: flex; gap: 8px; justify-content: flex-end; }
      #ries-wordbook-popover .wb-btn { cursor: pointer; border: none; border-radius: 8px; padding: 8px 12px; font-size: 12px; font-weight: 600; }
      #ries-wordbook-popover .wb-btn.add { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; }
      #ries-wordbook-popover .wb-btn.add.bookmarked { background: linear-gradient(135deg, #10b981, #059669); }
      #ries-wordbook-popover .wb-btn.close { background: #334155; color: #f8fafc; }
    `;
    document.head.appendChild(style);

    const pop = document.createElement('div');
    pop.id = 'ries-wordbook-popover';
    pop.innerHTML = `
      <div class="wb-en">${escapeHtml(english)}</div>
      ${chinese ? `<div class="wb-cn">${escapeHtml(chinese)}</div>` : ''}
      ${context ? `<div class="wb-ctx">${escapeHtml(context)}</div>` : ''}
      <div class="wb-actions">
        <button class="wb-btn add" id="ries-wb-pop-add">+ 添加到生词本</button>
        <button class="wb-btn close" id="ries-wb-pop-close">关闭</button>
      </div>
    `;
    document.body.appendChild(pop);

    wordbookPopover = pop;
    wordbookPopoverTarget = targetEl;

    const close = () => removeWordbookPopover();
    pop.querySelector('#ries-wb-pop-close').addEventListener('click', close);

    // 初始化书签状态
    const addBtn = pop.querySelector('#ries-wb-pop-add');
    let isBookmarked = false;
    chrome.runtime.sendMessage({ type: 'RIES_GET_WORDBOOK' }, (response) => {
      if (response?.ok) {
        const exists = response.data.find(entry => entry.english === english && entry.chinese === chinese);
        if (exists) {
          isBookmarked = true;
          addBtn.textContent = '− 移出生词本';
          addBtn.classList.add('bookmarked');
        }
      }
    });

    addBtn.addEventListener('click', () => {
      if (isBookmarked) {
        chrome.runtime.sendMessage({ type: 'RIES_GET_WORDBOOK' }, (response) => {
          if (response?.ok) {
            const exists = response.data.find(entry => entry.english === english && entry.chinese === chinese);
            if (exists) {
              chrome.runtime.sendMessage({ type: 'RIES_REMOVE_FROM_WORDBOOK', id: exists.id }, (removeResponse) => {
                if (removeResponse?.ok) {
                  isBookmarked = false;
                  addBtn.textContent = '+ 添加到生词本';
                  addBtn.classList.remove('bookmarked');
                  if (inlineSpan && inlineSpan.classList) {
                    inlineSpan.classList.remove('ries-bookmarked');
                  }
                }
              });
            }
          }
        });
      } else {
        chrome.runtime.sendMessage({
          type: 'RIES_ADD_TO_WORDBOOK',
          data: { english, chinese, context }
        }, (addResponse) => {
          if (addResponse?.ok) {
            isBookmarked = true;
            addBtn.textContent = '− 移出生词本';
            addBtn.classList.add('bookmarked');
            if (inlineSpan && inlineSpan.classList) {
              inlineSpan.classList.add('ries-bookmarked');
            }
          }
        });
      }
    });

    // 放到文档后才能正确测量尺寸
    requestAnimationFrame(() => positionWordbookPopover());
  }

  function showWordbookModal(english, chinese, context, inlineSpan) {
    const modal = document.createElement('div');
    modal.id = 'ries-wordbook-modal';
    modal.innerHTML = `
      <div class="modal-overlay"></div>
      <div class="modal-content">
        <div class="modal-header">
          <h3>词汇详情</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="wordbook-word-en">${escapeHtml(english)}</div>
          <div class="wordbook-word-cn">${escapeHtml(chinese)}</div>
          ${context ? `<div class="wordbook-context">${escapeHtml(context)}</div>` : ''}
        </div>
        <div class="modal-footer">
          <button id="ries-bookmark-btn" class="bookmark-btn">+ 添加到生词本</button>
          <button id="ries-cancel-btn" class="cancel-btn">关闭</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const style = document.createElement('style');
    style.textContent = `
      #ries-wordbook-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      #ries-wordbook-modal .modal-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.6);
      }

      #ries-wordbook-modal .modal-content {
        position: relative;
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 12px;
        width: 90%;
        max-width: 400px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      }

      #ries-wordbook-modal .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid #334155;
      }

      #ries-wordbook-modal .modal-header h3 {
        margin: 0;
        font-size: 16px;
        color: #f8fafc;
      }

      #ries-wordbook-modal .modal-close {
        background: none;
        border: none;
        color: #94a3b8;
        font-size: 28px;
        cursor: pointer;
        padding: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
      }

      #ries-wordbook-modal .modal-close:hover {
        background: #334155;
        color: #f8fafc;
      }

      #ries-wordbook-modal .modal-body {
        padding: 20px;
      }

      #ries-wordbook-modal .wordbook-word-en {
        font-size: 18px;
        font-weight: 600;
        color: #f8fafc;
        margin-bottom: 8px;
      }

      #ries-wordbook-modal .wordbook-word-cn {
        font-size: 15px;
        color: #cbd5f5;
        margin-bottom: 12px;
      }

      #ries-wordbook-modal .wordbook-context {
        font-size: 13px;
        color: #94a3b8;
        font-style: italic;
        line-height: 1.5;
        padding: 12px;
        background: #0f172a;
        border-radius: 8px;
      }

      #ries-wordbook-modal .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 16px 20px;
        border-top: 1px solid #334155;
      }

      #ries-wordbook-modal .bookmark-btn {
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        color: white;
        border: none;
        border-radius: 8px;
        padding: 10px 20px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      #ries-wordbook-modal .bookmark-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
      }

      #ries-wordbook-modal .bookmark-btn.bookmarked {
        background: linear-gradient(135deg, #10b981, #059669);
      }

      #ries-wordbook-modal .bookmark-btn.bookmarked:hover {
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
      }

      #ries-wordbook-modal .cancel-btn {
        background: #334155;
        color: #f8fafc;
        border: none;
        border-radius: 8px;
        padding: 10px 20px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      #ries-wordbook-modal .cancel-btn:hover {
        background: #475569;
      }
    `;
    document.head.appendChild(style);

    const closeModal = () => {
      modal.remove();
      style.remove();
    };

    modal.querySelector('.modal-close').addEventListener('click', closeModal);
    modal.querySelector('.modal-overlay').addEventListener('click', closeModal);
    modal.querySelector('#ries-cancel-btn').addEventListener('click', closeModal);

    const bookmarkBtn = modal.querySelector('#ries-bookmark-btn');
    let isBookmarked = false;

    chrome.runtime.sendMessage({ type: 'RIES_GET_WORDBOOK' }, (response) => {
      if (response?.ok) {
        const exists = response.data.find(entry => entry.english === english && entry.chinese === chinese);
        if (exists) {
          isBookmarked = true;
          bookmarkBtn.textContent = '− 移出生词本';
          bookmarkBtn.classList.add('bookmarked');
        }
      }
    });

    bookmarkBtn.addEventListener('click', () => {
      if (isBookmarked) {
        chrome.runtime.sendMessage({ type: 'RIES_GET_WORDBOOK' }, (response) => {
          if (response?.ok) {
            const exists = response.data.find(entry => entry.english === english && entry.chinese === chinese);
            if (exists) {
              chrome.runtime.sendMessage({
                type: 'RIES_REMOVE_FROM_WORDBOOK',
                id: exists.id
              }, (removeResponse) => {
                if (removeResponse?.ok) {
                  isBookmarked = false;
                  bookmarkBtn.textContent = '+ 添加到生词本';
                  bookmarkBtn.classList.remove('bookmarked');
                  if (inlineSpan && inlineSpan.classList) {
                    inlineSpan.classList.remove('ries-bookmarked');
                  }
                }
              });
            }
          }
        });
      } else {
        chrome.runtime.sendMessage({
          type: 'RIES_ADD_TO_WORDBOOK',
          data: {
            english,
            chinese,
            context
          }
        }, (addResponse) => {
          if (addResponse?.ok) {
            isBookmarked = true;
            bookmarkBtn.textContent = '− 移出生词本';
            bookmarkBtn.classList.add('bookmarked');
            if (inlineSpan && inlineSpan.classList) {
              inlineSpan.classList.add('ries-bookmarked');
            }
          }
        });
      }
    });
  }

  function getContextFromInline(inlineSpan) {
    const originalText = inlineSpan.dataset?.riesOriginal || '';
    if (!originalText) {
      return '';
    }

    const maxLength = 100;
    if (originalText.length <= maxLength) {
      return originalText;
    }

    const trimmed = originalText.trim();
    if (trimmed.length <= maxLength) {
      return trimmed;
    }

    return trimmed.substring(0, maxLength) + '...';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => {
      switch (char) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        case "'":
          return '&#39;';
        default:
          return char;
      }
    });
  }

  function sanitizeHtml(value) {
    return escapeHtml(value);
  }

  function normalizeText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function isDisallowedTarget(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return true;
    }
    if (isWithinWidget(element)) {
      return true;
    }
    if (element.closest('script, style, textarea, input, button, select, svg, code, pre, noscript')) {
      return true;
    }
    return false;
  }

  function getInlineTargetFromPoint(clientX, clientY) {
    let range = null;
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(clientX, clientY);
    } else if (document.caretPositionFromPoint) {
      const caretPosition = document.caretPositionFromPoint(clientX, clientY);
      if (caretPosition) {
        range = document.createRange();
        range.setStart(caretPosition.offsetNode, caretPosition.offset);
        range.collapse(true);
      }
    }

    if (!range) {
      return null;
    }

    let node = range.startContainer;
    if (!node) {
      return null;
    }

    if (node.nodeType !== Node.TEXT_NODE) {
      node = node.childNodes?.[range.startOffset] || node.firstChild;
    }

    while (node && node.nodeType !== Node.TEXT_NODE && node.firstChild) {
      node = node.firstChild;
    }

    if (!node || node.nodeType !== Node.TEXT_NODE) {
      return null;
    }

    const parentElement = node.parentElement;
    if (isDisallowedTarget(parentElement)) {
      return null;
    }

    const originalText = node.textContent || '';
    const trimmed = originalText.trim();
    if (!trimmed) {
      return null;
    }

    const normalized = normalizeText(trimmed);

    if (!normalized || normalized.length > INLINE_MAX_LENGTH) {
      return null;
    }

    return {
      node,
      parentElement,
      originalText,
      normalized,
      translationText: trimmed
    };
  }

  function ensureIcon() {
    if (floatingIcon && floatingIcon.isConnected) {
      return floatingIcon;
    }

    floatingIcon = document.createElement('button');
    floatingIcon.id = ICON_ID;
    floatingIcon.type = 'button';
    floatingIcon.textContent = 'R';
    floatingIcon.setAttribute('aria-label', 'Translate selection');
    floatingIcon.addEventListener('mouseenter', handleIconMouseEnter);
    floatingIcon.addEventListener('mouseleave', handleIconMouseLeave);
    document.body.appendChild(floatingIcon);

    return floatingIcon;
  }

  function ensureTooltip() {
    if (floatingTooltip && floatingTooltip.isConnected) {
      return floatingTooltip;
    }

    floatingTooltip = document.createElement('div');
    floatingTooltip.id = TOOLTIP_ID;
    floatingTooltip.addEventListener('mouseenter', () => {
      if (hideTooltipTimer) {
        clearTimeout(hideTooltipTimer);
        hideTooltipTimer = null;
      }
    });
    floatingTooltip.addEventListener('mouseleave', () => {
      hideTooltip();
    });
    document.body.appendChild(floatingTooltip);

    return floatingTooltip;
  }

  function hideTooltip(delay = 120) {
    if (!floatingTooltip) {
      return;
    }
    if (hideTooltipTimer) {
      clearTimeout(hideTooltipTimer);
    }

    if (delay <= 0) {
      hideTooltipTimer = null;
      floatingTooltip.style.display = 'none';
      floatingTooltip.classList.remove('ries-loading');
      floatingTooltip.innerHTML = '';
      return;
    }

    hideTooltipTimer = setTimeout(() => {
      if (floatingTooltip) {
        floatingTooltip.style.display = 'none';
        floatingTooltip.classList.remove('ries-loading');
        floatingTooltip.innerHTML = '';
      }
      hideTooltipTimer = null;
    }, delay);
  }

  function showTooltip({ title = 'Ries Translate', html, text, loading = false }) {
    ensureStyles();
    const tooltip = ensureTooltip();
    if (hideTooltipTimer) {
      clearTimeout(hideTooltipTimer);
      hideTooltipTimer = null;
    }

    tooltip.classList.toggle('ries-loading', loading);

    const header = `<strong>${title}</strong>`;
    const bodyContent = html ? html : text || '';
    tooltip.innerHTML = `${header}<div class="ries-tooltip-body">${bodyContent}</div>`;
    tooltip.style.display = 'block';

    positionTooltip();
  }

  function positionTooltip() {
    if (!floatingIcon || !floatingTooltip) {
      return;
    }

    const iconRect = floatingIcon.getBoundingClientRect();
    const tooltipRect = floatingTooltip.getBoundingClientRect();
    const scrollY = window.scrollY || window.pageYOffset;
    const scrollX = window.scrollX || window.pageXOffset;

    let top = scrollY + iconRect.top - 6;
    let left = scrollX + iconRect.right + 12;

    const viewportRight = scrollX + window.innerWidth;
    if (left + tooltipRect.width > viewportRight - 8) {
      left = scrollX + iconRect.left - tooltipRect.width - 12;
    }

    const minTop = scrollY + 8;
    const maxTop = scrollY + window.innerHeight - tooltipRect.height - 8;
    top = clamp(top, minTop, maxTop);

    floatingTooltip.style.top = `${top}px`;
    floatingTooltip.style.left = `${left}px`;
  }

  function hideFloatingUI() {
    if (hideTooltipTimer) {
      clearTimeout(hideTooltipTimer);
      hideTooltipTimer = null;
    }
    if (floatingIcon) {
      floatingIcon.removeEventListener('mouseenter', handleIconMouseEnter);
      floatingIcon.removeEventListener('mouseleave', handleIconMouseLeave);
      floatingIcon.remove();
      floatingIcon = null;
    }
    if (floatingTooltip) {
      floatingTooltip.remove();
      floatingTooltip = null;
    }
    currentSelectionText = '';
    activeRequest = null;
    iconHovered = false;
  }

  function updateIconPosition(rect) {
    if (!floatingIcon) {
      return;
    }

    const iconSize = 32;
    const offset = 10;
    const scrollY = window.scrollY || window.pageYOffset;
    const scrollX = window.scrollX || window.pageXOffset;

    let top = scrollY + rect.top - iconSize - offset;
    let left = scrollX + rect.left + rect.width / 2 - iconSize / 2;

    const minTop = scrollY + 8;
    const maxTop = scrollY + window.innerHeight - iconSize - 8;
    const minLeft = scrollX + 8;
    const maxLeft = scrollX + window.innerWidth - iconSize - 8;

    top = clamp(top, minTop, maxTop);
    left = clamp(left, minLeft, maxLeft);

    floatingIcon.style.top = `${top}px`;
    floatingIcon.style.left = `${left}px`;
    floatingIcon.style.display = 'flex';
  }

  function showSelectionIcon(rect, text) {
    if (!ENABLE_SELECTION_ICON) {
      return;
    }
    ensureStyles();
    const icon = ensureIcon();
    icon.dataset.selectionText = text;
    currentSelectionText = text;
    updateIconPosition(rect);
  }

  function getSelectionDetails() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      return null;
    }

    if (isWithinWidget(selection.anchorNode) || isWithinWidget(selection.focusNode)) {
      return null;
    }

    const text = selection.toString().trim();
    if (!text) {
      return null;
    }

    let range;
    try {
      range = selection.getRangeAt(0).cloneRange();
    } catch (error) {
      return null;
    }

    let rect = range.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) {
      const rects = range.getClientRects();
      if (!rects.length) {
        return null;
      }
      rect = Array.from(rects).find((r) => r.width && r.height) || rects[0];
    }

    if (!rect || (!rect.width && !rect.height)) {
      return null;
    }

    return { text, rect };
  }

  let selectionCheckTimeout = null;

  function scheduleSelectionCheck(delay = 24) {
    if (selectionCheckTimeout) {
      clearTimeout(selectionCheckTimeout);
    }
    if (triggerActive) {
      hideFloatingUI();
      return;
    }
    if (!ENABLE_SELECTION_ICON) {
      hideFloatingUI();
      return;
    }
    selectionCheckTimeout = setTimeout(() => {
      selectionCheckTimeout = null;
      const details = getSelectionDetails();
      if (!details) {
        hideFloatingUI();
        return;
      }
      showSelectionIcon(details.rect, details.text);
    }, delay);
  }

  const MAX_AUTO_TARGETS = 120;

  function collectAutoTargets() {
    const targets = [];
    if (!document?.body) {
      return targets;
    }

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node || !node.parentElement) {
          return NodeFilter.FILTER_REJECT;
        }
        if (isWithinWidget(node.parentElement) || isDisallowedTarget(node.parentElement)) {
          return NodeFilter.FILTER_REJECT;
        }
        const text = node.textContent;
        if (!text) {
          return NodeFilter.FILTER_REJECT;
        }
        if (!/[\u4e00-\u9fff]/.test(text)) {
          return NodeFilter.FILTER_REJECT;
        }
        const trimmed = text.trim();
        if (!trimmed || trimmed.length < 2) {
          return NodeFilter.FILTER_REJECT;
        }
        const normalized = normalizeText(trimmed);
        if (!normalized || normalized.length === 0 || normalized.length > INLINE_MAX_LENGTH) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let node;
    while ((node = walker.nextNode())) {
      if (targets.length >= MAX_AUTO_TARGETS) {
        break;
      }
      const originalText = node.textContent;
      const trimmed = originalText.trim();
      const normalized = normalizeText(trimmed);
      if (!normalized) {
        continue;
      }

      targets.push({
        node,
        parentElement: node.parentElement,
        originalText,
        normalized,
        translationText: trimmed
      });
    }

    return targets;
  }

  function revertAutoTranslations() {
    if (!autoInlines.size) {
      return;
    }

    autoGeneration += 1;

    for (const inline of Array.from(autoInlines)) {
      autoInlines.delete(inline);
      if (inline.requestToken) {
        inline.requestToken.cancelled = true;
      }
      const placeholder = inline.placeholder;
      if (placeholder && placeholder.isConnected) {
        const original = inline.originalText ?? placeholder.dataset.riesOriginal ?? '';
        placeholder.replaceWith(document.createTextNode(original));
      }
    }
  }

  function revertInlineSpans() {
    const nodes = document.querySelectorAll(`.${INLINE_CLASS}`);
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }
      const original = node.dataset?.riesOriginal;
      if (original === undefined) {
        continue;
      }
      if (!node.isConnected) {
        continue;
      }
      node.replaceWith(document.createTextNode(original));
    }
  }

  function applyAutoTranslations() {
    if (!displayTranslations || !currentSettings.apiKey) {
      return;
    }

    revertAutoTranslations();

    const targets = collectAutoTargets();
    if (!targets.length) {
      return;
    }

    const generation = ++autoGeneration;
    let index = 0;

    const processNext = () => {
      if (!displayTranslations || generation !== autoGeneration) {
        return;
      }
      const target = targets[index++];
      if (!target) {
        return;
      }

      const replacement = createInlineReplacement(target, { trackAuto: true, generation });
      if (replacement) {
        translateInlineTarget(replacement);
      }

      if (index < targets.length) {
        setTimeout(processNext, 60);
      }
    };

    processNext();
  }

  function clearCurrentInline({ revert = true } = {}) {
    if (!currentInline) {
      return;
    }

    const { placeholder, originalText, requestToken } = currentInline;

    if (requestToken && revert) {
      requestToken.cancelled = true;
    }

    if (revert && placeholder && placeholder.isConnected) {
      placeholder.replaceWith(document.createTextNode(originalText));
    }

    currentInline = null;
  }

  function createInlineReplacement(target, options = {}) {
    if (!target?.node?.parentNode) {
      return null;
    }

    ensureStyles();

    const span = document.createElement('span');
    span.className = `${INLINE_CLASS} ${INLINE_LOADING_CLASS}`;
    span.setAttribute('data-ries-inline', 'true');
    span.dataset.riesOriginal = target.originalText;
    span.textContent = target.originalText;

    target.node.parentNode.replaceChild(span, target.node);

    const leadingWhitespace = target.originalText.match(/^\s*/)?.[0] || '';
    const trailingWhitespace = target.originalText.match(/\s*$/)?.[0] || '';

    const inline = {
      placeholder: span,
      originalText: target.originalText,
      translationText: target.translationText,
      translationKey: target.normalized,
      requestToken: null,
      originalNode: target.node,
      leadingWhitespace,
      trailingWhitespace,
      isAuto: Boolean(options.trackAuto),
      autoGeneration: options.generation || 0
    };

    if (inline.isAuto) {
      autoInlines.add(inline);
    }

    return inline;
  }

  function applyInlineResult(inline, data) {
    if (!inline || !inline.placeholder || !inline.placeholder.isConnected) {
      return;
    }

    inline.placeholder.classList.remove(INLINE_LOADING_CLASS);

    const html = data?.translationHtml;
    const fallback = data?.translation ? escapeHtml(data.translation) : '';
    const showInline = displayTranslations || !inline.isAuto;

    inline.translationData = data;
    // 将翻译数据挂到 DOM 节点，便于点击检索
    if (inline.placeholder) {
      inline.placeholder.translationData = data;
    }

    if (!showInline) {
      inline.placeholder.textContent = inline.originalText;
      return;
    }

    const leading = inline.leadingWhitespace ? sanitizeHtml(inline.leadingWhitespace) : '';
    const trailing = inline.trailingWhitespace ? sanitizeHtml(inline.trailingWhitespace) : '';

    if (html) {
      inline.placeholder.innerHTML = `${leading}${html}${trailing}`;
    } else if (fallback) {
      inline.placeholder.innerHTML = `${leading}${fallback}${trailing}`;
    } else {
      inline.placeholder.innerHTML = `${leading}${sanitizeHtml(inline.originalText)}${trailing}`;
    }
  }

  function translateInlineTarget(inline) {
    if (!inline || !inline.placeholder || !inline.placeholder.isConnected) {
      return;
    }

    const cacheKey = inline.translationKey;
    const namespacedKey = getNamespacedKey(cacheKey);
    const showInline = displayTranslations || !inline.isAuto;

    inline.placeholder.classList.add(INLINE_LOADING_CLASS);

    if (!currentSettings.apiKey) {
      inline.placeholder.classList.remove(INLINE_LOADING_CLASS);
      inline.placeholder.textContent = inline.originalText;
      inline.translationData = null;
      return;
    }

    if (!showInline) {
      inline.placeholder.classList.remove(INLINE_LOADING_CLASS);
      inline.placeholder.textContent = inline.originalText;
      inline.translationData = null;
      return;
    }

    if (translationCache.has(namespacedKey)) {
      applyInlineResult(inline, translationCache.get(namespacedKey));
      return;
    }

    const token = { cancelled: false };
    inline.requestToken = token;

    requestSharedTranslation(inline.translationText, cacheKey)
      .then((data) => {
        if (token.cancelled) {
          return;
        }
        if (inline.requestToken !== token) {
          return;
        }
        if (inline.isAuto && inline.autoGeneration !== autoGeneration) {
          return;
        }
        applyInlineResult(inline, data);
      })
      .catch((error) => {
        if (token.cancelled) {
          return;
        }
        if (!inline.placeholder || !inline.placeholder.isConnected) {
          return;
        }
        if (inline.isAuto && inline.autoGeneration !== autoGeneration) {
          return;
        }
        inline.placeholder.classList.remove(INLINE_LOADING_CLASS);
        inline.placeholder.textContent = `翻译失败：${error.message || error}`;
      })
      .finally(() => {
        if (inline.requestToken === token) {
          inline.requestToken = null;
        }
      });
  }

  function processTriggerHover() {
    triggerHoverRAF = null;
    if (!triggerActive) {
      return;
    }

    if (!currentSettings.apiKey) {
      clearCurrentInline({ revert: true });
      pendingTriggerEvent = null;
      return;
    }

    const event = pendingTriggerEvent;
    pendingTriggerEvent = null;

    if (!event) {
      return;
    }

    const element = document.elementFromPoint(event.clientX, event.clientY);
    if (currentInline?.placeholder && element && currentInline.placeholder.contains(element)) {
      return;
    }

    const target = getInlineTargetFromPoint(event.clientX, event.clientY);

    if (!target) {
      return;
    }

    if (currentInline?.originalNode === target.node) {
      return;
    }

    clearCurrentInline({ revert: false });

    const replacement = createInlineReplacement(target);
    if (!replacement) {
      return;
    }

    currentInline = replacement;
    translateInlineTarget(currentInline);
  }

  function handleTriggerMouseMove(event) {
    if (isTriggerKeyPressed(currentSettings)) {
      if (!triggerActive) {
        setTriggerActive(true);
      }
    } else if (triggerActive) {
      setTriggerActive(false);
      return;
    }

    if (!triggerActive) {
      return;
    }

    if (!currentSettings.apiKey) {
      clearCurrentInline({ revert: true });
      return;
    }

    pendingTriggerEvent = event;

    if (!triggerHoverRAF) {
      triggerHoverRAF = requestAnimationFrame(processTriggerHover);
    }
  }

  function setTriggerActive(state) {
    if (triggerActive === state) {
      return;
    }
    triggerActive = state;
    if (!triggerActive) {
      pendingTriggerEvent = null;
      if (triggerHoverRAF) {
        cancelAnimationFrame(triggerHoverRAF);
        triggerHoverRAF = null;
      }
      clearCurrentInline({ revert: !displayTranslations });
    } else {
      hideFloatingUI();
    }
  }

  function handleTriggerKeyDown(event) {
    if (shouldProcessTriggerKey(event)) {
      setTriggerActive(true);
    }
  }

  function handleTriggerKeyUp(event) {
    if (shouldProcessTriggerKey(event) || !isTriggerKeyPressed(currentSettings)) {
      setTriggerActive(false);
    }
  }

  function requestTranslation(text) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'RIES_TRANSLATE_TEXT', text }, (response) => {
        if (!response) {
          reject(new Error('No response from background script.'));
          return;
        }
        if (!response.ok) {
          reject(new Error(response.error || 'Translation failed.'));
          return;
        }
        resolve(response.data);
      });
    });
  }

  function requestSharedTranslation(text, key) {
    const namespacedKey = getNamespacedKey(key);

    if (translationCache.has(namespacedKey)) {
      return Promise.resolve(translationCache.get(namespacedKey));
    }

    if (pendingTranslations.has(namespacedKey)) {
      return pendingTranslations.get(namespacedKey);
    }

    const promise = requestTranslation(text)
      .then((data) => {
        translationCache.set(namespacedKey, data);
        pendingTranslations.delete(namespacedKey);
        return data;
      })
      .catch((error) => {
        pendingTranslations.delete(namespacedKey);
        throw error;
      });

    pendingTranslations.set(namespacedKey, promise);
    return promise;
  }

  function buildTooltipHtml(data) {
    const translationHtml = data.translationHtml || (data.translation ? escapeHtml(data.translation) : '');
    const replacements = Array.isArray(data.replacements) ? data.replacements : [];
    if (!replacements.length) {
      return translationHtml;
    }

    const items = replacements
      .slice(0, 6)
      .map((item) => {
        const cn = escapeHtml(item.chinese ?? '');
        const en = escapeHtml(item.english ?? '');
        return `<span>${cn} &rarr; ${en}</span>`;
      })
      .join('');

    const more = replacements.length > 6 ? `<span>... ${replacements.length - 6} more</span>` : '';
    return `${translationHtml}<div class="ries-tooltip-terms">${items}${more}</div>`;
  }

  function handleIconMouseEnter() {
    if (!floatingIcon) {
      return;
    }

    const text = floatingIcon.dataset.selectionText;
    if (!text) {
      return;
    }

    if (!displayTranslations) {
      showTooltip({ text: '当前已切换为仅显示原文，在弹出面板开启后即可查看英文增强。' });
      return;
    }

    if (!currentSettings.apiKey) {
      showTooltip({ text: '尚未配置 API Key，请先在设置页完成配置。' });
      return;
    }

    const cacheKey = normalizeText(text);
    if (!cacheKey) {
      return;
    }

    const namespacedKey = getNamespacedKey(cacheKey);

    iconHovered = true;
    showTooltip({ html: '', text: '翻译中...', loading: true });

    if (translationCache.has(namespacedKey)) {
      const cached = translationCache.get(namespacedKey);
      showTooltip({ html: buildTooltipHtml(cached) });
      return;
    }

    const requestToken = { text, cacheKey: namespacedKey };
    activeRequest = requestToken;

    requestSharedTranslation(text, cacheKey)
      .then((data) => {
        if (activeRequest !== requestToken) {
          return;
        }
        if (currentSelectionText !== text) {
          return;
        }
        if (!iconHovered) {
          return;
        }
        showTooltip({ html: buildTooltipHtml(data) });
      })
      .catch((error) => {
        if (activeRequest !== requestToken) {
          return;
        }
        if (currentSelectionText !== text) {
          return;
        }
        if (!iconHovered) {
          return;
        }
        showTooltip({ text: `翻译失败：${error.message || error}` });
      })
      .finally(() => {
        if (activeRequest === requestToken) {
          activeRequest = null;
        }
      });
  }

  function handleIconMouseLeave() {
    iconHovered = false;
    hideTooltip();
  }

  function refreshFloatingPosition() {
    if (!floatingIcon) {
      return;
    }

    const details = getSelectionDetails();
    if (!details) {
      hideFloatingUI();
      return;
    }

    updateIconPosition(details.rect);
    if (floatingTooltip && floatingTooltip.style.display === 'block') {
      positionTooltip();
    }
  }

  function handleDocumentMouseDown(event) {
    const target = event.target;
    const insideIcon = floatingIcon && floatingIcon.contains(target);
    const insideTooltip = floatingTooltip && floatingTooltip.contains(target);

    if (floatingIcon && !insideIcon && !insideTooltip) {
      hideFloatingUI();
    }

    if (currentInline?.placeholder && !currentInline.placeholder.contains(target)) {
      clearCurrentInline({ revert: false });
    }
  }

  hydrateSettings();

  document.addEventListener('selectionchange', () => scheduleSelectionCheck(80));
  document.addEventListener('mouseup', () => scheduleSelectionCheck(20));
  document.addEventListener('keyup', (event) => {
    if (event.key === 'Escape') {
      hideFloatingUI();
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
      }
      return;
    }
    scheduleSelectionCheck(40);
  });
  document.addEventListener('mousedown', handleDocumentMouseDown, true);
  document.addEventListener('mousemove', handleTriggerMouseMove, true);
  document.addEventListener('keydown', (event) => {
    handleTriggerKeyDown(event);
    handleGlobalHotkey(event);
  }, true);
  document.addEventListener('keyup', handleTriggerKeyUp, true);
  document.addEventListener('click', handleWordbookClick, true);
  window.addEventListener('scroll', () => refreshFloatingPosition(), true);
  window.addEventListener('resize', () => refreshFloatingPosition());
  window.addEventListener('blur', () => setTriggerActive(false));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      setTriggerActive(false);
    }
  });

  // 全局交互：关闭/重定位 popover
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (wordbookPopover && t instanceof Node) {
      if (!wordbookPopover.contains(t) && !wordbookPopoverTarget?.contains(t)) {
        removeWordbookPopover();
      }
    }
  }, true);
  window.addEventListener('scroll', () => {
    if (wordbookPopover) positionWordbookPopover();
  }, true);
  window.addEventListener('resize', () => {
    if (wordbookPopover) positionWordbookPopover();
  });
  document.addEventListener('keyup', (e) => {
    if (e.key === 'Escape') {
      removeWordbookPopover();
    }
  }, true);

  function removeOverlay() {
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) {
      existing.remove();
    }
  }

  function renderOverlay(state) {
    ensureStyles();
    removeOverlay();

    const container = document.createElement('div');
    container.id = OVERLAY_ID;
    container.classList.toggle('ries-loading', state.status === 'loading');

    const closeButton = document.createElement('button');
    closeButton.className = 'ries-close';
    closeButton.innerText = '×';
    closeButton.addEventListener('click', removeOverlay);
    container.appendChild(closeButton);

    const title = document.createElement('strong');
    title.innerText = 'Ries Terminology Translate';
    container.appendChild(title);

    const body = document.createElement('div');
    body.className = 'ries-body';

    if (state.status === 'loading') {
      body.innerText = 'Calling the language model…';
    } else if (state.status === 'error') {
      body.innerText = state.message || 'Translation failed.';
    } else if (displayTranslations) {
      body.innerHTML = state.translationHtml;
    } else {
      body.innerText = state.sourceText || '原文已保持不变。';
    }

    container.appendChild(body);

    if (
      displayTranslations &&
      state.status === 'ready' &&
      Array.isArray(state.replacements) &&
      state.replacements.length > 0
    ) {
      const meta = document.createElement('div');
      meta.className = 'ries-meta';
      meta.innerHTML = `
        <span>${state.replacements.length} glossary term${state.replacements.length > 1 ? 's' : ''}</span>
        <span>LLM · ${new Date().toLocaleTimeString()}</span>
      `;
      container.appendChild(meta);
    }

    document.body.appendChild(container);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message.type !== 'string') {
      return;
    }

    switch (message.type) {
      case 'RIES_TRANSLATION_STARTED':
        renderOverlay({ status: 'loading' });
        break;
      case 'RIES_TRANSLATION_RESULT':
        renderOverlay({
          status: 'ready',
          translationHtml: message.payload.translationHtml,
          replacements: message.payload.replacements || [],
          sourceText: message.payload.sourceText
        });
        break;
      case 'RIES_TRANSLATION_ERROR':
        renderOverlay({
          status: 'error',
          message: message.payload?.message
        });
        break;
      default:
        break;
    }
  });
})();
