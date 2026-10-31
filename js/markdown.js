// Markdown rendering with [[wikilinks]], sanitised.

import { marked } from '../vendor/marked.esm.js';
import DOMPurify from '../vendor/purify.es.mjs';
import { esc } from './util.js';

marked.setOptions({ gfm: true, breaks: true });

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    const href = node.getAttribute('href') || '';
    if (/^https?:/i.test(href)) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  }
});

export function renderMarkdown(md, resolveTitle) {
  const withLinks = String(md || '').replace(/\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g, (m, title, label) => {
    const target = resolveTitle?.(title.trim());
    const text = esc((label || title).trim());
    return target ? `<a href="#/note/${encodeURIComponent(target.id)}" class="wikilink">${text}</a>` : `<span class="wikilink missing">${text}</span>`;
  });
  return DOMPurify.sanitize(marked.parse(withLinks), { ADD_ATTR: ['target'] });
}

// Sanitised HTML for Markdown, leaving [[links]] as text (the editor styles them).
export function mdToHtml(md) {
  return DOMPurify.sanitize(marked.parse(String(md || '')));
}
