// Review what Claude sent back (sweep results, an answer, inbox sorting) before
// anything is saved.

import { html, raw, fmtDate, toast } from '../util.js';
import { state, sealedState } from '../vault.js';
import { regionColors, typeName, titleIndex } from '../model.js';
import { session, applyReply, describeUpdate } from '../claude.js';
import { renderMarkdown } from '../markdown.js';
import { icons } from '../icons.js';

export function mount(main, params, ctx) {
  const reply = session.reply;
  if (!reply) {
    main.innerHTML = `${html`<div class="page"><div class="empty"><p class="serif">Nothing to review</p><p style="margin:0">Import a reply from Claude on the Ask screen.</p><a class="btn" href="#/ask">Go to Ask Claude</a></div></div>`}`;
    return {};
  }
  const choices = { newNotes: {}, updates: {}, skipped: {}, saveAnswer: reply.kind === 'answer', question: session.question };
  for (const nn of reply.newNotes) choices.newNotes[nn.ref] = { keep: true, region: nn.region, seal: nn.sealSuggested && sealedState() !== 'none' };
  reply.updates.forEach((u, i) => { choices.updates[i] = true; });
  const regions = state.config.regions;
  const idx = titleIndex([...state.notes.values()]);
  const sealMode = sealedState();

  const titles = { sweep: 'Sweep results', sort: 'Inbox sort', answer: 'Claude’s reply', win: 'New highlight' };
  const keepCount = () => reply.newNotes.filter((n) => choices.newNotes[n.ref].keep).length + Object.values(choices.skipped).filter(Boolean).length;
  const updCount = () => Object.values(choices.updates).filter(Boolean).length;

  const draw = () => {
    const sw = reply.sweep;
    const n = reply.newNotes.length;
    main.innerHTML = `${html`<div class="page" style="gap:20px">
      <div class="topbar"><button type="button" class="back" data-cancel>Cancel</button><span style="font-weight:600">${titles[reply.kind] || 'Review'}</span><span style="min-width:64px"></span></div>
      <div>
        <h1 class="page-title">${reply.kind === 'sweep' ? `${n} worth keeping` : reply.kind === 'sort' ? `${reply.updates.length} suggestion${reply.updates.length === 1 ? '' : 's'}` : reply.answer ? 'Answer' : `${n} new note${n === 1 ? '' : 's'}`}</h1>
        ${reply.kind === 'sweep' ? html`<p class="page-sub">${sw?.chatsReviewed ? `From ${sw.chatsReviewed} chats` : 'From your chats'}${sw?.from ? `, ${fmtDate(Date.parse(sw.from))} to ${fmtDate(Date.parse(sw.to || Date.now()))}` : ''}. ${reply.skipped.length} skipped as lookups or one-off tasks. Untick anything you don’t want.</p>` : html`<p class="page-sub">${n || reply.updates.length ? 'Untick anything you don’t want. Nothing is saved until you confirm.' : 'Save it as a note if you want to keep it.'}</p>`}
      </div>

      ${reply.answer ? html`<section class="answer"><div class="md">${raw(renderMarkdown(reply.answer, (t) => idx.get(t.toLowerCase())))}</div>
        <label class="check" style="margin-top:8px"><input type="checkbox" data-save-answer ${choices.saveAnswer ? raw('checked') : ''}> Save this answer as a note</label></section>` : ''}

      ${n ? html`<section style="display:flex;flex-direction:column;gap:8px">
        ${reply.kind !== 'sweep' ? html`<h2 class="section-title">New notes</h2>` : ''}
        <div class="rows">${reply.newNotes.map((nn) => {
          const c = choices.newNotes[nn.ref];
          const meta = [typeName(nn.type)];
          if (nn.chat?.title) meta.push(`from “${nn.chat.title}”`);
          return html`<div class="review-item">
            <input type="checkbox" data-keep="${nn.ref}" ${c.keep ? raw('checked') : ''} aria-label="Keep: ${nn.title}">
            <div class="row-main">
              <span class="row-meta"><span>${meta.join(', ')}</span></span>
              <p class="row-title serif" style="margin:0">${nn.title || nn.body.slice(0, 80)}</p>
              ${nn.why ? html`<p class="why">${nn.why}</p>` : ''}
              <div class="file-in">
                <label class="sr-only" for="rg-${nn.ref}">Region for ${nn.title}</label>
                <select id="rg-${nn.ref}" class="region-select" data-region="${nn.ref}">
                  <option value="" ${!c.region ? raw('selected') : ''}>Inbox, decide later</option>
                  ${regions.map((r) => html`<option value="${r.id}" ${c.region === r.id ? raw('selected') : ''}>Suggest: ${r.name}</option>`)}
                </select>
                ${c.region ? html`<span class="dot" style="background:${regionColors(regions.find((r) => r.id === c.region)).dot}"></span>` : ''}
              </div>
              ${nn.sealSuggested ? html`<div class="seal-box"><span class="flag">Personal. Consider sealing.</span>
                ${sealMode === 'none' ? html`<span class="hint">Set up sealed notes in Settings</span>` : html`<label class="check" style="min-height:32px;font-size:14px"><input type="checkbox" data-seal="${nn.ref}" ${c.seal ? raw('checked') : ''}> Seal</label>`}</div>` : ''}
            </div>
          </div>`;
        })}</div>
      </section>` : ''}

      ${reply.updates.length ? html`<section style="display:flex;flex-direction:column;gap:8px">
        <h2 class="section-title">${reply.kind === 'sort' ? 'Inbox' : 'Updates to notes you have'}</h2>
        <div class="rows">${reply.updates.map((u, i) => {
          const d = describeUpdate(u);
          return html`<div class="review-item">
            <input type="checkbox" data-upd="${i}" ${choices.updates[i] ? raw('checked') : ''} aria-label="Apply update to ${d.title}">
            <div class="row-main">
              <p class="row-title serif" style="margin:0">${d.title}</p>
              <p class="why">${d.what.charAt(0).toUpperCase() + d.what.slice(1)}${u.why ? `. ${u.why}` : ''}</p>
            </div>
          </div>`;
        })}</div>
      </section>` : ''}

      ${reply.suggestedLinks.length ? html`<p class="hint" style="display:flex;gap:8px;align-items:center">${icons.link({ size: 16 })}${reply.suggestedLinks.length} suggested link${reply.suggestedLinks.length === 1 ? '' : 's'} will show as dashed lines on your map, for you to accept or dismiss.</p>` : ''}

      ${reply.skipped.length ? html`<details class="skipped" open>
        <summary>${reply.skipped.length} skipped</summary>
        <ul>${reply.skipped.map((sk, i) => html`<li><span style="flex:1;min-width:0">${sk.chatTitle}${sk.reason ? html`<span class="hint">, ${sk.reason}</span>` : ''}</span>
          <button type="button" class="btn btn-ghost btn-sm" aria-pressed="${choices.skipped[i] ? 'true' : 'false'}" data-skip="${i}">${choices.skipped[i] ? 'Keeping' : 'Keep'}</button></li>`)}</ul>
      </details>` : ''}

      <div style="display:flex;flex-direction:column;gap:8px">
        <button type="button" class="btn btn-primary" data-apply>${applyLabel()}</button>
        ${reply.kind === 'sweep' ? html`<p class="hint" style="text-align:center">Next sweep starts from today</p>` : ''}
      </div>
    </div>`}`;
    bind();
  };

  function applyLabel() {
    const k = keepCount();
    const u = updCount();
    const parts = [];
    if (k) parts.push(`Add ${k} to inbox`);
    if (u) parts.push(`apply ${u} update${u === 1 ? '' : 's'}`);
    if (!parts.length) return reply.answer && choices.saveAnswer ? 'Save answer' : 'Done';
    const s = parts.join(', ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function bind() {
    const label = () => { main.querySelector('[data-apply]').textContent = applyLabel(); };
    main.querySelector('[data-cancel]').onclick = () => { session.reply = null; ctx.navigate('#/ask', { replace: true }); };
    main.querySelectorAll('[data-keep]').forEach((b) => { b.onchange = () => { choices.newNotes[b.dataset.keep].keep = b.checked; label(); }; });
    main.querySelectorAll('[data-region]').forEach((b) => { b.onchange = () => { choices.newNotes[b.dataset.region].region = b.value || null; draw(); }; });
    main.querySelectorAll('[data-seal]').forEach((b) => { b.onchange = () => { choices.newNotes[b.dataset.seal].seal = b.checked; }; });
    main.querySelectorAll('[data-upd]').forEach((b) => { b.onchange = () => { choices.updates[b.dataset.upd] = b.checked; label(); }; });
    main.querySelectorAll('[data-skip]').forEach((b) => { b.onclick = () => { const i = b.dataset.skip; choices.skipped[i] = !choices.skipped[i]; draw(); }; });
    const sa = main.querySelector('[data-save-answer]');
    if (sa) sa.onchange = () => { choices.saveAnswer = sa.checked; label(); };
    main.querySelector('[data-apply]').onclick = apply;
  }

  async function apply() {
    const btn = main.querySelector('[data-apply]');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      const wantSeal = reply.newNotes.some((nn) => choices.newNotes[nn.ref].keep && choices.newNotes[nn.ref].seal);
      if (wantSeal && !state.keys.s) {
        const ok = await ctx.unlockSealed();
        if (!ok) for (const nn of reply.newNotes) choices.newNotes[nn.ref].seal = false;
      }
      const r = await applyReply(reply, choices);
      session.reply = null;
      const parts = [];
      if (r.created + r.rescued) parts.push(`${r.created + r.rescued} added to inbox`);
      if (r.updated) parts.push(`${r.updated} updated`);
      if (r.suggested) parts.push(`${r.suggested} link${r.suggested === 1 ? '' : 's'} suggested`);
      toast(parts.length ? parts.join(', ') : 'Done');
      if (r.answerNote && !r.created) ctx.navigate(`#/note/${r.answerNote.id}`, { replace: true });
      else ctx.navigate(r.created + r.rescued ? '#/inbox' : '#/map', { replace: true });
    } catch (e) {
      console.error(e);
      toast(e.message || 'Couldn’t save everything. Try again.');
      btn.disabled = false;
      btn.textContent = applyLabel();
    }
  }

  draw();
  return {};
}
