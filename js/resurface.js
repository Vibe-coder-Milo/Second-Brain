// Old notes coming back to you on Today: what you wrote on this day in past
// years, and one older note worth another look (a different one each day,
// picked by itself). Sealed notes never show here.

import { isoOf } from './notework.js';

const DAY = 24 * 3600 * 1000;
// "Worth another look" picks from notes at least this old and this long untouched.
export const LOOK_AGE_DAYS = 45;

const usable = (n) => !n.sealed && !n.binnedAt && (n.title || n.body || n.doc || n.pages?.length);

// Notes made on this month and day in earlier years, newest year first.
export function onThisDay(notes, iso) {
  const md = iso.slice(5);
  const year = Number(iso.slice(0, 4));
  return notes
    .filter((n) => usable(n) && isoOf(n.createdAt).slice(5) === md && Number(isoOf(n.createdAt).slice(0, 4)) < year)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((n) => ({ note: n, yearsAgo: year - Number(isoOf(n.createdAt).slice(0, 4)) }));
}

// A small, steady hash: the same day and note always give the same number.
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

// The older notes that could come back today, best first. Older and longer
// untouched counts for more, and notes you linked or labelled a little more;
// the day's own shuffle keeps it from being the same note every day.
// `skip`: ids already shown or passed over today.
export function worthAnotherLook(notes, iso, { now = Date.now(), skip = [], exclude = [] } = {}) {
  const gone = new Set([...skip, ...exclude]);
  const min = LOOK_AGE_DAYS * DAY;
  return notes
    .filter((n) => usable(n) && !n.daily && !n.inbox && !gone.has(n.id) && now - n.createdAt >= min && now - n.updatedAt >= min)
    .map((n) => {
      const idle = (now - n.updatedAt) / DAY;
      const extra = 1 + (n.links?.length ? 0.3 : 0) + (n.labels?.length ? 0.2 : 0);
      return { note: n, score: Math.log(1 + idle) * extra * (0.35 + hash(`${iso}:${n.id}`)) };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.note);
}
