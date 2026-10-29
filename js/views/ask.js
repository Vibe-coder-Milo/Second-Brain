// Ask Claude: chat sweeps, questions about your notes, and importing replies.

import { html, $, copyText, downloadText, fmtDate, isoDay, readFileText, toast } from '../util.js';
import { state } from '../vault.js';
import { buildSweepRequest, buildQuestionRequest, PRESETS, sweepFrom, shareableNotes, parseReply, session } from '../claude.js';
import { regionColors } from '../model.js';
import { openSheet } from '../ui.js';
import { icons } from '../icons.js';

export function mount(main, params, ctx) {
  const selected = new Set(state.config.regions.map((r) => r.id));
  let includeInbox = true;
  let copiedWhat = '';
  let question = session.question || '';
  let preset = params.preset || '';

  const draw = () => {
    const regions = state.config.regions;
    const count = shareableNotes([...selected], { includeInbox }).length;
    const inboxCount = [...state.notes.values()].filter((n) => n.inbox && !n.sealed).length;
    const last = state.config.lastSweepAt;
    const sealedCount = [...state.notes.values()].filter((n) => n.sealed).length + state.hiddenSealed;

    main.innerHTML = `${html`<div class="page">
      <div>
        <h1 class="page-title">Ask Claude</h1>
        <p class="page-sub">Share the notes you choose. Get answers and new links back.</p>
      </div>
      <ol class="steps" aria-label="How it works">
        <li class="${copiedWhat ? '' : 'on'}"><span class="n">1</span>Copy request</li>
        <li class="${copiedWhat ? 'on' : ''}"><span class="n">2</span>Paste in Claude</li>
        <li><span class="n">3</span>Import reply</li>
      </ol>
      ${copiedWhat ? html`<p class="copied" role="status">${icons.check()} Copied the ${copiedWhat}. Paste it into a Claude chat, then come back and import the reply.</p>` : ''}

      ${preset === 'sort' && inboxCount ? html`<section class="card sweep-card" aria-labelledby="sort-title">
        <div class="top"><div class="round-icon">${icons.inbox({ size: 20 })}</div><div>
          <h2 id="sort-title">Sort ${inboxCount} inbox capture${inboxCount === 1 ? '' : 's'}</h2>
          <p class="hint">Claude suggests a region, a clearer title and links for each one. You approve every change.</p></div></div>
        <button type="button" class="btn btn-outline" data-copy="sort">Copy sort request</button>
      </section>` : ''}

      <section class="card sweep-card" aria-labelledby="sweep-title">
        <div class="top"><div class="round-icon">${icons.chats({ size: 20 })}</div><div>
          <h2 id="sweep-title">Sweep my Claude chats</h2>
          <p class="hint">${last ? `Last sweep ${fmtDate(last)}.` : 'No sweeps yet. The first covers the last 30 days.'} Picks up decisions, ideas and open questions since ${fmtDate(sweepFrom())}, and skips quick lookups.</p>
        </div></div>
        <div class="btn-row">
          <button type="button" class="btn btn-outline" style="flex:1" data-copy="sweep">Copy sweep request</button>
          <button type="button" class="btn btn-ghost btn-sm" data-save="sweep">Save as file</button>
        </div>
      </section>

      <div class="field">
        <label for="question">Or ask about your notes</label>
        <textarea id="question" class="serif" rows="2" placeholder="What have I learned about managing up this year?">${question}</textarea>
      </div>
      <div class="chips">
        ${inboxCount && preset !== 'sort' ? html`<button type="button" class="chip" data-copy="sort">Sort my inbox</button>` : ''}
        <button type="button" class="chip" data-fill="open">What’s still open?</button>
        <button type="button" class="chip" data-copy="win">Log a win</button>
      </div>

      <fieldset style="margin:0;padding:0;border:0;display:flex;flex-direction:column;gap:8px">
        <legend class="label" style="padding:0;margin-bottom:8px">Notes to share with your question</legend>
        <div class="chips">
          ${regions.map((r) => html`<button type="button" class="chip toggle" aria-pressed="${selected.has(r.id) ? 'true' : 'false'}" data-region="${r.id}">${selected.has(r.id) ? icons.check() : html`<span class="dot" style="background:${regionColors(r).dot}"></span>`}${r.name}</button>`)}
          <button type="button" class="chip toggle" aria-pressed="${includeInbox ? 'true' : 'false'}" data-inbox>${includeInbox ? icons.check() : ''}Inbox</button>
        </div>
        <p class="hint" style="display:flex;align-items:center;gap:6px">${icons.lock()}${sealedCount ? 'Sealed notes are never shared.' : 'Sealed notes, if you add any, are never shared.'} ${count} note${count === 1 ? '' : 's'} selected.</p>
      </fieldset>

      <div style="display:flex;flex-direction:column;gap:8px">
        <button type="button" class="btn btn-primary" data-copy="question">Copy for Claude</button>
        <div class="btn-row">
          <button type="button" class="btn" style="flex:1" data-import>Import Claude’s reply</button>
          <button type="button" class="btn btn-ghost btn-sm" data-save="question">Save as file</button>
        </div>
      </div>
    </div>`}`;

    const qEl = $('#question', main);
    qEl.addEventListener('input', () => { question = qEl.value; session.question = question; });
    main.querySelectorAll('[data-region]').forEach((b) => {
      b.onclick = () => { const id = b.dataset.region; if (selected.has(id)) selected.delete(id); else selected.add(id); draw(); };
    });
    main.querySelector('[data-inbox]').onclick = () => { includeInbox = !includeInbox; draw(); };
    main.querySelectorAll('[data-fill]').forEach((b) => {
      b.onclick = () => { question = PRESETS[b.dataset.fill].question; session.question = question; draw(); $('#question', main).focus(); };
    });
    main.querySelectorAll('[data-copy]').forEach((b) => { b.onclick = () => act(b.dataset.copy, 'copy'); });
    main.querySelectorAll('[data-save]').forEach((b) => { b.onclick = () => act(b.dataset.save, 'save'); });
    main.querySelector('[data-import]').onclick = () => openImport(ctx);
  };

  function build(kind) {
    if (kind === 'sweep') return { text: buildSweepRequest(), label: 'sweep request' };
    if (kind === 'sort') return { text: PRESETS.sort.build(), label: 'sort request' };
    if (kind === 'win') return { text: PRESETS.win.build(), label: 'win request' };
    const q = ($('#question', main)?.value || '').trim();
    if (!q) { toast('Type a question first.'); $('#question', main)?.focus(); return null; }
    session.question = q;
    return { text: buildQuestionRequest(q, [...selected], { includeInbox }), label: 'question and notes' };
  }

  async function act(kind, how) {
    const r = build(kind);
    if (!r) return;
    if (how === 'save') {
      downloadText(`second-brain-${kind}-${isoDay()}.md`, r.text);
      copiedWhat = '';
      toast('Saved. Attach the file in a Claude chat.');
      return;
    }
    const ok = await copyText(r.text);
    if (ok) { copiedWhat = r.label; draw(); } else {
      downloadText(`second-brain-${kind}-${isoDay()}.md`, r.text);
      toast('Couldn’t copy, so it was saved as a file instead.');
    }
  }

  draw();
  return { update(p) { preset = p.preset || ''; draw(); } };
}

