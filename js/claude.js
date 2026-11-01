// "Ask Claude": build a request you paste into a Claude chat, then import the
// structured reply. Sealed notes are never included.

import { state, saveNote, saveConfig } from './vault.js';
import { newNote, displayTitle, typeName, SOURCE_LABEL, NOTE_TYPES } from './model.js';
import { fmtDate, isoDay } from './util.js';

export const FORMAT = 'second-brain/v1';

// What's waiting to be reviewed, kept only in memory.
export const session = { reply: null, question: '' };
const MAX_OCR = 1500;

const regionName = (id) => state.config.regions.find((r) => r.id === id)?.name || 'Unsorted';

export function shareableNotes(regionIds, { includeInbox = false } = {}) {
  const set = new Set(regionIds);
  return [...state.notes.values()]
    .filter((n) => !n.sealed)
    .filter((n) => (n.inbox ? includeInbox : set.has(n.region)))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function titleList(notes) {
  return notes.map((n) => `- [${n.id}] ${displayTitle(n)} (${n.inbox ? 'Inbox' : regionName(n.region)})`).join('\n');
}

export function formatNote(n) {
  const lines = [`### [${n.id}] ${displayTitle(n)}`];
  const meta = [
    `Region: ${n.inbox ? 'Inbox (unsorted)' : regionName(n.region)}`,
    `Type: ${n.kind === 'board' ? 'Whiteboard (outline below)' : typeName(n.type)}`,
    `Captured: ${fmtDate(n.createdAt, { year: 'always' })}`,
  ];
  if (n.source) meta.push(`Source: ${SOURCE_LABEL[n.source] || n.source}`);
  lines.push(meta.join(' | '));
  if (n.tags.length) lines.push(`Tags: ${n.tags.join(', ')}`);
  const fields = n.notebook ? state.notebooks.get(n.notebook)?.sections.find((s) => s.id === n.section)?.fields || [] : [];
  const props = fields.map((f) => [f.name, n.props?.[f.id]]).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length));
  if (props.length) lines.push(props.map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v === true ? 'yes' : v}`).join(' | '));
  if (n.url) lines.push(`URL: ${n.url}`);
  if (n.chat?.title) lines.push(`From chat: ${n.chat.title}${n.chat.url ? ` (${n.chat.url})` : ''}`);
  const linked = n.links.map((id) => state.notes.get(id)).filter((x) => x && !x.sealed);
  if (linked.length) lines.push(`Linked to: ${linked.map((x) => `[${x.id}] ${displayTitle(x)}`).join('; ')}`);
  if (n.body.trim()) lines.push('', n.body.trim());
  (n.recordings || []).forEach((r, i) => {
    if (r.transcript?.text) lines.push('', `Transcript of recording ${i + 1}:`, `> ${(r.transcript.text.length > MAX_OCR * 2 ? `${r.transcript.text.slice(0, MAX_OCR * 2)}…` : r.transcript.text)}`);
  });
  n.files.forEach((f, i) => {
    if (f.ocr) {
      const t = f.ocr.length > MAX_OCR ? `${f.ocr.slice(0, MAX_OCR)}…` : f.ocr;
      lines.push('', `Text read from image ${i + 1}:`, t.split('\n').map((l) => `> ${l}`).join('\n'));
    } else if (f.ocrStatus !== 'done') {
      lines.push('', `(Image ${i + 1}: no text read yet)`);
    }
  });
  return lines.join('\n');
}

function regionSpec() {
  return state.config.regions.map((r) => `"${r.id}" (${r.name})`).join(', ');
}

function replySpec(kind) {
  const types = NOTE_TYPES.map((t) => t.id).join('|');
  return `## How to reply

