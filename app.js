/* Traductor de subtítulos v2.0
 * Basado en "Subtitle Translator for LM Studio" de TTomas65 (licencia MIT).
 * Sin dependencias ni compilación: abre index.html y listo.
 */
'use strict';

/* =========================================================================
 * 1. NÚCLEO (funciones puras, se pueden probar sin navegador)
 * ========================================================================= */
const Core = (() => {

  const VERSION = '2.0';

  // código, nombre en la interfaz, nombre para el prompt (en inglés)
  const LANGS = [
    ['es', 'Español (España)', 'Spanish (Spain)'],
    ['en', 'Inglés', 'English'],
    ['zh-Hans', 'Chino simplificado', 'Simplified Chinese (Mainland China)'],
    ['es-419', 'Español (Latinoamérica)', 'Latin American Spanish'],
    ['zh-Hant', 'Chino tradicional', 'Traditional Chinese'],
    ['fr', 'Francés', 'French'],
    ['de', 'Alemán', 'German'],
    ['it', 'Italiano', 'Italian'],
    ['pt-PT', 'Portugués (Portugal)', 'European Portuguese'],
    ['pt-BR', 'Portugués (Brasil)', 'Brazilian Portuguese'],
    ['ca', 'Catalán', 'Catalan'],
    ['eu', 'Euskera', 'Basque'],
    ['gl', 'Gallego', 'Galician'],
    ['nl', 'Neerlandés', 'Dutch'],
    ['pl', 'Polaco', 'Polish'],
    ['ru', 'Ruso', 'Russian'],
    ['uk', 'Ucraniano', 'Ukrainian'],
    ['ja', 'Japonés', 'Japanese'],
    ['ko', 'Coreano', 'Korean'],
  ];
  const langName = c => (LANGS.find(l => l[0] === c) || [c, c, c])[1];
  const langPrompt = c => (LANGS.find(l => l[0] === c) || [c, c, c])[2];
  const isCJK = c => /^(zh|ja|ko)/.test(c || '');

  /* ---------- Lectura de archivos ---------- */

  function normTime(t) {
    // Acepta 00:01:02,345 · 00:01:02.345 · 01:02.345 · 0:01:02,3
    t = String(t).trim().replace('.', ',');
    let [hms, ms = '000'] = t.split(',');
    const parts = hms.split(':').map(p => p.padStart(2, '0'));
    while (parts.length < 3) parts.unshift('00');
    ms = (ms + '000').slice(0, 3);
    return `${parts[0]}:${parts[1]}:${parts[2]},${ms}`;
  }

  function cleanText(content) {
    return String(content).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  }

  function parseSRT(content) {
    const subs = [];
    const blocks = cleanText(content).split(/\n[ \t]*\n/);
    for (const block of blocks) {
      const lines = block.split('\n');
      const ti = lines.findIndex(l => l.includes('-->'));
      if (ti < 0) continue;
      const m = lines[ti].match(/([\d:.,]+)\s*-->\s*([\d:.,]+)/);
      if (!m) continue;
      const text = lines.slice(ti + 1).map(l => l.replace(/\s+$/, '')).join('\n').trim();
      subs.push({ start: normTime(m[1]), end: normTime(m[2]), raw: text, text });
    }
    return subs;
  }

  function parseVTT(content) {
    const subs = [];
    const blocks = cleanText(content).split(/\n[ \t]*\n/);
    for (const block of blocks) {
      const lines = block.split('\n');
      if (/^(WEBVTT|NOTE|STYLE|REGION)\b/.test(lines[0].trim())) {
        if (!lines.some(l => l.includes('-->'))) continue;
      }
      const ti = lines.findIndex(l => l.includes('-->'));
      if (ti < 0) continue;
      const m = lines[ti].match(/([\d:.,]+)\s*-->\s*([\d:.,]+)/);
      if (!m) continue;
      const text = lines.slice(ti + 1).join('\n').trim();
      subs.push({ start: normTime(m[1]), end: normTime(m[2]), raw: text, text });
    }
    return subs;
  }

  function parseSubtitles(content, fileName = '') {
    const c = cleanText(content);
    if (/\.vtt$/i.test(fileName) || /^WEBVTT/.test(c.trim())) return parseVTT(c);
    return parseSRT(c);
  }

  /* ---------- Etiquetas de hablante ---------- */

  const GENERIC_SPK = /^(?:speaker|hablante|orador|locutor|interlocutor|persona|voz|voice|spk|s)[\s_-]*\d{1,2}$/i;
  const NAME_RE = /^[\p{Lu}][\p{L}\p{M}.'’-]*(?:\s+[\p{Lu}\d][\p{L}\p{M}\d.'’-]*){0,3}$/u;

  function lineLabel(line) {
    // Devuelve {label, rest, whole} si la línea empieza por una posible etiqueta.
    let l = line.replace(/^\s*>>\s*/, '').replace(/^\s*-\s*/, '');
    // [Speaker 1] o (Speaker 1) o [Juan]: al inicio
    let m = l.match(/^[\[(]\s*([^\])]{1,32}?)\s*[\])]\s*:?\s*(.*)$/);
    if (m && (GENERIC_SPK.test(m[1]) || NAME_RE.test(m[1]))) {
      return { label: m[1].trim(), rest: m[2], whole: m[2].trim() === '', bracket: true };
    }
    // Nombre: texto
    m = l.match(/^([^:：]{1,32}?)\s*[:：]\s*(.*)$/);
    if (m && (GENERIC_SPK.test(m[1].trim()) || NAME_RE.test(m[1].trim())) && !/^\d/.test(m[1])) {
      return { label: m[1].trim(), rest: m[2], whole: m[2].trim() === '' };
    }
    // Línea entera = etiqueta genérica sin dos puntos (p. ej. "Speaker 1")
    if (GENERIC_SPK.test(l.trim())) return { label: l.trim(), rest: '', whole: true };
    // Línea entera corta que podría ser un nombre (se confirma por repetición)
    const w = l.trim();
    const looksName = (/\p{L}/u.test(w) && w === w.toUpperCase() && w.length >= 2) || w.split(/\s+/).length >= 2;
    if (NAME_RE.test(w) && w.length <= 32 && looksName && !/[.!?¿¡,]$/.test(w)) {
      return { label: l.trim(), rest: '', whole: true, weak: true };
    }
    return null;
  }

  function analyzeSpeakers(subs) {
    const counts = new Map();
    let arrows = 0, vtags = 0;
    for (const s of subs) {
      if (/<v[\s.][^>]*>/i.test(s.raw)) vtags++;
      const lines = s.raw.split('\n');
      lines.forEach((line, i) => {
        if (/^\s*>>/.test(line)) arrows++;
        const r = lineLabel(line);
        if (!r) return;
        // una línea suelta "débil" solo cuenta si es la 1.ª línea y hay más texto debajo
        if (r.weak && !(i === 0 && lines.length > 1)) return;
        const key = r.label;
        const e = counts.get(key) || { label: key, count: 0, generic: GENERIC_SPK.test(key), weak: !!r.weak };
        e.count++;
        counts.set(key, e);
      });
    }
    const labels = [...counts.values()]
      .filter(e => e.generic || (e.weak ? e.count >= 4 : e.count >= 3))
      .sort((a, b) => b.count - a.count);
    // Si casi todos los subtítulos llevan "Nombre:" es claramente formato de hablantes;
    // si solo aparecen 1-2 nombres sueltos, se ignora.
    const affected = subs.filter(s => {
      if (/<v[\s.][^>]*>/i.test(s.raw) || /^\s*>>/m.test(s.raw)) return true;
      return s.raw.split('\n').some(l => { const r = lineLabel(l); return r && labels.some(x => x.label === r.label); });
    }).length;
    return { labels, affected, arrows, vtags };
  }

  function stripSpeakers(text, labels) {
    const set = new Set(labels.map(l => l.label));
    let t = text.replace(/<v(?:[\s.][^>]*)?>/gi, '').replace(/<\/v>/gi, '');
    const out = [];
    for (const line of t.split('\n')) {
      let l = line.replace(/^\s*>>\s*/, '');
      const dash = /^\s*-\s*/.test(l) ? '- ' : '';
      const r = lineLabel(l);
      if (r && set.has(r.label)) {
        if (r.whole) continue;
        l = dash + r.rest.trim();
      }
      out.push(l);
    }
    return out.join('\n').trim();
  }

  /* ---------- Detección de idioma ---------- */

  const STOP = {
    en: 'the and you to of is that it in we this what i be have for not on with are was so but they do just can',
    es: 'el la de que y en los se es por un una lo con no las del para pero como más está muy esto eso',
    fr: 'le la les de et des est que une un pas pour qui dans en ce il vous nous je sur avec',
    de: 'der die das und ist nicht ich sie es zu den mit ein eine wir auf für sich dem auch',
    it: 'il di che è la e un una non per sono gli le della questo come anche ma',
    pt: 'o a de que e do da não em um uma os para com é se mais isso você',
    ca: 'el la de que i els les és per un una amb no però això molt aquest',
  };
  function detectLang(subs) {
    const text = subs.slice(0, 400).map(s => s.text).join(' ').slice(0, 20000);
    const n = text.replace(/\s/g, '').length || 1;
    const count = re => (text.match(re) || []).length / n;
    if (count(/[぀-ヿ]/g) > 0.05) return 'ja';
    if (count(/[가-힯]/g) > 0.1) return 'ko';
    if (count(/\p{Script=Han}/gu) > 0.2) return 'zh-Hans';
    if (count(/[Ѐ-ӿ]/g) > 0.3) return 'ru';
    const words = text.toLowerCase().match(/\p{L}+/gu) || [];
    let best = 'en', bestScore = -1;
    for (const [lang, list] of Object.entries(STOP)) {
      const set = new Set(list.split(' '));
      const score = words.reduce((a, w) => a + (set.has(w) ? 1 : 0), 0);
      if (score > bestScore) { best = lang; bestScore = score; }
    }
    if (best === 'pt') return 'pt-PT';
    return best;
  }
  const defaultTarget = src => (src === 'en' ? 'es' : 'en');

  /* ---------- Prompt ---------- */

  function parseGlossary(text) {
    return String(text || '').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
      .map(l => { const m = l.split(/\s*(?:=|→|->|\t)\s*/); return m.length >= 2 ? [m[0], m.slice(1).join(' ')] : null; })
      .filter(Boolean);
  }

  function buildSystemPrompt({ src, tgt, maxChars, notes, glossary, transcript }) {
    const S = langPrompt(src), T = langPrompt(tgt);
    let p = `You are an expert audiovisual translator who writes professional subtitles.
Translate subtitles from ${S} into ${T}.

Rules:
1. Be faithful to the meaning. Do not add, omit, summarise, censor or explain anything. Keep the speaker's register and tone.
2. Write natural, idiomatic ${T}, as a native professional subtitler would. Avoid word-for-word calques.
3. Translate each subtitle separately and keep its id. Never merge, split, reorder or skip subtitles. When a sentence runs across several subtitles, break your translation at the same points so every subtitle stays in sync with the audio.
4. At most 2 lines per subtitle and about ${maxChars} characters per line. Use "\\n" for a line break. Shorter is better than longer.
5. Keep tags such as <i>…</i>, numbers and units. Do not translate the names of people, games, publishers or brands unless the glossary says otherwise.
6. When a glossary entry matches, use its translation exactly.
7. If a subtitle needs no translation (a name, a number, a sound effect that is already in ${T}), return it unchanged.`;
    if (/^zh/.test(tgt)) {
      p += `\n8. Follow standard ${T} subtitle conventions: use spaces instead of commas or full stops at the end of a phrase inside a line, no full stop at the end of a subtitle, and keep question and exclamation marks.`;
    }
    p += `

Answer ONLY with a JSON object, without code fences or comments, in exactly this shape:
{"t":[{"id":12,"text":"translation"}]}
Return exactly one entry for every id you are asked to translate.`;
    if (notes && notes.trim()) p += `\n\nNotes about this video from the user (follow them):\n${notes.trim()}`;
    const g = parseGlossary(glossary);
    if (g.length) p += `\n\nGlossary (${S} → ${T}):\n` + g.map(([a, b]) => `- ${a} → ${b}`).join('\n');
    if (transcript) {
      p += `\n\nFull source transcript, for context only. Do NOT translate all of it: each message tells you which ids to translate.\n<transcript>\n${transcript}\n</transcript>`;
    }
    return p;
  }

  const transcriptOf = subs => subs.map((s, i) => `[${i + 1}] ${s.text.replace(/\n/g, ' / ')}`).join('\n');

  function buildUserPrompt({ subs, out, ids, tgt, fullContext, windowSize = 5 }) {
    const first = ids[0], last = ids[ids.length - 1];
    let p = '';
    // Traducciones anteriores ya hechas, para mantener coherencia
    const prev = [];
    for (let i = first - 1; i >= 0 && prev.length < 6; i--) {
      if (out[i]) prev.unshift(`[${i + 1}] ${subs[i].text.replace(/\n/g, ' / ')} → ${out[i].replace(/\n/g, ' / ')}`);
      else if (fullContext) break;
    }
    if (prev.length) p += `Previous subtitles already translated (keep terminology and style consistent):\n${prev.join('\n')}\n\n`;
    if (!fullContext) {
      const before = [], after = [];
      for (let i = Math.max(0, first - windowSize); i < first; i++) if (!out[i]) before.push(`[${i + 1}] ${subs[i].text.replace(/\n/g, ' / ')}`);
      for (let i = last + 1; i < Math.min(subs.length, last + 1 + windowSize); i++) after.push(`[${i + 1}] ${subs[i].text.replace(/\n/g, ' / ')}`);
      if (before.length) p += `Context before (do not translate):\n${before.join('\n')}\n\n`;
      if (after.length) p += `Context after (do not translate):\n${after.join('\n')}\n\n`;
    }
    const items = ids.map(i => ({ id: i + 1, text: subs[i].text }));
    p += `Translate these ${items.length} subtitles into ${langPrompt(tgt)}:\n${JSON.stringify(items)}`;
    return p;
  }

  /* ---------- Lectura de la respuesta ---------- */

  function extractJSON(raw) {
    let t = String(raw || '');
    if (t.includes('<|message|>')) t = t.slice(t.lastIndexOf('<|message|>') + 11);
    t = t.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').trim();
    const tryParse = s => { try { return JSON.parse(s); } catch { return undefined; } };
    let v = tryParse(t);
    if (v === undefined) {
      const a = t.indexOf('{'), b = t.lastIndexOf('}');
      if (a >= 0 && b > a) v = tryParse(t.slice(a, b + 1));
    }
    if (v === undefined) {
      const a = t.indexOf('['), b = t.lastIndexOf(']');
      if (a >= 0 && b > a) v = tryParse(t.slice(a, b + 1));
    }
    return v;
  }

  function parseResponse(raw, wantedIds) {
    // wantedIds: índices 0-based. Devuelve Map(índice → texto)
    const res = new Map();
    const wanted = new Set(wantedIds);
    const v = extractJSON(raw);
    let arr = null;
    if (Array.isArray(v)) arr = v;
    else if (v && typeof v === 'object') {
      arr = v.t || v.translations || v.subtitles || v.items || v.result || null;
      if (!arr) {
        // {"12":"texto", ...}
        const keys = Object.keys(v);
        if (keys.length && keys.every(k => /^\d+$/.test(k))) arr = keys.map(k => ({ id: +k, text: v[k] }));
      }
    }
    if (Array.isArray(arr)) {
      for (const e of arr) {
        if (!e || typeof e !== 'object') continue;
        const id = parseInt(e.id ?? e.n ?? e.number, 10);
        let text = e.text ?? e.translation ?? e.t;
        if (!Number.isFinite(id) || typeof text !== 'string') continue;
        const idx = id - 1;
        if (wanted.has(idx)) res.set(idx, tidy(text));
      }
    } else {
      // Plan B: líneas tipo "[12] texto" o "12. texto"
      for (const line of String(raw || '').split('\n')) {
        const m = line.match(/^\s*\[?(\d+)[\].:)]\s*(.+)$/);
        if (m && wanted.has(+m[1] - 1)) res.set(+m[1] - 1, tidy(m[2]));
      }
    }
    return res;
  }

  function tidy(text) {
    return String(text).replace(/\\n/g, '\n')
      .split('\n').map(l => l.trim()).filter(Boolean).join('\n').trim();
  }

  /* ---------- Exportar ---------- */

  function toSRT(subs, texts) {
    let n = 0, out = '';
    subs.forEach((s, i) => {
      const t = (texts[i] || '').trim();
      if (!t) return;
      out += `${++n}\n${s.start} --> ${s.end}\n${t}\n\n`;
    });
    return out;
  }
  function toVTT(subs, texts) {
    let out = 'WEBVTT\n\n';
    subs.forEach((s, i) => {
      const t = (texts[i] || '').trim();
      if (!t) return;
      out += `${s.start.replace(',', '.')} --> ${s.end.replace(',', '.')}\n${t}\n\n`;
    });
    return out;
  }

  /* ---------- Modelos y precios ---------- */

  // Precios en USD por millón de tokens (aproximados, noviembre 2026)
  const CLAUDE_MODELS = [
    { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5 · recomendado', price: { in: 2, out: 10, cr: 0.10, cw: 2.5 } },
    { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5 · rápido y muy barato', price: { in: 0.10, out: 0.50, cr: 0.01, cw: 0.125 } },
    { id: 'claude-opus-5-5', name: 'Claude Opus 5.5 · máxima calidad', price: { in: 4, out: 20, cr: 0.40, cw: 5 } },
  ];

  const JUNK = /(:|image|audio|vision|-vl\b|search|online|tts|realtime|transcri|embed|guard|moderation|codex|instruct|oss|-lite|nano|dall|whisper|computer|omni|prime|-exp|coder|math|distill|prover)/i;

  const OR_FAMILIES = [
    { re: /^google\/gemini-[\d.]+-flash/, tag: 'Gemini Flash', hint: 'rápido, barato y muy bueno traduciendo' },
    { re: /^anthropic\/claude-sonnet/, tag: 'Claude Sonnet', hint: 'muy natural' },
    { re: /^google\/gemini-(?![\d.]+-flash)/, tag: 'Gemini', hint: 'gama alta de Google' },
    { re: /^anthropic\/claude-haiku/, tag: 'Claude Haiku', hint: 'baratísimo' },
    { re: /^openai\/gpt-/, tag: 'GPT', hint: 'OpenAI', extraJunk: /mini|chat|-pro\b/ },
    { re: /^deepseek\/deepseek-/, tag: 'DeepSeek', hint: 'muy barato', extraJunk: /r1/ },
    { re: /^qwen\/qwen[\d.]*-max/, tag: 'Qwen Max', hint: 'muy bueno con el chino' },
  ];

  function pickRecommended(models, families) {
    // models: [{id, name, created}] → lista de recomendados (el más reciente de cada familia)
    const rec = [];
    for (const f of families) {
      const cands = models.filter(m => f.re.test(m.id) && !JUNK.test(m.id) && !(f.extraJunk && f.extraJunk.test(m.id)));
      if (!cands.length) continue;
      cands.sort((a, b) => (/preview/i.test(a.id) - /preview/i.test(b.id)) || ((b.created || 0) - (a.created || 0)));
      rec.push({ ...cands[0], tag: f.tag, hint: f.hint });
    }
    return rec;
  }

  function pickOpenAI(models) {
    const c = models.filter(m => /^(gpt-|o\d)/.test(m.id) && !JUNK.test(m.id) && !/\d{4}-\d{2}-\d{2}|preview|mini|chat-latest/.test(m.id));
    c.sort((a, b) => (b.created || 0) - (a.created || 0));
    return c.slice(0, 3);
  }

  const estTokens = s => Math.ceil(String(s).length / 3.2);

  /* ---------- Plan de lotes ---------- */

  function makeBatches(indices, size) {
    // Agrupa índices consecutivos en lotes de "size"; corta si hay huecos
    const batches = [];
    let cur = [];
    for (const i of indices) {
      if (cur.length && (cur.length >= size || i !== cur[cur.length - 1] + 1)) { batches.push(cur); cur = []; }
      cur.push(i);
    }
    if (cur.length) batches.push(cur);
    return batches;
  }

  return {
    VERSION, LANGS, langName, langPrompt, isCJK, normTime, parseSRT, parseVTT, parseSubtitles,
    lineLabel, analyzeSpeakers, stripSpeakers, detectLang, defaultTarget, parseGlossary,
    buildSystemPrompt, buildUserPrompt, transcriptOf, extractJSON, parseResponse, toSRT, toVTT,
    CLAUDE_MODELS, OR_FAMILIES, pickRecommended, pickOpenAI, estTokens, makeBatches,
  };
})();