export function openImport(ctx) {
  const s = openSheet(`${html`<form id="imp" novalidate style="display:flex;flex-direction:column;gap:16px">
    <div class="sheet-head"><button type="button" class="btn btn-ghost side" data-cancel style="justify-content:flex-start;padding:0">Cancel</button><h2>Import reply</h2><span class="side"></span></div>
    <p class="hint">Paste Claude’s whole reply, or choose a file it gave you. Nothing is saved until you review it.</p>
    <div class="field"><label for="imp-text">Claude’s reply</label><textarea id="imp-text" rows="8" placeholder="Paste here" spellcheck="false" style="font-size:14px"></textarea></div>
    <label class="btn btn-sm" style="align-self:flex-start">Choose a file<input type="file" accept=".json,.md,.txt,application/json,text/plain,text/markdown" class="sr-only" id="imp-file"></label>
    <p class="error" id="imp-err" role="alert" hidden></p>
    <button type="submit" class="btn btn-primary btn-block">Review</button>
  </form>`}`, { label: 'Import reply' });
  const el = s.el;
  el.querySelector('[data-cancel]').onclick = () => s.close();
  $('#imp-file', el).onchange = async (e) => {
    const f = e.target.files[0];
    if (f) $('#imp-text', el).value = await readFileText(f);
  };
  $('#imp', el).onsubmit = (e) => {
    e.preventDefault();
    const err = $('#imp-err', el);
    try {
      session.reply = parseReply($('#imp-text', el).value);
      s.close();
      ctx.navigate('#/review');
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }
  };
}