Reply with ONE fenced \`\`\`json code block and nothing after it. I'll import it into my second brain app, which checks every item with me before saving. Use this format (leave out any key you don't need):

\`\`\`json
{
  "format": "${FORMAT}",
  "kind": "${kind}",
  "answer": "Markdown answer, if I asked a question. Refer to notes as [[Note title]].",
  "sweep": { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD", "chatsReviewed": 0 },
  "newNotes": [
    {
      "ref": "new1",
      "title": "Short title in my words",
      "body": "Markdown. Keep my conclusion, not your explanation. Use [[Existing title]] to link.",
      "type": "${types}",
      "region": "one of the region ids, or null if unsure",
      "tags": [],
      "linksTo": ["existing note id, or another new note's ref"],
      "sealSuggested": false,
      "why": "One line on why this is worth keeping",
      "chat": { "title": "Chat title", "url": "https://claude.ai/chat/..." }
    }
  ],
  "updates": [
    {
      "id": "existing note id",
      "setTitle": "optional better title",
      "setRegion": "optional region id (files the note out of the inbox)",
      "setType": "optional type",
      "appendBody": "optional markdown to add to the end of the note",
      "addTags": [],
      "addLinks": ["existing note id"],
      "why": "One line",
      "chat": { "title": "", "url": "" }
    }
  ],
  "suggestedLinks": [ { "from": "note id", "to": "note id", "reason": "One line" } ],
  "skipped": [ { "chatTitle": "", "chatUrl": "", "reason": "lookup | one-off task | already captured | work detail | other" } ]
}
\`\`\`

Region ids: ${regionSpec()}.
Set "sealSuggested": true for anything personal or sensitive (money, health, relationships, family matters).
Only use note ids that appear in this message.`;
}

const RULES = `## What's worth keeping
Keep: decisions and the reasoning behind them; my own ideas, plans and goals; things about me (wins, preferences, lessons learned); open questions I haven't closed; research I'll build on; context about people.
Skip: quick lookups anyone could search; one-off tasks (like drafting an email) unless a decision came out of them; your long explanations (keep my conclusion); anything my notes below already cover (send an update instead of a duplicate); internal or client details from work chats (my own thinking about work is fine).
If I asked the same basic thing more than once, keep it once as a "reference" note.`;

export function sweepFrom() {
  return state.config.lastSweepAt || Date.now() - 30 * 86400000;
}

export function buildSweepRequest() {
  const from = isoDay(sweepFrom());
  const to = isoDay();
  const notes = [...state.notes.values()].filter((n) => !n.sealed);
  return `# Second brain: chat sweep

Please sweep my Claude chats from ${from} to ${to}. Use your past-chat tools (recent chats and chat search) to go through every conversation in that window, then pull out only what's worth keeping in my second brain.

${RULES}

List every chat you leave out under "skipped", so I can rescue anything you got wrong.

## Notes I already have (${notes.length})
${titleList(notes) || '(none yet)'}

${replySpec('sweep')}`;
}

export const PRESETS = {
  sort: {
    label: 'Sort my inbox',
    build: () => {
      const inbox = [...state.notes.values()].filter((n) => n.inbox && !n.sealed);
      const rest = [...state.notes.values()].filter((n) => !n.inbox && !n.sealed);
      return `# Second brain: sort my inbox

Here are ${inbox.length} unsorted captures from my inbox. For each one, send an update with the best "setRegion", a clearer "setTitle" if the current one is vague, and "addLinks" to related existing notes. If two captures belong together, say so in "suggestedLinks". Don't invent facts that aren't in the captures.

## Inbox
${inbox.map(formatNote).join('\n\n') || '(empty)'}

## My other notes (titles only)
${titleList(rest) || '(none)'}

${replySpec('sort')}`;
    },
  },
  open: {
    label: 'What’s still open?',
    question: 'What questions, decisions and follow-ups are still open in these notes? Group them and say which matter most.',
  },
  win: {
    label: 'Log a win',
    build: () => `# Second brain: help me log a win

Help me capture a career highlight. Ask me one question at a time: what happened, the impact (with numbers if I have them), the skills it shows, and who was involved. Keep it in my words. When we're done, reply with the JSON below containing one new note of type "highlight" in the "career" region, with a body using the headings "What happened", "Impact" and "Skills it shows".

## My existing career notes (titles only)
${titleList([...state.notes.values()].filter((n) => !n.sealed && n.region === 'career')) || '(none yet)'}

${replySpec('win')}`,
  },
};

export function buildQuestionRequest(question, regionIds, { includeInbox = true, only = null } = {}) {
  let notes = shareableNotes(regionIds, { includeInbox });
  if (only) { const keep = new Map(only.map((id, i) => [id, i])); notes = notes.filter((n) => keep.has(n.id)).sort((a, b) => keep.get(a.id) - keep.get(b.id)); }
  return `# Second brain: question

${question.trim()}

Answer from my notes below. Quote the notes you rely on as [[Note title]], point out connections I may have missed, and suggest links between notes where they belong together. If my notes don't cover something, say so rather than guessing.

## My notes (${notes.length})
${notes.map(formatNote).join('\n\n') || '(no notes in the selected regions)'}

${replySpec('answer')}`;
}