/* =========================================================================
 * 2. CONEXIÓN CON LOS PROVEEDORES
 * ========================================================================= */
const Api = (() => {

  const PROVIDERS = {
    anthropic: { label: 'Claude (Anthropic)', key: true, temp: false, keyUrl: 'https://console.anthropic.com/settings/keys' },
    openrouter: { label: 'OpenRouter (Gemini, GPT, DeepSeek…)', key: true, temp: true, keyUrl: 'https://openrouter.ai/keys' },
    openai: { label: 'OpenAI (ChatGPT)', key: true, temp: true, keyUrl: 'https://platform.openai.com/api-keys' },
    lmstudio: { label: 'LM Studio (local, gratis)', key: false, temp: true },
  };

  // Ajustes que un modelo ha rechazado (se aprenden y se recuerdan)
  let quirks = {};
  try { quirks = JSON.parse(localStorage.getItem('ts2.quirks') || '{}'); } catch { /* sin localStorage */ }
  const saveQuirks = () => { try { localStorage.setItem('ts2.quirks', JSON.stringify(quirks)); } catch { } };

  class ApiError extends Error {
    constructor(msg, { status = 0, fatal = false, retryAfter = 0 } = {}) { super(msg); this.status = status; this.fatal = fatal; this.retryAfter = retryAfter; }
  }

  const sleep = (ms, signal) => new Promise((res, rej) => {
    const t = setTimeout(res, ms);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('abort', 'AbortError')); }, { once: true });
  });

  async function readError(resp) {
    let txt = '';
    try { txt = await resp.text(); } catch { }
    try { const j = JSON.parse(txt); return j.error?.message || j.message || j.error || txt; } catch { return txt; }
  }

  function friendly(status, msg) {
    if (status === 401 || status === 403) return 'La clave de API no es válida o no tiene permiso para este modelo.';
    if (status === 402) return 'No queda saldo en la cuenta del proveedor.';
    if (status === 404) return 'El modelo no existe o ya no está disponible. Elige otro.';
    return `Error ${status}: ${String(msg).slice(0, 300)}`;
  }

  function lmBase(cfg) { return (cfg.lmUrl || 'http://127.0.0.1:1234').replace(/\/+$/, '').replace(/\/v1$/, ''); }

  function buildRequest(p, cfg, model, system, user, q) {
    if (p === 'anthropic') {
      const body = {
        model, max_tokens: 32000,
        system: [{ type: 'text', text: system, ...(q.noCache ? {} : { cache_control: { type: 'ephemeral' } }) }],
        messages: [{ role: 'user', content: user }],
      };
      if (!q.noEffort) body.output_config = { effort: 'low' };
      return {
        url: 'https://api.anthropic.com/v1/messages',
        headers: { 'content-type': 'application/json', 'x-api-key': cfg.keys.anthropic, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body,
      };
    }
    const body = { model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
    if (cfg.temperature != null && !q.noTemp) body.temperature = cfg.temperature;
    let url, headers = { 'content-type': 'application/json' };
    if (p === 'openrouter') {
      url = 'https://openrouter.ai/api/v1/chat/completions';
      headers.authorization = `Bearer ${cfg.keys.openrouter}`;
      headers['X-Title'] = 'Traductor de subtitulos';
      if (typeof location !== 'undefined' && /^https?:/.test(location.protocol)) headers['HTTP-Referer'] = location.origin;
      if (/^anthropic\//.test(model) && !q.noCache) body.messages[0].content = [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
      if (!q.noReasoning) body.reasoning = { effort: 'low', exclude: true };
      body.usage = { include: true };
    } else if (p === 'openai') {
      url = 'https://api.openai.com/v1/chat/completions';
      headers.authorization = `Bearer ${cfg.keys.openai}`;
      if (!q.noJson) body.response_format = { type: 'json_object' };
      if (!q.noReasoning) body.reasoning_effort = 'low';
    } else {
      url = `${lmBase(cfg)}/v1/chat/completions`;
      body.stream = false;
    }
    return { url, headers, body };
  }

  function learnFrom(msg, q, body) {
    const m = String(msg).toLowerCase();
    const changes = [];
    if (/temperature/.test(m) && ('temperature' in body)) { q.noTemp = true; changes.push('temperatura'); }
    if (/effort|output_config/.test(m) && (body.output_config || body.reasoning_effort || body.reasoning)) { q.noEffort = true; q.noReasoning = true; changes.push('nivel de razonamiento'); }
    if (/reasoning/.test(m) && (body.reasoning || body.reasoning_effort)) { q.noReasoning = true; changes.push('razonamiento'); }
    if (/response_format|json_object|json mode/.test(m) && body.response_format) { q.noJson = true; changes.push('modo JSON'); }
    if (/cache_control/.test(m)) { q.noCache = true; changes.push('caché'); }
    return changes;
  }

  /** Una petición de traducción. Devuelve {text, usage, truncated, refusal} */
  async function complete({ provider, cfg, model, system, user, signal, onNotice }) {
    const qk = provider + ':' + model;
    const q = quirks[qk] || (quirks[qk] = {});
    let tries = 0;
    for (; ;) {
      tries++;
      const req = buildRequest(provider, cfg, model, system, user, q);
      let resp;
      try {
        resp = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body), signal });
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        if (provider === 'lmstudio') throw new ApiError('No se puede conectar con LM Studio. Comprueba que el servidor está arrancado y que «Enable CORS» está activado.', { fatal: true });
        if (tries > 5) throw new ApiError('Sin conexión con el proveedor.', { fatal: true });
        onNotice?.(`Problema de conexión; reintentando (${tries}/5)…`);
        await sleep(2000 * tries, signal);
        continue;
      }
      if (resp.ok) {
        const data = await resp.json();
        return normalize(provider, data);
      }
      const msg = await readError(resp);
      if ((resp.status === 400 || resp.status === 422) && tries <= 4) {
        const changed = learnFrom(msg, q, req.body);
        if (changed.length) {
          saveQuirks();
          if (changed.includes('temperatura')) onNotice?.('Este modelo no deja ajustar la temperatura: se usará la suya.');
          continue;
        }
      }
      if ([408, 409, 425, 429, 500, 502, 503, 504, 529].includes(resp.status) && tries <= 6) {
        const ra = parseFloat(resp.headers.get('retry-after')) || 0;
        const wait = Math.min(60, ra || 2 ** tries) * 1000 + Math.random() * 500;
        onNotice?.(resp.status === 429 ? `Límite de peticiones del proveedor; espero ${Math.round(wait / 1000)} s…` : `El proveedor está saturado (${resp.status}); espero ${Math.round(wait / 1000)} s…`);
        await sleep(wait, signal);
        continue;
      }
      throw new ApiError(friendly(resp.status, msg), { status: resp.status, fatal: [400, 401, 402, 403, 404].includes(resp.status) });
    }
  }

  function normalize(provider, data) {
    if (provider === 'anthropic') {
      const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
      const u = data.usage || {};
      return {
        text, truncated: data.stop_reason === 'max_tokens', refusal: data.stop_reason === 'refusal',
        usage: { in: u.input_tokens || 0, out: u.output_tokens || 0, cr: u.cache_read_input_tokens || 0, cw: u.cache_creation_input_tokens || 0 },
      };
    }
    const c = data.choices?.[0] || {};
    const u = data.usage || {};
    const cached = u.prompt_tokens_details?.cached_tokens || 0;
    return {
      text: c.message?.content || '', truncated: c.finish_reason === 'length', refusal: c.finish_reason === 'content_filter',
      usage: { in: (u.prompt_tokens || 0) - cached, out: u.completion_tokens || 0, cr: cached, cw: 0, cost: typeof u.cost === 'number' ? u.cost : null },
    };
  }

  async function listModels(provider, cfg) {
    if (provider === 'anthropic') return { rec: Core.CLAUDE_MODELS, all: [] };
    if (provider === 'openrouter') {
      const r = await fetch('https://openrouter.ai/api/v1/models');
      if (!r.ok) throw new Error('No se pudo cargar la lista de OpenRouter');
      const data = (await r.json()).data || [];
      const all = data.map(m => ({
        id: m.id, name: m.name || m.id, created: m.created,
        temp: Array.isArray(m.supported_parameters) ? m.supported_parameters.includes('temperature') : undefined,
        price: m.pricing ? { in: +m.pricing.prompt * 1e6, out: +m.pricing.completion * 1e6, cr: +(m.pricing.input_cache_read || m.pricing.prompt) * 1e6, cw: +(m.pricing.input_cache_write || m.pricing.prompt) * 1e6 } : null,
      }));
      const rec = Core.pickRecommended(all, Core.OR_FAMILIES).map(m => ({ ...m, name: `${m.name.replace(/^[^:]+:\s*/, '')} · ${m.hint}` }));
      return { rec, all: all.sort((a, b) => a.id.localeCompare(b.id)) };
    }
    if (provider === 'openai') {
      if (!cfg.keys.openai) return { rec: [], all: [] };
      const r = await fetch('https://api.openai.com/v1/models', { headers: { authorization: `Bearer ${cfg.keys.openai}` } });
      if (!r.ok) throw new Error(friendly(r.status, await readError(r)));
      const all = ((await r.json()).data || []).map(m => ({ id: m.id, name: m.id, created: m.created, temp: /^(gpt-[56]|o\d)/.test(m.id) ? false : undefined })).filter(m => /^(gpt-|o\d)/.test(m.id));
      return { rec: Core.pickOpenAI(all), all: all.sort((a, b) => a.id.localeCompare(b.id)) };
    }
    // LM Studio
    const r = await fetch(`${lmBase(cfg)}/v1/models`);
    if (!r.ok) throw new Error('LM Studio no responde');
    const all = ((await r.json()).data || []).map(m => ({ id: m.id, name: m.id })).filter(m => !/embed/i.test(m.id));
    const rec = all.filter(m => /(qwen|gemma|translat|mistral|llama|deepseek|hunyuan)/i.test(m.id));
    return { rec: rec.length ? rec : all, all };
  }

  return { PROVIDERS, complete, listModels, ApiError, sleep };
})();

