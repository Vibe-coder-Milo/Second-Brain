// Inline stroke icons (currentColor).
import { raw } from './util.js';

const svg = (inner, { size = 22, sw = 1.8, fill = 'none' } = {}) =>
  raw(`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`);

export const icons = {
  map: (o) => svg('<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><line x1="9" y1="4" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="20"/>', o),
  inbox: (o) => svg('<path d="M3 13h5l2 3h4l2-3h5"/><path d="M5.5 5h13L21 13v6H3v-6z"/>', o),
  plus: (o) => svg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', { sw: 2.2, ...o }),
  notes: (o) => svg('<path d="M6 3h8l5 5v13H6z"/><polyline points="14 3 14 8 19 8"/><line x1="9" y1="13" x2="16" y2="13"/><line x1="9" y1="17" x2="14" y2="17"/>', o),
  ask: (o) => svg('<path d="M4 5h16v11H10l-6 4z"/><line x1="8" y1="9.5" x2="16" y2="9.5"/><line x1="8" y1="12.5" x2="13" y2="12.5"/>', o),
  chats: (o) => svg('<path d="M3 4h13v9H8l-5 4z"/><path d="M19 8h2v11l-4-3h-7v-1"/>', o),
  search: (o) => svg('<circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/>', { sw: 2, size: 18, ...o }),
  cloud: (o) => svg('<path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 11 3.5 3.5 0 0 0 7 18z"/><polyline points="9.5 13.5 11.5 15.5 15 12"/>', o),
  cloudOff: (o) => svg('<path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 11 3.5 3.5 0 0 0 7 18z"/><line x1="4" y1="4" x2="20" y2="20"/>', o),
  cloudSync: (o) => svg('<path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 11 3.5 3.5 0 0 0 7 18z"/><path d="M10 14a2.5 2.5 0 0 1 4.2-1.8"/><polyline points="14.5 11 14.5 12.5 13 12.5"/>', o),
  cloudErr: (o) => svg('<path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 11 3.5 3.5 0 0 0 7 18z"/><line x1="12" y1="10.5" x2="12" y2="13.5"/><line x1="12" y1="15.6" x2="12" y2="15.7"/>', o),
  target: (o) => svg('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/>', { size: 20, ...o }),
  image: (o) => svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><polyline points="21 16 15.5 11 6 20"/>', o),
  camera: (o) => svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', { size: 18, ...o }),
  link: (o) => svg('<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>', o),
  lines: (o) => svg('<line x1="5" y1="7" x2="19" y2="7"/><line x1="5" y1="12" x2="19" y2="12"/><line x1="5" y1="17" x2="13" y2="17"/>', { size: 20, ...o }),
  back: (o) => svg('<polyline points="15 5 8 12 15 19"/>', { sw: 2, ...o }),
  chevron: (o) => svg('<polyline points="9 6 15 12 9 18"/>', { sw: 2, size: 16, ...o }),
  up: (o) => svg('<polyline points="6 15 12 9 18 15"/>', { sw: 2, size: 18, ...o }),
  close: (o) => svg('<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>', { sw: 2, ...o }),
  more: (o) => svg('<circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>', { fill: 'currentColor', sw: 0, ...o }),
  lock: (o) => svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', { size: 14, sw: 2, ...o }),
  unlock: (o) => svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>', { size: 14, sw: 2, ...o }),
  check: (o) => svg('<polyline points="5 12 10 17 19 7"/>', { size: 14, sw: 3, ...o }),
  spinner: (o) => svg('<path d="M12 3a9 9 0 1 0 9 9"/>', { size: 14, sw: 3, ...o }),
  external: (o) => svg('<polyline points="14 4 20 4 20 10"/><line x1="20" y1="4" x2="13" y2="11"/><path d="M18 14v6H4V6h6"/>', { size: 20, ...o }),
  today: (o) => svg('<rect x="4" y="5" width="16" height="15" rx="2"/><line x1="4" y1="9.5" x2="20" y2="9.5"/><line x1="8.5" y1="3" x2="8.5" y2="6.5"/><line x1="15.5" y1="3" x2="15.5" y2="6.5"/><circle cx="12" cy="14.5" r="1.6" fill="currentColor" stroke="none"/>', o),
  notebooks: (o) => svg('<path d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6z"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="12" y1="8" x2="16" y2="8"/>', o),
  tasks: (o) => svg('<rect x="4" y="4" width="16" height="16" rx="3"/><polyline points="8 12 11 15 16 9"/>', o),
  tag: (o) => svg('<path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9z"/><circle cx="8" cy="8" r="1.5"/>', o),
  history: (o) => svg('<path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 4 3 9 8 9"/><polyline points="12 7 12 12 15.5 14"/>', o),
  share: (o) => svg('<path d="M12 3v12"/><polyline points="7 8 12 3 17 8"/><path d="M5 13v7h14v-7"/>', o),
  bold: (o) => svg('<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7z"/><path d="M7 12h7a3.5 3.5 0 0 1 0 7H7z"/>', { sw: 2.2, size: 20, ...o }),
  italic: (o) => svg('<line x1="14" y1="5" x2="10" y2="19"/><line x1="10" y1="5" x2="18" y2="5"/><line x1="6" y1="19" x2="14" y2="19"/>', { size: 20, ...o }),
  underline: (o) => svg('<path d="M7 4v7a5 5 0 0 0 10 0V4"/><line x1="5" y1="20" x2="19" y2="20"/>', { size: 20, ...o }),
  strike: (o) => svg('<path d="M16 7.5C15.5 5.5 14 4.5 12 4.5c-2.5 0-4 1.4-4 3.2 0 1.5 1 2.4 2.5 3"/><path d="M8 16.5c.5 2 2 3 4 3 2.6 0 4.2-1.4 4.2-3.3 0-.8-.2-1.4-.7-1.9"/><line x1="4" y1="12" x2="20" y2="12"/>', { size: 20, ...o }),
  bullets: (o) => svg('<circle cx="5" cy="7" r="1.3" fill="currentColor"/><circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="5" cy="17" r="1.3" fill="currentColor"/><line x1="9.5" y1="7" x2="20" y2="7"/><line x1="9.5" y1="12" x2="20" y2="12"/><line x1="9.5" y1="17" x2="20" y2="17"/>', { size: 20, ...o }),
  numbers: (o) => svg('<path d="M4 5h1.5v4.5" /><path d="M4 14.5c.3-.8 1-1.2 1.7-1.2.8 0 1.3.5 1.3 1.1 0 1.2-3 2.1-3 3.6h3"/><line x1="10.5" y1="7" x2="20" y2="7"/><line x1="10.5" y1="12" x2="20" y2="12"/><line x1="10.5" y1="17" x2="20" y2="17"/>', { size: 20, ...o }),
  checklist: (o) => svg('<rect x="3.5" y="4.5" width="6" height="6" rx="1.2"/><polyline points="4.8 7.6 6.2 9 8.6 6.2"/><rect x="3.5" y="13.5" width="6" height="6" rx="1.2"/><line x1="12.5" y1="7.5" x2="20.5" y2="7.5"/><line x1="12.5" y1="16.5" x2="20.5" y2="16.5"/>', { size: 20, ...o }),
  outdent: (o) => svg('<line x1="11" y1="7" x2="20" y2="7"/><line x1="11" y1="12" x2="20" y2="12"/><line x1="11" y1="17" x2="20" y2="17"/><polyline points="7 9 4 12 7 15"/>', { size: 20, ...o }),
  indent: (o) => svg('<line x1="11" y1="7" x2="20" y2="7"/><line x1="11" y1="12" x2="20" y2="12"/><line x1="11" y1="17" x2="20" y2="17"/><polyline points="4 9 7 12 4 15"/>', { size: 20, ...o }),
  table: (o) => svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><line x1="3.5" y1="9.5" x2="20.5" y2="9.5"/><line x1="3.5" y1="14.5" x2="20.5" y2="14.5"/><line x1="10" y1="4.5" x2="10" y2="19.5"/>', { size: 20, ...o }),
  sticker: (o) => svg('<path d="M12 3.5l2.5 5.3 5.6.6-4.2 3.8 1.2 5.6L12 16l-5.1 2.8 1.2-5.6-4.2-3.8 5.6-.6z"/>', { size: 20, ...o }),
  postit: (o) => svg('<path d="M4 4h16v11l-5 5H4z"/><path d="M15 20v-5h5"/>', { size: 20, ...o }),
  quote: (o) => svg('<path d="M9.5 7H6a1.5 1.5 0 0 0-1.5 1.5V12h5V7zM9.5 12c0 3-1.5 4.5-4 5"/><path d="M19.5 7H16a1.5 1.5 0 0 0-1.5 1.5V12h5V7zM19.5 12c0 3-1.5 4.5-4 5"/>', { size: 20, ...o }),
  divider: (o) => svg('<line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="6" x2="20" y2="6" stroke-opacity=".35"/><line x1="4" y1="18" x2="20" y2="18" stroke-opacity=".35"/>', { size: 20, ...o }),
  calendar: (o) => svg('<rect x="4" y="5" width="16" height="15" rx="2"/><line x1="4" y1="9.5" x2="20" y2="9.5"/><line x1="8.5" y1="3" x2="8.5" y2="6.5"/><line x1="15.5" y1="3" x2="15.5" y2="6.5"/>', { size: 20, ...o }),
  wiki: (o) => raw(`<span class="wiki-ic" aria-hidden="true" style="font-weight:700;font-size:${(o?.size || 20) * 0.7}px;letter-spacing:-0.5px">[[ ]]</span>`),
  keyboardDown: (o) => svg('<rect x="3" y="4" width="18" height="11" rx="2"/><line x1="7" y1="8" x2="7" y2="8"/><line x1="11" y1="8" x2="11" y2="8"/><line x1="15" y1="8" x2="15" y2="8"/><line x1="8" y1="11.5" x2="16" y2="11.5"/><polyline points="9 18 12 21 15 18"/>', { size: 20, ...o }),
  align: (o) => svg('<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="10" x2="14" y2="10"/><line x1="4" y1="14" x2="20" y2="14"/><line x1="4" y1="18" x2="14" y2="18"/>', { size: 20, ...o }),
  alignCenter: (o) => svg('<line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="10" x2="17" y2="10"/><line x1="4" y1="14" x2="20" y2="14"/><line x1="7" y1="18" x2="17" y2="18"/>', { size: 20, ...o }),
  alignRight: (o) => svg('<line x1="4" y1="6" x2="20" y2="6"/><line x1="10" y1="10" x2="20" y2="10"/><line x1="4" y1="14" x2="20" y2="14"/><line x1="10" y1="18" x2="20" y2="18"/>', { size: 20, ...o }),
  undo: (o) => svg('<polyline points="8 5 4 9 8 13"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>', { size: 20, ...o }),
  redo: (o) => svg('<polyline points="16 5 20 9 16 13"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>', { size: 20, ...o }),
  pen: (o) => svg('<path d="M15.5 4.5l4 4L8 20H4v-4z"/><line x1="13" y1="7" x2="17" y2="11"/>', { size: 20, ...o }),
  highlighter: (o) => svg('<path d="M14 4l6 6-8 8H8v-4z"/><path d="M8 14l-4 6h6"/>', { size: 20, ...o }),
  eraser: (o) => svg('<path d="M8.5 20h11"/><path d="M4.5 15.5l9.6-10a2 2 0 0 1 2.8 0l2.6 2.6a2 2 0 0 1 0 2.8L12 18.5l-1.5 1.5H8z"/><line x1="9" y1="10.5" x2="14.5" y2="16"/>', { size: 20, ...o }),
  lasso: (o) => svg('<ellipse cx="12" cy="9" rx="8" ry="5.5" stroke-dasharray="3 2.5"/><path d="M7 13.5c-1 2-.3 3.5 1.5 4 1.4.4 2-.6 1.6-1.5"/><path d="M9.5 16c-.5 2 .5 4 2.5 4.5"/>', { size: 20, ...o }),
  shapes: (o) => svg('<circle cx="8" cy="8" r="4.5"/><rect x="11.5" y="11.5" width="9" height="9" rx="1"/>', { size: 20, ...o }),
  textbox: (o) => svg('<rect x="3.5" y="5" width="17" height="14" rx="2" stroke-dasharray="3 2"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="12" y1="9" x2="12" y2="16"/>', { size: 20, ...o }),
  pages: (o) => svg('<rect x="4" y="3.5" width="7" height="9" rx="1.2"/><rect x="13" y="3.5" width="7" height="9" rx="1.2"/><rect x="4" y="14.5" width="7" height="6" rx="1.2"/><rect x="13" y="14.5" width="7" height="6" rx="1.2"/>', { size: 20, ...o }),
  trash: (o) => svg('<polyline points="4 7 20 7"/><path d="M6 7l1 13h10l1-13"/><path d="M9.5 7V4h5v3"/>', { size: 20, ...o }),
  copy: (o) => svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>', { size: 20, ...o }),
  bookmark: (o) => svg('<path d="M6 3.5h12V21l-6-4.5L6 21z"/>', { size: 20, ...o }),
  zoomIn: (o) => svg('<circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="11" y1="8" x2="11" y2="14"/>', { size: 20, ...o }),
  zoomOut: (o) => svg('<circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/><line x1="8" y1="11" x2="14" y2="11"/>', { size: 20, ...o }),
  hand: (o) => svg('<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5"/><path d="M14 10.5V5.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6 7-2.5 0-4-1-5.5-3.5L3.5 14a1.5 1.5 0 0 1 2.5-1.5L8 15"/>', { size: 20, ...o }),
  pdf: (o) => svg('<path d="M6 3h8l5 5v13H6z"/><polyline points="14 3 14 8 19 8"/><path d="M9 17v-4h1.5a1.2 1.2 0 0 1 0 2.4H9"/>', o),
  download: (o) => svg('<path d="M12 4v11"/><polyline points="7 10 12 15 17 10"/><path d="M5 19h14"/>', o),
  move: (o) => svg('<polyline points="9 5 12 2 15 5"/><polyline points="9 19 12 22 15 19"/><polyline points="5 9 2 12 5 15"/><polyline points="19 9 22 12 19 15"/><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/>', { size: 20, ...o }),
  folder: (o) => svg('<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z"/>', o),
  sub: (o) => svg('<path d="M6 4v9a3 3 0 0 0 3 3h9"/><polyline points="15 13 18 16 15 19"/>', { size: 18, ...o }),
  mic: (o) => svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><line x1="12" y1="17.5" x2="12" y2="21"/>', o),
  headphones: (o) => svg('<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3.5" y="14" width="4" height="6.5" rx="1.5"/><rect x="16.5" y="14" width="4" height="6.5" rx="1.5"/>', o),
  play: (o) => svg('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>', o),
  pause: (o) => svg('<rect x="7" y="5.5" width="3.5" height="13" rx="1" fill="currentColor" stroke="none"/><rect x="13.5" y="5.5" width="3.5" height="13" rx="1" fill="currentColor" stroke="none"/>', o),
  back15: (o) => svg('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><polyline points="4 3.5 4 8 8.5 8"/><text x="12" y="15.5" font-size="7" font-family="Overpass, sans-serif" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">15</text>', o),
  fwd15: (o) => svg('<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><polyline points="20 3.5 20 8 15.5 8"/><text x="12" y="15.5" font-size="7" font-family="Overpass, sans-serif" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">15</text>', o),
  transcript: (o) => svg('<path d="M5 4h14v12H9l-4 4z"/><line x1="8.5" y1="8.5" x2="15.5" y2="8.5"/><line x1="8.5" y1="12" x2="13" y2="12"/>', o),
  scan: (o) => svg('<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><line x1="4" y1="12" x2="20" y2="12"/>', o),
  layers: (o) => svg('<polygon points="12 3.5 21 8.5 12 13.5 3 8.5"/><polyline points="3 12.5 12 17.5 21 12.5"/><polyline points="3 16.5 12 21.5 21 16.5"/>', o),
  board: (o) => svg('<rect x="3" y="4" width="18" height="15" rx="2"/><rect x="6.5" y="7.5" width="5" height="4" rx="0.8"/><rect x="13.5" y="11.5" width="4.5" height="4.5" rx="0.8"/><path d="M11.5 9.5h3.5v2"/>', o),
  grid: (o) => svg('<rect x="4" y="4" width="7" height="7" rx="1.2"/><rect x="13" y="4" width="7" height="7" rx="1.2"/><rect x="4" y="13" width="7" height="7" rx="1.2"/><rect x="13" y="13" width="7" height="7" rx="1.2"/>', o),
  timeline: (o) => svg('<line x1="3" y1="12" x2="21" y2="12"/><circle cx="7" cy="12" r="2" fill="currentColor"/><circle cx="13" cy="12" r="2" fill="currentColor"/><circle cx="18" cy="12" r="2" fill="currentColor"/>', o),
  kanban: (o) => svg('<rect x="4" y="4" width="4.5" height="14" rx="1"/><rect x="10" y="4" width="4.5" height="9" rx="1"/><rect x="16" y="4" width="4.5" height="11" rx="1"/>', o),
  type: (o) => svg('<polyline points="5 7.5 5 5 19 5 19 7.5"/><line x1="12" y1="5" x2="12" y2="19"/><line x1="9" y1="19" x2="15" y2="19"/>', o),
  callout: (o) => svg('<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><line x1="7.5" y1="10" x2="16.5" y2="10"/><line x1="7.5" y1="14" x2="13" y2="14"/>', o),
  front: (o) => svg('<rect x="4" y="14" width="16" height="6" rx="1.5"/><line x1="12" y1="11" x2="12" y2="3"/><polyline points="8.5 6.5 12 3 15.5 6.5"/>', o),
  fit: (o) => svg('<polyline points="4 9 4 4 9 4"/><polyline points="15 4 20 4 20 9"/><polyline points="20 15 20 20 15 20"/><polyline points="9 20 4 20 4 15"/>', o),
  select: (o) => svg('<path d="M6 3.5l12 7-5.5 1.5L10 18z"/>', o),
  arrow: (o) => svg('<line x1="5" y1="19" x2="19" y2="5"/><polyline points="10 5 19 5 19 14"/>', o),
  frame: (o) => svg('<line x1="7" y1="3" x2="7" y2="21"/><line x1="17" y1="3" x2="17" y2="21"/><line x1="3" y1="7" x2="21" y2="7"/><line x1="3" y1="17" x2="21" y2="17"/>', o),
  eye: (o) => svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>', o),
  eyeOff: (o) => svg('<path d="M10 5.7A10 10 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.8M6.4 6.9C3.9 8.6 2.5 12 2.5 12s3.5 6.5 9.5 6.5a9.6 9.6 0 0 0 4.4-1"/><line x1="3" y1="3" x2="21" y2="21"/>', o),
  zoomBox: (o) => svg('<rect x="3" y="5" width="11" height="8" rx="1.2"/><path d="M8 16v3h13v-7h-4"/>', o),
  settings: (o) => svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', o),
};