// ---- Parsing replies -----------------------------------------------------

export function parseReply(text) {
  const src = String(text || '');
  let jsonText = null;
  const fence = src.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1].trim().startsWith('{')) jsonText = fence[1];
  if (!jsonText) {
    const a = src.indexOf('{');
    const b = src.lastIndexOf('}');
    if (a >= 0 && b > a) jsonText = src.slice(a, b + 1);
  }
  if (!jsonText) throw new Error('Couldn’t find Claude’s reply in that text. Paste the whole reply, including the code block.');
  let data;
  try { data = JSON.parse(jsonText); } catch { throw new Error('The reply’s code block isn’t valid JSON. Ask Claude to resend it as one json block.'); }
  if (!String(data.format || '').startsWith('second-brain/')) throw new Error('That isn’t a Second brain reply. Use the request this app copied for you.');
  const arr = (x) => (Array.isArray(x) ? x : []);
  const regionIds = new Set(state.config.regions.map((r) => r.id));
  const typeIds = new Set(NOTE_TYPES.map((t) => t.id));
  const cleanRegion = (r) => (regionIds.has(r) ? r : null);
  return {
    kind: data.kind || 'answer',
    answer: typeof data.answer === 'string' ? data.answer : '',
    sweep: data.sweep || null,
    newNotes: arr(data.newNotes).filter((n) => n && (n.title || n.body)).map((n, i) => ({
      ref: String(n.ref || `new${i + 1}`),
      title: String(n.title || '').slice(0, 200),
      body: String(n.body || ''),
      type: typeIds.has(n.type) ? n.type : 'note',
      region: cleanRegion(n.region),
      tags: arr(n.tags).map(String).slice(0, 12),
      linksTo: arr(n.linksTo).map(String),
      sealSuggested: !!n.sealSuggested,
      why: String(n.why || ''),
      chat: n.chat && (n.chat.title || n.chat.url) ? { title: String(n.chat.title || ''), url: safeUrl(n.chat.url) } : null,
    })),
    updates: arr(data.updates).filter((u) => u && state.notes.has(u.id) && !state.notes.get(u.id).sealed).map((u) => ({
      id: u.id,
      setTitle: u.setTitle ? String(u.setTitle).slice(0, 200) : '',
      setRegion: cleanRegion(u.setRegion),
      setType: typeIds.has(u.setType) ? u.setType : null,
      appendBody: u.appendBody ? String(u.appendBody) : '',
      addTags: arr(u.addTags).map(String),
      addLinks: arr(u.addLinks).map(String).filter((id) => state.notes.has(id)),
      why: String(u.why || ''),
      chat: u.chat && (u.chat.title || u.chat.url) ? { title: String(u.chat.title || ''), url: safeUrl(u.chat.url) } : null,
    })),
    suggestedLinks: arr(data.suggestedLinks).filter((l) => l && l.from !== l.to).map((l) => ({ from: String(l.from), to: String(l.to), reason: String(l.reason || '') })),
    skipped: arr(data.skipped).map((s) => ({ chatTitle: String(s.chatTitle || s.title || 'Untitled chat'), chatUrl: safeUrl(s.chatUrl || s.url), reason: String(s.reason || '') })),
  };
}

function safeUrl(u) {
  const s = String(u || '');
  return /^https:\/\//i.test(s) ? s : '';
}

export function describeUpdate(u) {
  const n = state.notes.get(u.id);
  const parts = [];
  if (u.setRegion) parts.push(`file in ${regionName(u.setRegion)}`);
  if (u.setTitle) parts.push(`rename to “${u.setTitle}”`);
  if (u.appendBody) parts.push('add new points');
  if (u.addLinks.length) parts.push(`link ${u.addLinks.length} note${u.addLinks.length === 1 ? '' : 's'}`);
  if (u.addTags.length) parts.push(`tag ${u.addTags.join(', ')}`);
  if (u.setType) parts.push(`mark as ${typeName(u.setType).toLowerCase()}`);
  return { title: n ? displayTitle(n) : u.id, what: parts.join(', ') || 'no change' };
}