/* =========================================================================
 * 3. MOTOR DE TRADUCCIÓN (lotes, paralelo, reintentos)
 * ========================================================================= */
const Engine = (() => {

  /**
   * job = { subs, out, st, src, tgt, provider, model, cfg, notes, glossary,
   *         batchSize, concurrency, fullContext, maxChars, indices, signal,
   *         onRow(i), onUsage(u), onNotice(msg), onBatch() }
   */
  async function run(job) {
    const { subs, out, st } = job;
    const transcript = job.fullContext ? Core.transcriptOf(subs) : '';
    const system = Core.buildSystemPrompt({ src: job.src, tgt: job.tgt, maxChars: job.maxChars, notes: job.notes, glossary: job.glossary, transcript });

    // Subtítulos vacíos (p. ej. solo etiqueta de hablante) se dan por hechos
    const todo = [];
    for (const i of job.indices) {
      if (!subs[i].text.trim()) { out[i] = ''; st[i] = 'done'; job.onRow?.(i); continue; }
      todo.push(i);
    }
    const queue = Core.makeBatches(todo, job.batchSize).map(ids => ({ ids, attempt: 0 }));
    let fatal = null;

    async function worker() {
      while (queue.length && !fatal && !job.signal.aborted) {
        const b = queue.shift();
        const pending = b.ids.filter(i => st[i] !== 'done');
        if (!pending.length) continue;
        pending.forEach(i => { st[i] = 'working'; job.onRow?.(i); });
        try {
          const user = Core.buildUserPrompt({ subs, out, ids: pending, tgt: job.tgt, fullContext: job.fullContext });
          const r = await Api.complete({ provider: job.provider, cfg: job.cfg, model: job.model, system, user, signal: job.signal, onNotice: job.onNotice });
          job.onUsage?.(r.usage);
          const got = Core.parseResponse(r.text, pending);
          for (const [i, text] of got) { out[i] = text; st[i] = 'done'; job.onRow?.(i); }
          const missing = pending.filter(i => !got.has(i));
          if (missing.length) {
            if (r.truncated && missing.length > 4) {
              // respuesta cortada: partir el resto en dos lotes más pequeños
              const h = Math.ceil(missing.length / 2);
              queue.unshift({ ids: missing.slice(0, h), attempt: b.attempt }, { ids: missing.slice(h), attempt: b.attempt });
              missing.forEach(i => { st[i] = 'pending'; job.onRow?.(i); });
            } else if (b.attempt < 2) {
              queue.unshift({ ids: missing, attempt: b.attempt + 1 });
              missing.forEach(i => { st[i] = 'pending'; job.onRow?.(i); });
              if (r.refusal) job.onNotice?.('El modelo se ha negado a traducir algunas líneas; reintento.');
            } else {
              missing.forEach(i => { st[i] = 'error'; job.onRow?.(i); });
              job.onNotice?.(`${missing.length} subtítulo(s) no se han podido traducir. Están marcados en rojo: puedes reintentarlos.`);
            }
          }
        } catch (e) {
          pending.forEach(i => { if (st[i] === 'working') { st[i] = 'pending'; job.onRow?.(i); } });
          if (e.name === 'AbortError') return;
          if (e.fatal || b.attempt >= 2) { fatal = e; return; }
          queue.unshift({ ids: pending, attempt: b.attempt + 1 });
          job.onNotice?.(e.message);
        }
        job.onBatch?.();
      }
    }

    const n = Math.max(1, Math.min(job.concurrency || 1, queue.length || 1));
    await Promise.all(Array.from({ length: n }, (_, k) => Api.sleep(k * 400).then(worker)));
    if (fatal) throw fatal;
  }

  return { run };
})();