// Decorative contour mark used on the unlock and onboarding screens.
export const contourArt = raw(`<svg class="gate-art" viewBox="0 0 390 300" aria-hidden="true">
<g fill="none" stroke="currentColor" stroke-width="1">
<ellipse cx="195" cy="150" rx="178" ry="138" transform="rotate(-8 195 150)" stroke-opacity="0.08"/>
<ellipse cx="190" cy="152" rx="150" ry="116" transform="rotate(-6 190 152)" stroke-opacity="0.1"/>
<ellipse cx="186" cy="154" rx="122" ry="94" transform="rotate(-4 186 154)" stroke-opacity="0.13"/>
<ellipse cx="182" cy="156" rx="96" ry="74" transform="rotate(-2 182 156)" stroke-opacity="0.16"/>
<ellipse cx="180" cy="158" rx="70" ry="54" stroke-opacity="0.2"/>
<ellipse cx="178" cy="160" rx="44" ry="34" transform="rotate(4 178 160)" stroke-opacity="0.24"/>
<ellipse cx="176" cy="161" rx="20" ry="15" transform="rotate(6 176 161)" stroke-opacity="0.3"/>
</g>
<g stroke="currentColor" stroke-opacity="0.25" stroke-width="1">
<line x1="176" y1="161" x2="104" y2="92"/><line x1="176" y1="161" x2="276" y2="106"/><line x1="176" y1="161" x2="262" y2="226"/><line x1="176" y1="161" x2="118" y2="232"/><line x1="104" y1="92" x2="276" y2="106"/>
</g>
<g stroke="var(--bg)" stroke-width="2">
<circle cx="104" cy="92" r="6" fill="#C0802F"/><circle cx="276" cy="106" r="6" fill="#B85558"/><circle cx="262" cy="226" r="6" fill="#2F8A72"/><circle cx="118" cy="232" r="6" fill="#4277B5"/><circle cx="176" cy="161" r="8" fill="#8C67B0"/>
</g></svg>`);