// choices: { newNotes: { [ref]: { keep, region, seal } }, updates: { [i]: bool }, skipped: { [i]: bool }, saveAnswer: bool, question }
export async function applyReply(reply, choices) {
  const refToId = new Map();
  const created = [];
  for (const nn of reply.newNotes) {
    const c = choices.newNotes[nn.ref] || {};
    if (c.keep === false) continue;
    const note = newNote({
      title: nn.title,
      titleAuto: false,
      body: nn.body,
      type: nn.type,
      source: reply.kind === 'sweep' ? 'chat' : 'claude',
      inbox: true,
      region: null,
      suggestedRegion: c.region !== undefined ? c.region : nn.region,
      tags: nn.tags,
      chat: nn.chat,
      sealSuggested: nn.sealSuggested && !c.seal,
      sealed: !!c.seal && !!state.keys.s,
    });
    refToId.set(nn.ref, note.id);
    created.push({ note, nn });
  }
  const resolve = (x) => refToId.get(x) || (state.notes.has(x) ? x : null);
  for (const { note, nn } of created) {
    note.links = [...new Set(nn.linksTo.map(resolve).filter(Boolean))];
    await saveNote(note);
  }

  let updated = 0;
  for (let i = 0; i < reply.updates.length; i++) {
    if (choices.updates[i] === false) continue;
    const u = reply.updates[i];
    const n = state.notes.get(u.id);
    if (!n) continue;
    const next = { ...n };
    if (u.setTitle) { next.title = u.setTitle; next.titleAuto = false; }
    if (u.setRegion) { next.region = u.setRegion; next.inbox = false; next.suggestedRegion = null; }
    if (u.setType) next.type = u.setType;
    if (u.appendBody) {
      const src = u.chat?.title ? `\n\n_From chat: ${u.chat.url ? `[${u.chat.title}](${u.chat.url})` : u.chat.title}_` : '';
      const add = `${u.appendBody.trim()}${src}`;
      if (n.kind === 'ink' || n.kind === 'board') {
        // Handwritten notes and boards keep their words on the pages, so the addition
        // becomes a typed sub-note beside them.
        await saveNote(newNote({ title: `Added from Claude, ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`, titleAuto: false, body: add, source: 'claude', parent: n.id, notebook: n.notebook, section: n.section, region: n.region, inbox: n.inbox, sealed: n.sealed }));
      } else if (n.doc) {
        const { appendMarkdown } = await import('./editor/rich.js');
        Object.assign(next, appendMarkdown(n, add));
      } else {
        next.body = `${n.body.trimEnd()}${n.body.trim() ? '\n\n' : ''}${add}`;
      }
    }
    if (u.addTags.length) next.tags = [...new Set([...n.tags, ...u.addTags])];
    if (u.addLinks.length) next.links = [...new Set([...n.links, ...u.addLinks.filter((x) => x !== n.id)])];
    await saveNote(next);
    updated++;
  }

  let suggested = 0;
  for (const l of reply.suggestedLinks) {
    const from = resolve(l.from);
    const to = resolve(l.to);
    if (!from || !to || from === to) continue;
    const n = state.notes.get(from);
    if (!n || n.links.includes(to) || n.dismissed.includes(to) || n.suggested.some((s) => s.id === to)) continue;
    await saveNote({ ...n, suggested: [...n.suggested, { id: to, reason: l.reason }] }, { touch: false });
    suggested++;
  }

  let rescued = 0;
  for (let i = 0; i < reply.skipped.length; i++) {
    if (!choices.skipped[i]) continue;
    const s = reply.skipped[i];
    await saveNote(newNote({ title: `Revisit: ${s.chatTitle}`, titleAuto: false, source: 'chat', inbox: true, chat: { title: s.chatTitle, url: s.chatUrl } }));
    rescued++;
  }

  let answerNote = null;
  if (reply.answer && choices.saveAnswer) {
    answerNote = await saveNote(newNote({
      title: choices.question ? `Q: ${choices.question.slice(0, 90)}` : 'Answer from Claude',
      titleAuto: false,
      body: reply.answer,
      source: 'claude',
      inbox: true,
    }));
  }

  if (reply.kind === 'sweep') await saveConfig({ lastSweepAt: Date.now() });

  return { created: created.length, updated, suggested, rescued, answerNote };
}