if (typeof module !== 'undefined') module.exports = { Core, Api, Engine };

/* =========================================================================
 * 4. INTERFAZ
 * ========================================================================= */
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => {

  const $ = s => document.querySelector(s);
  const store = {
    get(k, d) { try { const v = localStorage.getItem('ts2.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('ts2.' + k, JSON.stringify(v)); } catch { } },
    del(k) { try { localStorage.removeItem('ts2.' + k); } catch { } },
  };

  const WARGAME_GLOSSARY = `# Glosario de ejemplo para wargames (edítalo a tu gusto)
counter = ficha
hex = hexágono
zone of control (ZOC) = zona de control (ZdC)
combat results table (CRT) = tabla de resultados de combate (TRC)
line of sight (LOS) = línea de visión (LdV)
die roll modifier (DRM) = modificador a la tirada
step loss = pérdida de paso
supply = suministro
victory points = puntos de victoria
turn track = registro de turnos
card-driven game = juego de cartas como motor
rulebook = reglamento
playbook = libreto de escenarios
chit = marcador
stacking = apilamiento`;

  // ---------- Estado ----------
  const S = {
    fileName: '', subs: [], out: [], st: [], speakers: { labels: [], affected: 0 },
    removeSpeakers: true, src: 'en', tgt: 'es', running: false, ctrl: null,
    usage: { in: 0, out: 0, cr: 0, cw: 0, cost: 0, req: 0 },
    models: { rec: [], all: [] },
  };
  const cfg = {
    keys: store.get('keys', { anthropic: '', openrouter: '', openai: '' }),
    lmUrl: store.get('lmUrl', 'http://127.0.0.1:1234'),
    temperature: 0.5,
  };
  // Las claves pueden guardarse solo para esta sesión
  if (!store.get('rememberKeys', true)) {
    try { Object.assign(cfg.keys, JSON.parse(sessionStorage.getItem('ts2.keys') || '{}')); } catch { }
  }

  const el = {
    drop: $('#drop'), file: $('#file'), fileInfo: $('#fileInfo'), speakerBox: $('#speakerBox'),
    restore: $('#restore'), src: $('#src'), tgt: $('#tgt'), chips: $('#tgtChips'),
    provider: $('#provider'), model: $('#model'), showAll: $('#showAll'), reload: $('#reloadModels'),
    keyWarn: $('#keyWarn'), temp: $('#temp'), tempVal: $('#tempVal'), tempNote: $('#tempNote'),
    notes: $('#notes'), glossary: $('#glossary'), sampleGloss: $('#sampleGloss'),
    batch: $('#batch'), conc: $('#conc'), full: $('#fullCtx'), maxChars: $('#maxChars'),
    estimate: $('#estimate'), start: $('#start'), stop: $('#stop'), retry: $('#retryErrors'),
    bar: $('#bar'), progressText: $('#progressText'), stats: $('#stats'),
    table: $('#rows'), filter: $('#filter'), exp: $('#exportBar'),
    keysDlg: $('#keysDlg'), toasts: $('#toasts'),
    findText: $('#findText'), replText: $('#replText'), findCase: $('#findCase'), findWord: $('#findWord'),
    replBtn: $('#replBtn'), findCount: $('#findCount'), ctxBox: $('#ctxBox'), ctxSummary: $('#ctxSummary'),
  };

  // ---------- Avisos (sustituyen a alert) ----------
  function toast(msg, type = 'info', ms = 6000) {
    const d = document.createElement('div');
    d.className = `toast ${type}`;
    d.textContent = msg;
    el.toasts.appendChild(d);
    setTimeout(() => d.classList.add('out'), ms);
    setTimeout(() => d.remove(), ms + 400);
  }
  let lastNotice = 0;
  const notice = msg => { if (Date.now() - lastNotice > 1500) { lastNotice = Date.now(); toast(msg, 'warn'); } };

  // ---------- Idiomas ----------
  for (const [code, name] of Core.LANGS) {
    el.src.add(new Option(name, code));
    el.tgt.add(new Option(name, code));
  }
  el.src.value = 'en'; el.tgt.value = 'es';
  el.src.addEventListener('change', () => { S.src = el.src.value; if (S.tgt === S.src) setTarget(Core.defaultTarget(S.src)); updateUI(); });
  el.tgt.addEventListener('change', () => setTarget(el.tgt.value));
  el.chips.addEventListener('click', e => { const c = e.target.closest('[data-lang]'); if (c) setTarget(c.dataset.lang); });
  function setTarget(code) {
    S.tgt = code; el.tgt.value = code;
    el.chips.querySelectorAll('[data-lang]').forEach(c => c.classList.toggle('on', c.dataset.lang === code));
    el.maxChars.placeholder = Core.isCJK(code) ? '16' : '42';
    updateUI(); saveProject();
  }

  // ---------- Proveedor y modelos ----------
  for (const [id, p] of Object.entries(Api.PROVIDERS)) el.provider.add(new Option(p.label, id));
  el.provider.value = store.get('provider', 'anthropic');
  el.provider.addEventListener('change', () => { store.set('provider', el.provider.value); el.conc.value = el.provider.value === 'lmstudio' ? '1' : '3'; loadModels(); });
  el.model.addEventListener('change', () => { const m = store.get('model', {}); m[el.provider.value] = el.model.value; store.set('model', m); updateUI(); });
  el.showAll.addEventListener('change', fillModels);
  el.reload.addEventListener('click', loadModels);

  async function loadModels() {
    const p = el.provider.value;
    el.model.innerHTML = '<option>Cargando modelos…</option>';
    el.showAll.parentElement.hidden = p === 'anthropic';
    try {
      S.models = await Api.listModels(p, cfg);
    } catch (e) {
      S.models = { rec: [], all: [] };
      toast(e.message || 'No se pudo cargar la lista de modelos', 'error');
    }
    fillModels();
  }
  function fillModels() {
    const p = el.provider.value;
    const saved = store.get('model', {})[p];
    el.model.innerHTML = '';
    const g1 = document.createElement('optgroup'); g1.label = 'Recomendados para traducir';
    S.models.rec.forEach(m => g1.appendChild(new Option(m.name, m.id)));
    if (S.models.rec.length) el.model.appendChild(g1);
    if (el.showAll.checked && S.models.all.length) {
      const g2 = document.createElement('optgroup'); g2.label = 'Todos';
      S.models.all.forEach(m => g2.appendChild(new Option(m.name, m.id)));
      el.model.appendChild(g2);
    }
    if (!el.model.options.length) {
      el.model.appendChild(new Option(p === 'lmstudio' ? 'Arranca LM Studio y pulsa ↻' : p === 'openai' ? 'Añade tu clave de OpenAI y pulsa ↻' : 'Sin modelos', ''));
    }
    if (saved && [...el.model.options].some(o => o.value === saved)) el.model.value = saved;
    updateUI();
  }
  const currentModel = () => [...S.models.rec, ...S.models.all].find(m => m.id === el.model.value);

  // ---------- Temperatura ----------
  el.temp.value = store.get('temperature', 0.5);
  el.temp.addEventListener('input', () => { store.set('temperature', +el.temp.value); updateUI(); });

  // ---------- Notas, glosario y opciones ----------
  function updateCtxSummary() {
    const g = Core.parseGlossary(el.glossary.value).length;
    const n = el.notes.value.trim();
    const parts = [];
    if (n) parts.push('con notas del vídeo');
    if (g) parts.push(`${g} término${g === 1 ? '' : 's'} en el glosario`);
    el.ctxSummary.textContent = parts.length ? parts.join(' · ') : 'opcional, pero mejora mucho el resultado';
  }
  el.glossary.value = store.get('glossary', '');
  el.ctxBox.open = store.get('ctxOpen', !!el.glossary.value.trim());
  el.ctxBox.addEventListener('toggle', () => store.set('ctxOpen', el.ctxBox.open));
  el.glossary.addEventListener('input', () => { store.set('glossary', el.glossary.value); updateCtxSummary(); updateUI(); });
  el.sampleGloss.addEventListener('click', () => {
    if (el.glossary.value.includes('counter = ficha')) return toast('El glosario de ejemplo ya está añadido.', 'info', 2500);
    el.glossary.value = (el.glossary.value.trim() ? el.glossary.value.trim() + '\n' : '') + WARGAME_GLOSSARY;
    store.set('glossary', el.glossary.value); updateCtxSummary(); updateUI();
  });
  el.notes.addEventListener('input', () => { updateCtxSummary(); updateUI(); saveProject(); });
  const adv = store.get('adv', { batch: 40, conc: 3, full: true, maxChars: '' });
  el.batch.value = adv.batch; el.conc.value = el.provider.value === 'lmstudio' ? 1 : adv.conc; el.full.checked = adv.full; el.maxChars.value = adv.maxChars;
  [el.batch, el.conc, el.full, el.maxChars].forEach(x => x.addEventListener('change', () => {
    store.set('adv', { batch: +el.batch.value, conc: +el.conc.value, full: el.full.checked, maxChars: el.maxChars.value });
    updateUI();
  }));

  // ---------- Claves ----------
  $('#openKeys').addEventListener('click', openKeys);
  el.keyWarn.addEventListener('click', e => { if (e.target.closest('button')) openKeys(); });
  function openKeys() {
    $('#kAnthropic').value = cfg.keys.anthropic || '';
    $('#kOpenrouter').value = cfg.keys.openrouter || '';
    $('#kOpenai').value = cfg.keys.openai || '';
    $('#kLm').value = cfg.lmUrl;
    $('#kRemember').checked = store.get('rememberKeys', true);
    el.keysDlg.showModal();
    const focusId = { anthropic: 'kAnthropic', openrouter: 'kOpenrouter', openai: 'kOpenai', lmstudio: 'kLm' }[el.provider.value];
    document.getElementById(focusId)?.focus();
  }
  $('#keysSave').addEventListener('click', e => {
    e.preventDefault();
    cfg.keys = { anthropic: $('#kAnthropic').value.trim(), openrouter: $('#kOpenrouter').value.trim(), openai: $('#kOpenai').value.trim() };
    cfg.lmUrl = $('#kLm').value.trim() || 'http://127.0.0.1:1234';
    const remember = $('#kRemember').checked;
    store.set('rememberKeys', remember);
    store.set('lmUrl', cfg.lmUrl);
    if (remember) { store.set('keys', cfg.keys); try { sessionStorage.removeItem('ts2.keys'); } catch { } }
    else { store.del('keys'); try { sessionStorage.setItem('ts2.keys', JSON.stringify(cfg.keys)); } catch { } }
    el.keysDlg.close();
    toast('Ajustes guardados', 'ok', 2500);
    loadModels();
  });
  $('#keysCancel').addEventListener('click', e => { e.preventDefault(); el.keysDlg.close(); });
  document.querySelectorAll('[data-eye]').forEach(b => b.addEventListener('click', () => {
    const i = document.getElementById(b.dataset.eye); i.type = i.type === 'password' ? 'text' : 'password';
  }));

  // ---------- Carga de archivos ----------
  el.drop.addEventListener('click', () => el.file.click());
  el.drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.file.click(); } });
  el.drop.addEventListener('dragover', e => { e.preventDefault(); el.drop.classList.add('over'); });
  el.drop.addEventListener('dragleave', () => el.drop.classList.remove('over'));
  el.drop.addEventListener('drop', e => { e.preventDefault(); el.drop.classList.remove('over'); if (e.dataTransfer.files[0]) openFile(e.dataTransfer.files[0]); });
  el.file.addEventListener('change', () => { if (el.file.files[0]) openFile(el.file.files[0]); el.file.value = ''; });

  async function openFile(file) {
    if (S.running) return toast('Para la traducción antes de cargar otro archivo.', 'warn');
    el.restore.hidden = true;
    const text = await file.text();
    if (/\.(json|wrk)$/i.test(file.name)) return loadProjectFile(text, file.name);
    const subs = Core.parseSubtitles(text, file.name);
    if (!subs.length) return toast('No he encontrado subtítulos en ese archivo. ¿Es un .srt o .vtt?', 'error');
    S.fileName = file.name.replace(/\.(srt|vtt)$/i, '');
    S.subs = subs; S.out = subs.map(() => ''); S.st = subs.map(() => 'pending');
    S.usage = { in: 0, out: 0, cr: 0, cw: 0, cost: 0, req: 0 };
    S.speakers = Core.analyzeSpeakers(subs);
    S.removeSpeakers = true;
    applySpeakers();
    S.src = Core.detectLang(S.subs); el.src.value = S.src;
    setTarget(Core.defaultTarget(S.src));
    el.notes.value = '';
    afterLoad();
    toast(`${subs.length} subtítulos cargados · idioma detectado: ${Core.langName(S.src)}`, 'ok', 3500);
  }

  function applySpeakers() {
    const has = S.speakers.labels.length || S.speakers.arrows || S.speakers.vtags;
    S.subs.forEach(s => { s.text = (has && S.removeSpeakers) ? Core.stripSpeakers(s.raw, S.speakers.labels) : s.raw; });
  }

  function renderSpeakerBox() {
    const sp = S.speakers;
    const has = sp.labels.length || sp.arrows || sp.vtags;
    el.speakerBox.hidden = !has;
    if (!has) return;
    const list = sp.labels.slice(0, 8).map(l => `<span class="tag">${esc(l.label)} <b>${l.count}</b></span>`).join(' ');
    el.speakerBox.innerHTML = `
      <label class="check"><input type="checkbox" id="spkToggle" ${S.removeSpeakers ? 'checked' : ''}>
      <span><b>Quitar las etiquetas de hablante</b> (${sp.affected} subtítulos)</span></label>
      <div class="tags">${list}${sp.arrows ? ' <span class="tag">&gt;&gt; <b>' + sp.arrows + '</b></span>' : ''}${sp.vtags ? ' <span class="tag">&lt;v&gt; <b>' + sp.vtags + '</b></span>' : ''}</div>`;
    $('#spkToggle').addEventListener('change', e => {
      if (S.st.some(x => x === 'done')) toast('Ojo: los subtítulos ya traducidos no cambian. Retradúcelos si hace falta.', 'warn');
      S.removeSpeakers = e.target.checked; applySpeakers(); renderTable(); saveProject();
    });
  }

  function afterLoad() {
    hideWelcome();
    updateCtxSummary();
    el.fileInfo.innerHTML = `<b>${esc(S.fileName)}</b> · ${S.subs.length} subtítulos · ${S.subs[S.subs.length - 1]?.end.slice(0, 8) || ''}`;
    el.fileInfo.hidden = false;
    document.body.classList.add('loaded');
    renderSpeakerBox();
    renderTable();
    updateUI();
    saveProject();
  }

  // ---------- Proyecto (autoguardado y archivo) ----------
  let saveT = null;
  function projectData() {
    return {
      app: 'traductor-subtitulos', version: 2, fileName: S.fileName, src: S.src, tgt: S.tgt, notes: el.notes.value,
      removeSpeakers: S.removeSpeakers, speakers: S.speakers,
      subs: S.subs.map(s => ({ start: s.start, end: s.end, raw: s.raw })),
      out: S.out, st: S.st.map(x => (x === 'working' ? 'pending' : x)),
    };
  }
  function saveProject() {
    if (!S.subs.length) return;
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      try { localStorage.setItem('ts2.project', JSON.stringify(projectData())); }
      catch { /* archivo demasiado grande para el navegador: se ignora */ }
    }, 400);
  }
  function restoreProject(p) {
    if (p.version === 2) {
      S.fileName = p.fileName; S.subs = p.subs.map(s => ({ ...s, text: s.raw }));
      S.out = p.out; S.st = p.st; S.speakers = p.speakers || { labels: [], affected: 0 };
      S.removeSpeakers = p.removeSpeakers !== false; applySpeakers();
      S.src = p.src; el.src.value = p.src; el.notes.value = p.notes || '';
      setTarget(p.tgt);
    } else if (Array.isArray(p.subtitles)) {
      // Archivo .wrk de la versión 1
      S.fileName = (p.originalFileName || 'subtitulos').replace(/\.srt$/i, '');
      S.subs = p.subtitles.map(s => { const [a, b] = String(s.timecode).split('-->'); return { start: Core.normTime(a), end: Core.normTime(b), raw: s.text, text: s.text }; });
      S.out = S.subs.map((_, i) => p.translatedSubtitles?.[i] || '');
      S.st = S.out.map(t => (t ? 'done' : 'pending'));
      S.speakers = Core.analyzeSpeakers(S.subs); S.removeSpeakers = false;
      S.src = Core.detectLang(S.subs); el.src.value = S.src; setTarget(Core.defaultTarget(S.src));
    } else throw new Error('formato desconocido');
    afterLoad();
  }
  function loadProjectFile(text, name) {
    try { restoreProject(JSON.parse(text)); toast(`Proyecto «${S.fileName}» recuperado`, 'ok', 3000); }
    catch { toast(`No he podido leer ${name}`, 'error'); }
  }
  (function offerRestore() {
    const p = store.get('project', null);
    if (!p || !p.subs?.length) return;
    const done = p.st.filter(x => x === 'done').length;
    el.restore.hidden = false;
    el.restore.innerHTML = `Tienes un trabajo a medias: <b>${esc(p.fileName)}</b> (${done}/${p.subs.length} traducidos).
      <button class="btn sm" id="rYes">Recuperar</button> <button class="btn sm ghost" id="rNo">Descartar</button>`;
    $('#rYes').onclick = () => { restoreProject(p); el.restore.hidden = true; };
    $('#rNo').onclick = () => { store.del('project'); el.restore.hidden = true; };
  })();

  // ---------- Tabla ----------
  // ---------- Buscar y reemplazar ----------
  function findRegex() {
    const t = el.findText.value;
    if (!t) return null;
    const lit = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const src = el.findWord.checked ? `(?<![\\p{L}\\p{N}])${lit}(?![\\p{L}\\p{N}])` : lit;
    try { return new RegExp(src, 'gu' + (el.findCase.checked ? '' : 'i')); } catch { return null; }
  }
  const countIn = (re, text) => (text ? (text.match(re) || []).length : 0);
  function updateFindCount() {
    const re = findRegex();
    if (!re) { el.findCount.textContent = ''; el.replBtn.disabled = true; return; }
    let rows = 0, hits = 0;
    S.subs.forEach((s, i) => {
      const h = countIn(re, S.out[i]);
      if (h || countIn(re, s.text)) rows++;
      hits += h;
    });
    el.findCount.textContent = rows ? `${rows} subtítulo${rows === 1 ? '' : 's'} · ${hits} en las traducciones` : 'Sin resultados';
    el.replBtn.disabled = !hits || S.running;
  }
  let findT = null;
  [el.findText, el.findCase, el.findWord].forEach(x => x.addEventListener('input', () => {
    clearTimeout(findT); findT = setTimeout(() => { renderTable(); updateFindCount(); }, 180);
  }));
  let undoOut = null;
  el.replBtn.addEventListener('click', () => {
    const re = findRegex(); if (!re || S.running) return;
    const by = el.replText.value;
    undoOut = S.out.slice();
    let n = 0, rows = 0;
    S.out = S.out.map(t => { const h = countIn(re, t); if (!h) return t; n += h; rows++; return t.replace(re, () => by); });
    renderTable(); updateFindCount(); saveProject();
    el.findCount.innerHTML = `${n} cambio${n === 1 ? '' : 's'} en ${rows} subtítulo${rows === 1 ? '' : 's'} · <button class="link" id="undoRepl">Deshacer</button>`;
    $('#undoRepl').onclick = () => { if (!undoOut) return; S.out = undoOut; undoOut = null; renderTable(); updateFindCount(); saveProject(); toast('Reemplazo deshecho', 'ok', 2500); };
  });

  function highlight(text, re) {
    if (!re) return esc(text);
    let out = '', last = 0;
    for (const m of text.matchAll(re)) {
      out += esc(text.slice(last, m.index)) + '<mark>' + esc(m[0]) + '</mark>';
      last = m.index + m[0].length;
      if (!m[0].length) break;
    }
    return out + esc(text.slice(last));
  }

  function renderTable() {
    const f = el.filter.value;
    const re = findRegex();
    const rows = [];
    S.subs.forEach((s, i) => {
      if (f === 'pending' && S.st[i] === 'done') return;
      if (f === 'error' && S.st[i] !== 'error') return;
      if (re && !countIn(re, s.text) && !countIn(re, S.out[i])) return;
      rows.push(`<tr id="r${i}" class="${S.st[i]}">
        <td class="num">${i + 1}<small>${s.start.slice(3, 8)}</small></td>
        <td class="orig">${s.text ? highlight(s.text, re) : '<i class="muted">(vacío)</i>'}</td>
        <td class="trad"><textarea data-i="${i}" aria-label="Traducción del subtítulo ${i + 1}" rows="${Math.max(1, (S.out[i] || s.text).split('\n').length)}" placeholder="${S.st[i] === 'error' ? 'No se pudo traducir' : 'Traducción…'}">${esc(S.out[i] || '')}</textarea></td>
        <td class="act"><button class="icon" data-re="${i}" title="Volver a traducir este subtítulo" aria-label="Volver a traducir el subtítulo ${i + 1}">↻</button></td></tr>`);
    });
    el.table.innerHTML = rows.join('') || `<tr><td colspan="4" class="muted center">${re ? 'Ningún subtítulo coincide con la búsqueda' : 'Nada que mostrar'}</td></tr>`;
  }
  function updateRow(i) {
    const tr = document.getElementById('r' + i);
    if (!tr) return;
    tr.className = S.st[i];
    const ta = tr.querySelector('textarea');
    if (document.activeElement !== ta) { ta.value = S.out[i] || ''; ta.rows = Math.max(1, (S.out[i] || '').split('\n').length); }
  }
  el.filter.addEventListener('change', renderTable);
  el.table.addEventListener('input', e => {
    const ta = e.target.closest('textarea'); if (!ta) return;
    const i = +ta.dataset.i;
    S.out[i] = ta.value; S.st[i] = ta.value.trim() ? 'done' : 'pending';
    ta.closest('tr').className = S.st[i];
    ta.rows = Math.max(1, ta.value.split('\n').length);
    updateProgress(); saveProject();
    if (el.findText.value) { clearTimeout(findT); findT = setTimeout(updateFindCount, 300); }
  });
  el.table.addEventListener('click', e => {
    const b = e.target.closest('[data-re]'); if (!b) return;
    const i = +b.dataset.re;
    if (S.running) return toast('Espera a que termine la traducción en curso.', 'warn');
    S.out[i] = ''; S.st[i] = 'pending'; updateRow(i);
    start([i]);
  });

  // ---------- Traducción ----------
  el.start.addEventListener('click', () => start());
  el.stop.addEventListener('click', () => { S.ctrl?.abort(); });
  el.retry.addEventListener('click', () => start(S.st.map((x, i) => (x === 'error' ? i : -1)).filter(i => i >= 0)));

  function settings() {
    const p = el.provider.value;
    const maxChars = +el.maxChars.value || (Core.isCJK(S.tgt) ? 16 : 42);
    const transcriptTokens = Core.estTokens(Core.transcriptOf(S.subs));
    // En local el contexto completo solo si el archivo es pequeño
    const fullAllowed = p === 'lmstudio' ? transcriptTokens < 6000 : transcriptTokens < 150000;
    return {
      provider: p, model: el.model.value, maxChars,
      fullContext: el.full.checked && fullAllowed, fullAllowed, transcriptTokens,
      batchSize: +el.batch.value || 40, concurrency: p === 'lmstudio' ? 1 : (+el.conc.value || 3),
      temperature: Api.PROVIDERS[p].temp && currentModel()?.temp !== false ? +el.temp.value : null,
    };
  }

  async function start(indices) {
    if (S.running || !S.subs.length) return;
    const set = settings();
    const P = Api.PROVIDERS[set.provider];
    if (P.key && !cfg.keys[set.provider]) { openKeys(); return toast(`Falta la clave de ${P.label}`, 'warn'); }
    if (!set.model) return toast('Elige un modelo', 'warn');
    if (S.src === S.tgt) return toast('El idioma original y el de destino son el mismo', 'warn');
    indices = indices || S.st.map((x, i) => (x !== 'done' ? i : -1)).filter(i => i >= 0);
    if (!indices.length) return toast('Ya está todo traducido. Usa ↻ en una fila para retraducirla.', 'ok');
    S.running = true; S.ctrl = new AbortController();
    updateUI();
    const t0 = performance.now();
    try {
      await Engine.run({
        subs: S.subs, out: S.out, st: S.st, src: S.src, tgt: S.tgt,
        provider: set.provider, model: set.model, cfg: { ...cfg, temperature: set.temperature },
        notes: el.notes.value, glossary: el.glossary.value,
        batchSize: indices.length === 1 ? 1 : set.batchSize, concurrency: set.concurrency,
        fullContext: set.fullContext, maxChars: set.maxChars, indices, signal: S.ctrl.signal,
        onRow: i => { updateRow(i); },
        onUsage: u => addUsage(u, set),
        onNotice: notice,
        onBatch: () => { updateProgress(); saveProject(); },
      });
      if (!S.ctrl.signal.aborted) {
        const errs = S.st.filter(x => x === 'error').length;
        const secs = Math.round((performance.now() - t0) / 1000);
        if (indices.length > 1) toast(errs ? `Terminado con ${errs} subtítulo(s) sin traducir (en rojo).` : `¡Traducción completa en ${secs} s!`, errs ? 'warn' : 'ok', 8000);
      } else toast('Traducción en pausa. Pulsa «Continuar» cuando quieras.', 'info', 4000);
    } catch (e) {
      toast(e.message || String(e), 'error', 12000);
    } finally {
      S.running = false; S.ctrl = null;
      S.st.forEach((x, i) => { if (x === 'working') { S.st[i] = 'pending'; updateRow(i); } });
      updateUI(); saveProject();
    }
  }

  function addUsage(u, set) {
    S.usage.in += u.in; S.usage.out += u.out; S.usage.cr += u.cr; S.usage.cw += u.cw; S.usage.req++;
    if (u.cost != null) S.usage.cost += u.cost;
    else {
      const pr = currentModel()?.price;
      if (pr) S.usage.cost += (u.in * pr.in + u.out * pr.out + u.cr * pr.cr + u.cw * pr.cw) / 1e6;
    }
    updateProgress();
  }

  // ---------- Borrar / empezar de cero ----------
  // Doble clic de confirmación: el primero arma el botón, el segundo ejecuta
  function twoStep(btn, fn) {
    if (btn.dataset.armed) {
      clearTimeout(+btn.dataset.armed); delete btn.dataset.armed;
      btn.textContent = btn.dataset.label; btn.classList.remove('armed');
      fn();
      return;
    }
    btn.dataset.label = btn.textContent;
    btn.textContent = '¿Seguro? Pulsa otra vez';
    btn.classList.add('armed');
    btn.dataset.armed = setTimeout(() => {
      delete btn.dataset.armed; btn.textContent = btn.dataset.label; btn.classList.remove('armed');
    }, 3500);
  }
  $('#clearTrans').addEventListener('click', e => twoStep(e.currentTarget, () => {
    if (S.running) return;
    S.out = S.subs.map(() => ''); S.st = S.subs.map(() => 'pending');
    S.usage = { in: 0, out: 0, cr: 0, cw: 0, cost: 0, req: 0 };
    renderTable(); updateUI(); saveProject();
    toast('Traducción borrada. Elige otro modelo o cambia los ajustes y pulsa «Traducir».', 'ok', 5000);
  }));
  $('#resetAll').addEventListener('click', e => twoStep(e.currentTarget, () => {
    if (S.running) return;
    clearTimeout(saveT);
    Object.assign(S, { fileName: '', subs: [], out: [], st: [], speakers: { labels: [], affected: 0 }, removeSpeakers: true,
      usage: { in: 0, out: 0, cr: 0, cw: 0, cost: 0, req: 0 } });
    store.del('project');
    el.fileInfo.hidden = true; el.speakerBox.hidden = true; el.restore.hidden = true;
    el.notes.value = ''; el.filter.value = 'all'; el.findText.value = ''; el.replText.value = ''; el.findCount.textContent = '';
    updateCtxSummary();
    document.body.classList.remove('loaded');
    el.table.innerHTML = '<tr><td colspan="4" class="muted center">Aquí aparecerán tus subtítulos cuando cargues un archivo.</td></tr>';
    updateUI();
    toast('Todo borrado. Carga un archivo nuevo para empezar.', 'ok', 4000);
  }));

  // ---------- Exportar ----------
  el.exp.addEventListener('click', e => {
    const b = e.target.closest('[data-exp]'); if (!b) return;
    const kind = b.dataset.exp;
    const missing = S.st.filter((x, i) => x !== 'done' && S.subs[i].text.trim()).length;
    const texts = S.subs.map((s, i) => S.out[i] || (kind === 'project' ? '' : s.text));
    const suffix = { es: 'es', en: 'en', 'zh-Hans': 'zh' }[S.tgt] || S.tgt;
    if (kind === 'srt') download(`${S.fileName}.${suffix}.srt`, Core.toSRT(S.subs, texts));
    if (kind === 'vtt') download(`${S.fileName}.${suffix}.vtt`, Core.toVTT(S.subs, texts));
    if (kind === 'bi') download(`${S.fileName}.bilingue.srt`, Core.toSRT(S.subs, S.subs.map((s, i) => [S.out[i], s.text].filter(Boolean).join('\n'))));
    if (kind === 'orig') download(`${S.fileName}.limpio.srt`, Core.toSRT(S.subs, S.subs.map(s => s.text)));
    if (kind === 'project') download(`${S.fileName}.proyecto.json`, JSON.stringify(projectData()), 'application/json');
    if (missing && kind !== 'project' && kind !== 'orig') toast(`Aviso: ${missing} subtítulo(s) sin traducir se han guardado en el idioma original.`, 'warn');
  });
  function download(name, text, type = 'text/plain') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ---------- Estado de la interfaz ----------
  function updateProgress() {
    const total = S.subs.length || 1;
    const done = S.st.filter(x => x === 'done').length;
    const err = S.st.filter(x => x === 'error').length;
    el.bar.style.width = `${(done / total) * 100}%`;
    el.bar.classList.toggle('err', err > 0);
    el.progressText.textContent = S.subs.length ? `${done} de ${S.subs.length} traducidos${err ? ` · ${err} con error` : ''}` : '';
    const u = S.usage;
    el.stats.textContent = u.req ? `${u.req} petici${u.req === 1 ? 'ón' : 'ones'} · ${fmt(u.in + u.cr + u.cw)} tokens de entrada (${fmt(u.cr)} en caché) · ${fmt(u.out)} de salida${u.cost ? ` · ≈ ${money(u.cost)}` : ''}` : '';
    el.retry.hidden = !err || S.running;
  }

  function updateUI() {
    const p = el.provider.value, P = Api.PROVIDERS[p];
    // temperatura
    el.tempVal.textContent = (+el.temp.value).toFixed(1).replace('.', ',');
    const tempOk = P.temp && currentModel()?.temp !== false;
    el.temp.disabled = !tempOk;
    el.tempNote.textContent = tempOk
      ? 'Más baja = más literal y fiel al original. 0,5 es un buen punto de partida.'
      : 'Este modelo no permite ajustar la temperatura (les pasa a Claude y a GPT‑6): la fidelidad se controla con las instrucciones, que ya piden ceñirse al original.';
    // clave
    const needKey = P.key && !cfg.keys[p];
    el.keyWarn.hidden = !needKey;
    el.keyWarn.innerHTML = needKey ? `Falta tu clave de ${P.label}. <button class="btn sm">Añadir clave</button> <a href="${P.keyUrl}" target="_blank" rel="noopener">¿Dónde la consigo?</a>` : '';
    // estimación
    const set = settings();
    el.full.disabled = !set.fullAllowed;
    el.full.parentElement.title = set.fullAllowed ? '' : 'El archivo es demasiado largo para enviarlo entero a este modelo';
    if (S.subs.length) {
      const pend = S.st.filter(x => x !== 'done').length;
      const batches = Math.ceil(pend / set.batchSize);
      const pr = currentModel()?.price;
      const avgSub = Core.estTokens(S.subs.map(s => s.text).join(' ')) / S.subs.length;
      const sys = 900 + (set.fullContext ? set.transcriptTokens : 0) + Core.estTokens(el.glossary.value + el.notes.value);
      const perBatchIn = avgSub * set.batchSize * 2.2 + 400;
      const outTok = pend * avgSub * 1.6 + batches * 300;
      let line = pend ? `${pend} por traducir · ${batches} petici${batches === 1 ? 'ón' : 'ones'} de hasta ${set.batchSize} subtítulos` : 'Todo traducido';
      if (pr && pend) {
        const cachedReads = set.fullContext ? Math.max(0, batches - 1) * sys : 0;
        const cost = ((set.fullContext ? sys : sys * batches) * pr.in + cachedReads * pr.cr + batches * perBatchIn * pr.in + outTok * pr.out) / 1e6;
        line += ` · coste estimado ≈ ${money(cost)}`;
      } else if (p === 'lmstudio' && pend) line += ' · gratis (en tu ordenador)';
      if (set.fullContext) line += ' · con el guion completo como contexto';
      el.estimate.textContent = line;
    } else el.estimate.textContent = '';
    // botones
    const started = S.st.some(x => x === 'done');
    el.start.disabled = S.running || !S.subs.length;
    el.start.textContent = S.running ? 'Traduciendo…' : started && S.st.some(x => x !== 'done') ? 'Continuar' : 'Traducir';
    el.stop.hidden = !S.running;
    el.exp.querySelectorAll('button').forEach(b => (b.disabled = !S.subs.length));
    $('#clearTrans').disabled = S.running || !S.st.some(x => x === 'done' || x === 'error');
    $('#resetAll').disabled = S.running || !S.subs.length;
    document.body.classList.toggle('running', S.running);
    if (el.findText.value) updateFindCount();
    updateProgress();
  }

  const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' M' : n >= 1e3 ? Math.round(n / 1e3) + ' mil' : String(n);
  const money = c => c < 0.01 ? 'menos de 1 céntimo' : `${c.toFixed(c < 1 ? 3 : 2).replace('.', ',')} $`;
  function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  window.addEventListener('beforeunload', e => { if (S.running) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- Bienvenida y ayuda ----------
  const welcome = $('#welcome');
  function hideWelcome() { if (!welcome.hidden) { welcome.hidden = true; store.set('welcomed', true); } }
  const hasAnyKey = () => Object.values(cfg.keys).some(Boolean);
  if (!store.get('welcomed', false) && !hasAnyKey() && !store.get('project', null)) welcome.hidden = false;
  $('#welcomeClose').addEventListener('click', hideWelcome);
  $('#welcomeKeys').addEventListener('click', () => {
    if (el.provider.value === 'anthropic' && !cfg.keys.anthropic) { el.provider.value = 'openrouter'; store.set('provider', 'openrouter'); loadModels(); }
    openKeys();
  });
  $('#openHelp').addEventListener('click', () => $('#helpDlg').showModal());
  $('#helpClose').addEventListener('click', () => $('#helpDlg').close());
  $('#keysSave').addEventListener('click', () => { if (hasAnyKey()) hideWelcome(); });

  $('#ver').textContent = 'v' + Core.VERSION;
  updateCtxSummary();
  setTarget('es');
  loadModels();
});
