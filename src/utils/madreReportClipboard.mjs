/**
 * Utilidades de copiado de informes MADRE.
 *
 * - markdownToOutlookHtml: convierte el Markdown de MADRE en HTML con estilos
 *   exclusivamente inline (Outlook elimina clases y hojas de estilo).
 * - markdownToPlainText: versión texto plano limpia (sin ###, **, backticks ni
 *   separadores de tabla) para texto plano / WhatsApp.
 * - extractCounterproposalEmail: extrae únicamente el borrador de correo de la
 *   sección 4 (desde Asunto/saludo hasta la firma), excluyendo bloques internos.
 * - copyRichTextToClipboard: copia text/html + text/plain con fallback.
 */

const NAVY = '#0f2942';
const BORDER = '#cbd5e1';

const STYLE = {
  base: 'font-family: Calibri, Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.5; color: #1e293b;',
  h1: `font-family: Calibri, Arial, Helvetica, sans-serif; font-size: 20px; font-weight: bold; color: ${NAVY}; margin: 16px 0 8px 0; border-bottom: 1px solid ${BORDER}; padding-bottom: 4px;`,
  h2: `font-family: Calibri, Arial, Helvetica, sans-serif; font-size: 17px; font-weight: bold; color: ${NAVY}; margin: 16px 0 8px 0; border-bottom: 1px solid ${BORDER}; padding-bottom: 4px;`,
  h3: `font-family: Calibri, Arial, Helvetica, sans-serif; font-size: 15px; font-weight: bold; color: ${NAVY}; margin: 12px 0 6px 0; border-bottom: 1px solid ${BORDER}; padding-bottom: 4px;`,
  p: 'font-family: Calibri, Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.5; color: #1e293b; margin: 0 0 8px 0;',
  table: 'border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 13px; font-family: Calibri, Arial, Helvetica, sans-serif;',
  th: `background: ${NAVY}; background-color: ${NAVY}; color: #ffffff; font-weight: bold; padding: 8px 10px; border: 1px solid ${NAVY}; text-align: left;`,
  td: `padding: 8px 10px; border: 1px solid ${BORDER}; color: #1e293b; vertical-align: top;`,
  list: 'font-family: Calibri, Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.5; color: #1e293b; margin: 0 0 8px 0; padding-left: 24px;',
  li: 'margin: 0 0 4px 0;',
  hr: `border: none; border-top: 1px solid ${BORDER}; margin: 12px 0;`,
  code: `font-weight:600; color:${NAVY}; background:#f1f5f9; padding:1px 4px; border-radius:3px;`,
  strong: `font-weight: bold; color: ${NAVY};`,
  quote: `border-left: 3px solid ${BORDER}; margin: 0 0 8px 0; padding: 4px 10px; color: #334155;`,
};

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ------------------------------ Tablas GFM ------------------------------ */

function isTableSeparator(line) {
  if (!line || typeof line !== 'string') return false;
  const trimmed = line.trim();
  if (!trimmed.includes('-')) return false;
  let inner = trimmed;
  if (inner.startsWith('|')) inner = inner.slice(1);
  if (inner.endsWith('|')) inner = inner.slice(0, -1);
  const cells = inner.split('|').map(c => c.trim());
  if (cells.length === 0) return false;
  return cells.every(c => /^:?-{1,}:?$/.test(c));
}

function isTableRow(line) {
  if (!line || typeof line !== 'string') return false;
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;
  if (trimmed.startsWith('#') || /^[-*•]\s+/.test(trimmed) || /^---{1,}$/.test(trimmed)) return false;
  return true;
}

function splitRowCells(line) {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map(c => c.trim());
}

function parseAlignments(separatorLine) {
  return splitRowCells(separatorLine).map(c => {
    const left = c.startsWith(':');
    const right = c.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    return 'left';
  });
}

/* ------------------------------ Inline ------------------------------ */

function inlineToHtml(str) {
  // Se separan primero los fragmentos entre backticks para no aplicar otro formato dentro.
  const parts = String(str ?? '').split(/(`[^`]+`)/g);
  return parts.map(part => {
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
      return `<span style="${STYLE.code}">${escapeHtml(part.slice(1, -1))}</span>`;
    }
    let html = escapeHtml(part.replace(/`/g, ''));
    html = html.replace(/\*\*(.+?)\*\*/g, `<strong style="${STYLE.strong}">$1</strong>`);
    html = html.replace(/__(.+?)__/g, `<strong style="${STYLE.strong}">$1</strong>`);
    html = html.replace(/(^|[\s(])\*(?!\s)([^*]+?)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
    html = html.replace(/\*\*/g, '');
    return html;
  }).join('');
}

