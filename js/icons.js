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
