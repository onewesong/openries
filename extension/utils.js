export function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function sanitizeHtml(text) {
  if (typeof text !== 'string') {
    return '';
  }
  return escapeHtml(text);
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function wrapWithAnnotations(translation, replacements) {
  let html = sanitizeHtml(translation);

  for (const replacement of replacements) {
    const english = replacement?.english?.trim();
    const chinese = replacement?.chinese?.trim();

    if (!english || !chinese) {
      continue;
    }

    const combinedPattern = new RegExp(
      `${escapeRegExp(english)}\\s*\\(${escapeRegExp(chinese)}\\)`,
      'g'
    );
    const safeEnglish = sanitizeHtml(english);
    const safeChinese = sanitizeHtml(chinese);

    const replacedHtml = html.replace(combinedPattern, () => {
      return `<span class="ries-annotated">${safeEnglish}(${safeChinese})</span>`;
    });

    if (replacedHtml !== html) {
      html = replacedHtml;
      continue;
    }

    const englishPattern = new RegExp(`\\b${escapeRegExp(english)}\\b`, 'g');
    html = html.replace(englishPattern, () => {
      return `<span class="ries-annotated">${safeEnglish}(${safeChinese})</span>`;
    });
  }

  return html;
}

// Remove remembered terms from replacements and redact the translation text
export function redactRemembered(translation, replacements, remembered) {
  const list = Array.isArray(remembered) ? remembered : [];
  if (!list.length) {
    return { translation, replacements };
  }

  let newTranslation = translation;
  const toRemove = new Set();

  for (const r of replacements) {
    const en = (r?.english || '').trim();
    const cn = (r?.chinese || '').trim();
    if (!en || !cn) continue;
    const isRemembered = list.some(x => (x.english || '').trim() === en && (x.chinese || '').trim() === cn);
    if (isRemembered) {
      toRemove.add(`${en}|||${cn}`);
      // Replace "English(Chinese)" with just Chinese in the raw translation string
      const pattern = new RegExp(`${en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\s*\(${cn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\)`, 'g');
      newTranslation = newTranslation.replace(pattern, cn);
    }
  }

  const filtered = replacements.filter(r => !toRemove.has(`${(r?.english || '').trim()}|||${(r?.chinese || '').trim()}`));
  return { translation: newTranslation, replacements: filtered };
}