function inlineToPlain(str) {
  return String(str ?? '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/`/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|[\s(])\*(?!\s)([^*]+?)\*(?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/\*\*/g, '');
}

/* ------------------------------ Bloques ------------------------------ */

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const BULLET_RE = /^[-*•]\s+(.*)$/;
const ORDERED_RE = /^(\d+)[.)]\s+(.*)$/;
const HR_RE = /^(-{3,}|\*{3,}|_{3,})$/;
const FENCE_RE = /^```/;

/**
 * Tokeniza el Markdown en bloques reutilizables por los renderizadores HTML y texto plano.
 */
function tokenize(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let paragraph = null;
  let list = null;

  const flushParagraph = () => { if (paragraph) { blocks.push({ type: 'p', lines: paragraph }); paragraph = null; } };
  const flushList = () => { if (list) { blocks.push(list); list = null; } };
  const flushAll = () => { flushParagraph(); flushList(); };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (FENCE_RE.test(trimmed)) { continue; } // Se ignoran las vallas de código (```), se conserva el contenido.

    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flushAll();
      const headers = splitRowCells(line);
      const align = parseAlignments(lines[i + 1]);
      const rows = [];
      i++;
      while (i + 1 < lines.length && isTableRow(lines[i + 1]) && !isTableSeparator(lines[i + 1])) {
        i++;
        const cells = splitRowCells(lines[i]);
        while (cells.length < headers.length) cells.push('');
        rows.push(cells);
      }
      blocks.push({ type: 'table', headers, align, rows });
      continue;
    }
    // Separador de tabla huérfano: nunca debe aparecer en la salida.
    if (isTableSeparator(line) && trimmed.includes('|')) { continue; }

    if (!trimmed) { flushAll(); blocks.push({ type: 'blank' }); continue; }

    if (HR_RE.test(trimmed)) { flushAll(); blocks.push({ type: 'hr' }); continue; }

    const h = trimmed.match(HEADING_RE);
    if (h) { flushAll(); blocks.push({ type: 'heading', level: h[1].length, text: h[2].replace(/\s#+\s*$/, '') }); continue; }

    const b = trimmed.match(BULLET_RE);
    const o = !b && trimmed.match(ORDERED_RE);
    if (b || o) {
      flushParagraph();
      const kind = b ? 'ul' : 'ol';
      if (!list || list.type !== kind) { flushList(); list = { type: kind, items: [], start: o ? Number(o[1]) : 1 }; }
      list.items.push(b ? b[1] : o[2]);
      continue;
    }

    if (trimmed.startsWith('>')) {
      flushAll();
      blocks.push({ type: 'quote', text: trimmed.replace(/^>\s?/, '') });
      continue;
    }

    flushList();
    if (!paragraph) paragraph = [];
    paragraph.push(trimmed);
  }
  flushAll();
  return blocks;
}

export function markdownToOutlookHtml(markdown) {
  const blocks = tokenize(markdown);
  const out = [];
  for (const block of blocks) {
    switch (block.type) {
      case 'heading': {
        const tag = block.level <= 1 ? 'h1' : block.level === 2 ? 'h2' : 'h3';
        const style = block.level <= 1 ? STYLE.h1 : block.level === 2 ? STYLE.h2 : STYLE.h3;
        out.push(`<${tag} style="${style}">${inlineToHtml(block.text)}</${tag}>`);
        break;
      }
      case 'p':
        out.push(`<p style="${STYLE.p}">${block.lines.map(inlineToHtml).join('<br>')}</p>`);
        break;
      case 'ul':
      case 'ol': {
        const startAttr = block.type === 'ol' && block.start !== 1 ? ` start="${block.start}"` : '';
        out.push(`<${block.type}${startAttr} style="${STYLE.list}">${block.items.map(it => `<li style="${STYLE.li}">${inlineToHtml(it)}</li>`).join('')}</${block.type}>`);
        break;
      }
      case 'quote':
        out.push(`<p style="${STYLE.quote}">${inlineToHtml(block.text)}</p>`);
        break;
      case 'hr':
        out.push(`<hr style="${STYLE.hr}">`);
        break;
      case 'table': {
        const head = `<tr>${block.headers.map((hd, idx) => `<th style="${STYLE.th} text-align: ${block.align[idx] || 'left'};">${inlineToHtml(hd)}</th>`).join('')}</tr>`;
        const body = block.rows.map((row, rIdx) => {
          const bg = rIdx % 2 === 1 ? 'background: #f8fafc; background-color: #f8fafc;' : 'background: #ffffff; background-color: #ffffff;';
          return `<tr>${row.map((cell, cIdx) => `<td style="${STYLE.td} ${bg} text-align: ${block.align[cIdx] || 'left'};">${inlineToHtml(cell)}</td>`).join('')}</tr>`;
        }).join('');
        out.push(`<table cellpadding="0" cellspacing="0" border="1" style="${STYLE.table}"><thead>${head}</thead><tbody>${body}</tbody></table>`);
        break;
      }
      default:
        break; // las líneas en blanco ya separan párrafos vía márgenes
    }
  }
  return `<div style="${STYLE.base}">${out.join('\n')}</div>`;
}

export function markdownToPlainText(markdown) {
  const blocks = tokenize(markdown);
  const out = [];
  for (const block of blocks) {
    switch (block.type) {
      case 'heading': out.push(inlineToPlain(block.text)); break;
      case 'p': out.push(block.lines.map(inlineToPlain).join('\n')); break;
      case 'ul': out.push(block.items.map(it => `• ${inlineToPlain(it)}`).join('\n')); break;
      case 'ol': out.push(block.items.map((it, idx) => `${block.start + idx}. ${inlineToPlain(it)}`).join('\n')); break;
      case 'quote': out.push(inlineToPlain(block.text)); break;
      case 'hr': out.push('————————————'); break;
      case 'table': {
        const rows = [block.headers, ...block.rows].map(r => r.map(inlineToPlain).join('  ·  '));
        out.push(rows.join('\n'));
        break;
      }
      case 'blank': out.push(''); break;
      default: break;
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* --------------------- Extracción correo contrapropuesta --------------------- */

const INTERNAL_RE = /(uso\s+interno|solo\s+interno|s[oó]lo\s+para\s+uso|interno\b|internal|break[\s-]?even|punto\s+de\s+equilibrio|margen|margin|no\s+enviar|not\s+for\s+(the\s+)?client|confidencial\s+interno)/i;
const SUBJECT_RE = /^(asunto|subject|re|ref)\s*:/i;
const GREETING_RE = /^(estimad[oa]s?|apreciad[oa]s?|querid[oa]s?|distinguid[oa]s?|dear|hola|hello|hi|buen[oa]s\s+(d[ií]as|tardes|noches)|good\s+(morning|afternoon|evening)|señor(es|a)?|sr\.|sra\.|muy\s+señor)/i;
const CLOSING_RE = /^(atentamente|cordialmente|saludos|un\s+(cordial\s+)?saludo|reciba\s+un|quedamos\s+a\s+(su|vuestra)\s+disposici[oó]n|best\s+regards|kind\s+regards|warm\s+regards|regards|sincerely|yours\s+(faithfully|sincerely)|thanks\s+and\s+regards|firmado\s*:)/i;

function stripMarkup(line) {
  return String(line ?? '')
    .trim()
    .replace(/^#{1,6}\s+/, '')
    .replace(/^>\s?/, '')
    .replace(/^[-*•]\s+/, '')
    .replace(/[*_`]/g, '')
    .trim();
}

function isHeadingLike(line) {
  const t = String(line ?? '').trim();
  if (HEADING_RE.test(t)) return true;
  // Línea completamente en negrita (p.ej. "**4. Contrapropuesta**")
  return /^\*\*[^*]+\*\*:?$/.test(t);
}

function sectionNumber(line) {
  if (!isHeadingLike(line) && !/^\s*\d+[.)]\s+[A-ZÁÉÍÓÚÑ]/.test(String(line).trim())) return null;
  const m = stripMarkup(line).match(/^(?:secci[oó]n\s+|section\s+|bloque\s+|punto\s+)?(\d+)\s*[.):\-–—]/i);
  return m ? Number(m[1]) : null;
}

function findSection4(lines) {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (sectionNumber(lines[i]) === 4) { start = i; break; }
  }
  if (start === -1) {
    for (let i = 0; i < lines.length; i++) {
      if (isHeadingLike(lines[i]) && /(contrapropuesta|counter[\s-]?proposal|counter[\s-]?offer|borrador\s+de\s+correo|correo|e-?mail)/i.test(stripMarkup(lines[i]))) { start = i; break; }
    }
  }
  if (start === -1) return null;
  const startLevel = (String(lines[start]).trim().match(/^(#{1,6})\s/) || [])[1]?.length || 0;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const n = sectionNumber(lines[i]);
    if (n !== null && n > 4) { end = i; break; }
    const lvl = (String(lines[i]).trim().match(/^(#{1,6})\s/) || [])[1]?.length || 0;
    if (startLevel && lvl && lvl <= startLevel && n === null && !/(asunto|subject)/i.test(lines[i])) { end = i; break; }
  }
  return { start: start + 1, end };
}

/**
 * Devuelve el Markdown del correo de contrapropuesta listo para enviar, o null si no existe.
 */
export function extractCounterproposalEmail(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n').filter(l => !FENCE_RE.test(l.trim()));
  const section = findSection4(lines) || { start: 0, end: lines.length };
  const scope = lines.slice(section.start, section.end);

  // 1. Inicio: Asunto o, en su defecto, saludo.
  let begin = scope.findIndex(l => SUBJECT_RE.test(stripMarkup(l)));
  if (begin === -1) begin = scope.findIndex(l => GREETING_RE.test(stripMarkup(l)));
  if (begin === -1) return null;

  // 2. Fin: fórmula de cierre + líneas de firma consecutivas (hasta línea en blanco o encabezado).
  let finish = scope.length;
  for (let i = begin + 1; i < scope.length; i++) {
    if (CLOSING_RE.test(stripMarkup(scope[i]))) {
      let j = i + 1;
      // Permite una línea en blanco tras la fórmula de cierre ("Atentamente,\n\nNombre")
      if (j < scope.length && !scope[j].trim() && j + 1 < scope.length && scope[j + 1].trim() && !isHeadingLike(scope[j + 1]) && !INTERNAL_RE.test(scope[j + 1])) j++;
      let taken = 0;
      while (j < scope.length && scope[j].trim() && !isHeadingLike(scope[j]) && !HR_RE.test(scope[j].trim()) && !INTERNAL_RE.test(scope[j]) && taken < 6) { j++; taken++; }
      finish = j;
      break;
    }
  }
  const emailLines = scope.slice(begin, finish);

  // 3. Exclusión de bloques internos (break-even, margen, uso interno…).
  const result = [];
  let skippingUntilHeading = false;
  let paragraph = [];
  const flush = () => {
    if (paragraph.length && !paragraph.some(l => INTERNAL_RE.test(l))) result.push(...paragraph);
    paragraph = [];
  };
  for (const line of emailLines) {
    const t = line.trim();
    if (isHeadingLike(line) && !SUBJECT_RE.test(stripMarkup(line))) {
      flush();
      skippingUntilHeading = INTERNAL_RE.test(line);
      if (!skippingUntilHeading) result.push(line);
      continue;
    }
    if (skippingUntilHeading) continue;
    if (!t) { flush(); result.push(''); continue; }
    paragraph.push(line);
  }
  flush();

  const text = result.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return text || null;
}

/* ------------------------------ Portapapeles ------------------------------ */

function fallbackCopy(html, plain) {
  if (typeof document === 'undefined') return false;
  const container = document.createElement('div');
  container.setAttribute('contenteditable', 'true');
  container.setAttribute('aria-hidden', 'true');
  container.style.position = 'fixed';
  container.style.left = '-99999px';
  container.style.top = '0';
  container.style.opacity = '0';
  container.style.pointerEvents = 'none';
  container.innerHTML = html;
  document.body.appendChild(container);

  // Se fuerzan ambos formatos cuando el navegador lo permite durante execCommand.
  const onCopy = (e) => {
    if (e.clipboardData) {
      e.clipboardData.setData('text/html', html);
      e.clipboardData.setData('text/plain', plain);
      e.preventDefault();
    }
  };
  document.addEventListener('copy', onCopy);

  const selection = window.getSelection();
  const previous = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
  let ok = false;
  try {
    const range = document.createRange();
    range.selectNodeContents(container);
    selection.removeAllRanges();
    selection.addRange(range);
    ok = document.execCommand('copy');
  } finally {
    document.removeEventListener('copy', onCopy);
    selection.removeAllRanges();
    if (previous) selection.addRange(previous);
    document.body.removeChild(container);
  }
  return ok;
}

export async function copyRichTextToClipboard(html, plain) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.write && typeof window !== 'undefined' && typeof window.ClipboardItem === 'function') {
    try {
      await navigator.clipboard.write([
        new window.ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        }),
      ]);
      return true;
    } catch (_) {
      // continúa con el fallback
    }
  }
  if (fallbackCopy(html, plain)) return true;
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(plain);
    return true;
  }
  return false;
}

export async function copyMarkdownForOutlook(markdown) {
  return copyRichTextToClipboard(markdownToOutlookHtml(markdown), markdownToPlainText(markdown));
}
