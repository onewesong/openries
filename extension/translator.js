import { wrapWithAnnotations } from './utils.js';

class TranslationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'TranslationError';
    this.details = details;
  }
}

function resolveTermPreferences(settings) {
  const parsedCount = Number.parseInt(settings?.termTargetCount, 10);
  const count = Number.isFinite(parsedCount) ? parsedCount : 3;
  const boundedCount = Math.min(10, Math.max(1, count));
  const allowed = new Set(['basic', 'intermediate', 'advanced']);
  const difficulty = allowed.has(settings?.termDifficulty) ? settings.termDifficulty : 'intermediate';
  return { count: boundedCount, difficulty };
}

function buildPrompt(text, settings) {
  const { count, difficulty } = resolveTermPreferences(settings);

  const difficultyNotes = {
    basic: '优先选择常见、高频、拼写简单的英文单词，适合大众理解。',
    intermediate: '挑选商业/科技语境下常用的英文表达，体现专业度但仍容易理解。',
    advanced: '挑选更具专业性或高阶的英文术语，但需确保语境准确。'
  };

  const systemContent = `你是一名中英双语的本地化编辑，需要保持中文句式，只把大约 ${count} 个关键术语换成英文。遵守以下规则：
1. 只替换最重要的名词或短语，整体句子仍保持中文表达。
2. 每个被替换的术语用英文单词直接出现在句子里，并紧跟原始中文，格式形如 Growth(增长)。
3. ${difficultyNotes[difficulty]}
4. 理想情况下替换 ${count} 个不同的术语；若文本适合的术语不足，替换尽可能多但不少于 1 个。
5. 返回严格的 JSON：{"translation":"混合文本","replacements":[{"english":"Term","chinese":"原词"},...]}
6. replacements 数组中的条目与实际替换完全一致，英文大小写需与 translation 中保持一致。
7. 不要输出额外解释或 Markdown，仅输出 JSON。`;

  const userContent = `待处理文本：\n${text}`;

  return [
    {
      role: 'system',
      content: systemContent
    },
    {
      role: 'user',
      content: userContent
    }
  ];
}

async function callChatCompletion(text, settings) {
  const body = {
    model: settings.model,
    temperature: settings.temperature,
    messages: buildPrompt(text, settings)
  };

  const response = await fetch(`${settings.apiBaseUrl.replace(/\/$/, '')}${settings.apiPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new TranslationError('Upstream API responded with an error', {
      status: response.status,
      body: errorText
    });
  }

  const data = await response.json();
  const message = data?.choices?.[0]?.message?.content;

  if (!message) {
    throw new TranslationError('No translation returned from API', data);
  }

  let parsed;
  try {
    parsed = JSON.parse(message);
  } catch (error) {
    throw new TranslationError('Failed to parse translation JSON', message);
  }

  const translation = parsed.translation?.trim();
  const replacements = Array.isArray(parsed.replacements) ? parsed.replacements : [];

  if (!translation) {
    throw new TranslationError('Translation text is missing from API response', parsed);
  }

  return { translation, replacements };
}

export async function translateWithReplacements(text, settings) {
  if (!settings.apiKey) {
    throw new TranslationError('API key is missing. Please set it in the extension options.');
  }

  const { translation, replacements } = await callChatCompletion(text, settings);
  const translationHtml = wrapWithAnnotations(translation, replacements);

  return {
    translation,
    translationHtml,
    replacements
  };
}

export { TranslationError };
