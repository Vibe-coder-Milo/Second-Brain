// Notebook covers: the artwork from the approved cover library, drawn as SVG.
// One hidden sprite holds the shared art; each cover <use>s it and adds a title.

import { esc } from './util.js';
import { MORE_ART } from './coverart.js';
import { NEW_ART, NEW_COVERS } from './coverart2.js';

const SPRITE = "<pattern id=\"cv-pt-pera\" patternUnits=\"userSpaceOnUse\" width=\"70\" height=\"70\"> <rect width=\"70\" height=\"70\" fill=\"#F6EFE2\"/> <circle cx=\"0\" cy=\"0\" r=\"17\" fill=\"#2A8C9C\"/><circle cx=\"70\" cy=\"0\" r=\"17\" fill=\"#2A8C9C\"/><circle cx=\"0\" cy=\"70\" r=\"17\" fill=\"#2A8C9C\"/><circle cx=\"70\" cy=\"70\" r=\"17\" fill=\"#2A8C9C\"/> <circle cx=\"0\" cy=\"0\" r=\"8\" fill=\"#F2B8A2\"/><circle cx=\"70\" cy=\"0\" r=\"8\" fill=\"#F2B8A2\"/><circle cx=\"0\" cy=\"70\" r=\"8\" fill=\"#F2B8A2\"/><circle cx=\"70\" cy=\"70\" r=\"8\" fill=\"#F2B8A2\"/> <path d=\"M35 9 L61 35 L35 61 L9 35 Z\" fill=\"none\" stroke=\"#2A8C9C\" stroke-width=\"1.5\"/> <g fill=\"#4F8A5B\"><ellipse cx=\"44\" cy=\"26\" rx=\"2.5\" ry=\"6\" transform=\"rotate(45 44 26)\"/><ellipse cx=\"44\" cy=\"44\" rx=\"2.5\" ry=\"6\" transform=\"rotate(-45 44 44)\"/><ellipse cx=\"26\" cy=\"44\" rx=\"2.5\" ry=\"6\" transform=\"rotate(45 26 44)\"/><ellipse cx=\"26\" cy=\"26\" rx=\"2.5\" ry=\"6\" transform=\"rotate(-45 26 26)\"/></g> <g fill=\"#D9644E\"><ellipse cx=\"35\" cy=\"25\" rx=\"5.5\" ry=\"9\"/><ellipse cx=\"45\" cy=\"35\" rx=\"9\" ry=\"5.5\"/><ellipse cx=\"35\" cy=\"45\" rx=\"5.5\" ry=\"9\"/><ellipse cx=\"25\" cy=\"35\" rx=\"9\" ry=\"5.5\"/></g> <circle cx=\"35\" cy=\"35\" r=\"4.5\" fill=\"#E0A526\"/> </pattern> <pattern id=\"cv-pt-kraft\" patternUnits=\"userSpaceOnUse\" width=\"36\" height=\"36\"><rect width=\"36\" height=\"36\" fill=\"#C59D6E\"/><g stroke-width=\"0.8\" stroke-linecap=\"round\"><line x1=\"3\" y1=\"5\" x2=\"9\" y2=\"6\" stroke=\"#A67C4F\" stroke-opacity=\"0.55\"/><line x1=\"18\" y1=\"3\" x2=\"22\" y2=\"8\" stroke=\"#DDBB90\" stroke-opacity=\"0.7\"/><line x1=\"28\" y1=\"14\" x2=\"34\" y2=\"13\" stroke=\"#A67C4F\" stroke-opacity=\"0.45\"/><line x1=\"6\" y1=\"20\" x2=\"8\" y2=\"26\" stroke=\"#DDBB90\" stroke-opacity=\"0.6\"/><line x1=\"14\" y1=\"29\" x2=\"21\" y2=\"30\" stroke=\"#A67C4F\" stroke-opacity=\"0.5\"/><line x1=\"25\" y1=\"24\" x2=\"27\" y2=\"31\" stroke=\"#DDBB90\" stroke-opacity=\"0.5\"/></g></pattern> <pattern id=\"cv-pt-terr\" patternUnits=\"userSpaceOnUse\" width=\"90\" height=\"90\"><rect width=\"90\" height=\"90\" fill=\"#E7E3DC\"/> <polygon points=\"8,10 15,7 17,14 10,17\" fill=\"#C8664B\"/><polygon points=\"30,22 36,20 38,27 31,29 28,25\" fill=\"#8FA88A\"/><polygon points=\"55,8 60,6 63,11 57,13\" fill=\"#1B2A38\"/><polygon points=\"72,18 82,15 84,24 75,27\" fill=\"#E0A526\"/><polygon points=\"12,40 18,38 20,46 13,47\" fill=\"#FFFFFF\"/><polygon points=\"40,44 48,41 51,50 43,53 39,49\" fill=\"#C8664B\"/><polygon points=\"66,40 70,38 73,43 68,45\" fill=\"#B9C5D6\"/><polygon points=\"80,52 87,50 88,57 82,58\" fill=\"#8FA88A\"/><polygon points=\"20,62 27,60 29,68 22,70\" fill=\"#1B2A38\"/><polygon points=\"48,70 58,66 61,75 52,79\" fill=\"#8FA88A\"/><polygon points=\"70,74 75,72 77,78 72,79\" fill=\"#C8664B\"/><polygon points=\"5,80 9,78 11,84 6,85\" fill=\"#E0A526\"/><polygon points=\"34,84 38,82 40,87 35,88\" fill=\"#FFFFFF\"/> <g fill=\"#8B8378\"><circle cx=\"24\" cy=\"12\" r=\"0.9\"/><circle cx=\"62\" cy=\"30\" r=\"0.8\"/><circle cx=\"30\" cy=\"52\" r=\"0.9\"/><circle cx=\"86\" cy=\"80\" r=\"0.8\"/><circle cx=\"58\" cy=\"88\" r=\"0.7\"/></g></pattern> <pattern id=\"cv-pt-bpf\" patternUnits=\"userSpaceOnUse\" width=\"10\" height=\"10\"><path d=\"M10 0 V10 M0 10 H10\" fill=\"none\" stroke=\"#FFFFFF\" stroke-opacity=\"0.09\" stroke-width=\"0.5\"/></pattern> <pattern id=\"cv-pt-bpm\" patternUnits=\"userSpaceOnUse\" width=\"50\" height=\"50\"><path d=\"M50 0 V50 M0 50 H50\" fill=\"none\" stroke=\"#FFFFFF\" stroke-opacity=\"0.2\" stroke-width=\"0.8\"/></pattern> <pattern id=\"cv-pt-half\" patternUnits=\"userSpaceOnUse\" width=\"6\" height=\"6\"><circle cx=\"3\" cy=\"3\" r=\"1.4\" fill=\"#1B2A38\"/></pattern> <pattern id=\"cv-pt-linen\" patternUnits=\"userSpaceOnUse\" width=\"4\" height=\"4\"><path d=\"M0 1 H4\" stroke=\"#000000\" stroke-opacity=\"0.14\" stroke-width=\"0.6\"/><path d=\"M2 0 V4\" stroke=\"#FFFFFF\" stroke-opacity=\"0.06\" stroke-width=\"0.6\"/></pattern> <symbol id=\"cv-contour\" viewBox=\"0 0 210 280\"> <rect width=\"210\" height=\"280\" fill=\"#1B2A38\"/> <g fill=\"none\" stroke=\"#C0802F\" stroke-width=\"1.2\"><ellipse cx=\"150\" cy=\"205\" rx=\"18\" ry=\"14\" transform=\"rotate(-12 150 205)\" stroke-opacity=\"0.9\"/><ellipse cx=\"150\" cy=\"205\" rx=\"40\" ry=\"31\" transform=\"rotate(-12 150 205)\" stroke-opacity=\"0.75\"/><ellipse cx=\"150\" cy=\"205\" rx=\"62\" ry=\"48\" transform=\"rotate(-12 150 205)\" stroke-opacity=\"0.6\"/><ellipse cx=\"150\" cy=\"205\" rx=\"86\" ry=\"66\" transform=\"rotate(-12 150 205)\" stroke-opacity=\"0.48\"/><ellipse cx=\"150\" cy=\"205\" rx=\"112\" ry=\"86\" transform=\"rotate(-12 150 205)\" stroke-opacity=\"0.38\"/><ellipse cx=\"150\" cy=\"205\" rx=\"140\" ry=\"108\" transform=\"rotate(-12 150 205)\" stroke-opacity=\"0.28\"/><ellipse cx=\"150\" cy=\"205\" rx=\"170\" ry=\"132\" transform=\"rotate(-12 150 205)\" stroke-opacity=\"0.2\"/></g> <g fill=\"none\" stroke=\"#4FB396\" stroke-width=\"1.2\"><ellipse cx=\"176\" cy=\"44\" rx=\"14\" ry=\"10\" stroke-opacity=\"0.55\"/><ellipse cx=\"176\" cy=\"44\" rx=\"30\" ry=\"22\" stroke-opacity=\"0.38\"/><ellipse cx=\"176\" cy=\"44\" rx=\"48\" ry=\"36\" stroke-opacity=\"0.24\"/></g> <line x1=\"150\" y1=\"205\" x2=\"176\" y2=\"44\" stroke=\"#E4ECE9\" stroke-opacity=\"0.3\" stroke-dasharray=\"3 4\"/> <circle cx=\"150\" cy=\"205\" r=\"4.5\" fill=\"#E8B97E\"/><circle cx=\"176\" cy=\"44\" r=\"3\" fill=\"#8FD3BE\"/> <rect width=\"12\" height=\"280\" fill=\"#000000\" fill-opacity=\"0.22\"/><line x1=\"12.5\" y1=\"0\" x2=\"12.5\" y2=\"280\" stroke=\"#FFFFFF\" stroke-opacity=\"0.14\"/> </symbol> <symbol id=\"cv-night\" viewBox=\"0 0 210 280\"> <rect width=\"210\" height=\"280\" fill=\"#101C2B\"/> <g fill=\"#E4ECE9\"><circle cx=\"30\" cy=\"30\" r=\"0.8\" fill-opacity=\"0.7\"/><circle cx=\"92\" cy=\"22\" r=\"0.7\" fill-opacity=\"0.6\"/><circle cx=\"170\" cy=\"26\" r=\"0.8\" fill-opacity=\"0.7\"/><circle cx=\"196\" cy=\"58\" r=\"1.1\" fill-opacity=\"0.8\"/><circle cx=\"40\" cy=\"90\" r=\"0.7\" fill-opacity=\"0.5\"/><circle cx=\"186\" cy=\"110\" r=\"0.7\" fill-opacity=\"0.6\"/><circle cx=\"28\" cy=\"140\" r=\"1\" fill-opacity=\"0.8\"/><circle cx=\"140\" cy=\"132\" r=\"0.7\" fill-opacity=\"0.5\"/><circle cx=\"176\" cy=\"150\" r=\"1\" fill-opacity=\"0.8\"/><circle cx=\"50\" cy=\"186\" r=\"0.8\" fill-opacity=\"0.6\"/><circle cx=\"90\" cy=\"200\" r=\"1\" fill-opacity=\"0.8\"/><circle cx=\"126\" cy=\"180\" r=\"0.7\" fill-opacity=\"0.5\"/><circle cx=\"32\" cy=\"230\" r=\"0.9\" fill-opacity=\"0.7\"/><circle cx=\"70\" cy=\"250\" r=\"0.7\" fill-opacity=\"0.6\"/><circle cx=\"110\" cy=\"236\" r=\"1.1\" fill-opacity=\"0.8\"/><circle cx=\"150\" cy=\"60\" r=\"0.6\" fill-opacity=\"0.6\"/><circle cx=\"20\" cy=\"60\" r=\"0.6\" fill-opacity=\"0.5\"/></g> <polyline points=\"58,48 80,76 118,98 150,84 130,40\" fill=\"none\" stroke=\"#A9C6EA\" stroke-opacity=\"0.6\" stroke-width=\"0.8\"/><polyline points=\"118,98 100,150 64,128\" fill=\"none\" stroke=\"#A9C6EA\" stroke-opacity=\"0.6\" stroke-width=\"0.8\"/> <g fill=\"#E4ECE9\"><circle cx=\"58\" cy=\"48\" r=\"2\"/><circle cx=\"80\" cy=\"76\" r=\"2.4\"/><circle cx=\"118\" cy=\"98\" r=\"1.8\"/><circle cx=\"150\" cy=\"84\" r=\"2.2\"/><circle cx=\"130\" cy=\"40\" r=\"1.8\"/><circle cx=\"100\" cy=\"150\" r=\"2\"/><circle cx=\"64\" cy=\"128\" r=\"1.6\"/></g> <g fill=\"none\" stroke=\"#A9C6EA\" stroke-width=\"0.7\"><circle cx=\"168\" cy=\"230\" r=\"24\" stroke-opacity=\"0.45\"/><circle cx=\"168\" cy=\"230\" r=\"17\" stroke-opacity=\"0.3\" stroke-dasharray=\"2 2\"/><line x1=\"168\" y1=\"200\" x2=\"168\" y2=\"260\" stroke-opacity=\"0.4\"/><line x1=\"138\" y1=\"230\" x2=\"198\" y2=\"230\" stroke-opacity=\"0.4\"/></g> <polygon points=\"168,208 172,226 190,230 172,234 168,252 164,234 146,230 164,226\" fill=\"#A9C6EA\" fill-opacity=\"0.35\" stroke=\"#A9C6EA\" stroke-width=\"0.6\"/> <text x=\"168\" y=\"198\" font-family=\"Overpass, sans-serif\" font-size=\"8\" fill=\"#A9C6EA\" text-anchor=\"middle\">N</text> <rect width=\"12\" height=\"280\" fill=\"#000000\" fill-opacity=\"0.22\"/><line x1=\"12.5\" y1=\"0\" x2=\"12.5\" y2=\"280\" stroke=\"#FFFFFF\" stroke-opacity=\"0.14\"/> </symbol> <symbol id=\"cv-pera\" viewBox=\"0 0 210 280\"> <rect width=\"210\" height=\"280\" fill=\"url(#cv-pt-pera)\"/> <rect x=\"36\" y=\"198\" width=\"150\" height=\"50\" fill=\"#F6EFE2\" stroke=\"#2A8C9C\" stroke-width=\"2.5\"/><rect x=\"40\" y=\"202\" width=\"142\" height=\"42\" fill=\"none\" stroke=\"#D9644E\" stroke-width=\"0.8\"/> <rect width=\"12\" height=\"280\" fill=\"#000000\" fill-opacity=\"0.2\"/> </symbol> <symbol id=\"cv-marbled\" viewBox=\"0 0 210 280\"> <rect width=\"210\" height=\"280\" fill=\"#E3EBF2\"/> <g fill=\"none\" stroke-linecap=\"round\"> <path d=\"M-10 18 C 30 8, 70 28, 110 18 S 190 8, 230 18\" stroke=\"#1B2A38\" stroke-width=\"2.5\"/><path d=\"M-10 30 C 30 18, 70 42, 110 30 S 190 18, 230 30\" stroke=\"#C0802F\" stroke-width=\"6\"/><path d=\"M-10 44 C 34 34, 66 56, 110 44 S 186 32, 230 44\" stroke=\"#FFFFFF\" stroke-width=\"4\"/><path d=\"M-10 58 C 30 44, 70 72, 110 58 S 190 44, 230 58\" stroke=\"#4277B5\" stroke-width=\"9\"/><path d=\"M-10 74 C 40 66, 60 84, 110 74 S 180 64, 230 74\" stroke=\"#B85558\" stroke-width=\"2\"/><path d=\"M-10 86 C 30 74, 70 98, 110 86 S 190 74, 230 86\" stroke=\"#1B2A38\" stroke-width=\"3\"/><path d=\"M-10 100 C 34 88, 66 112, 110 100 S 186 88, 230 100\" stroke=\"#C0802F\" stroke-width=\"5\"/><path d=\"M-10 112 C 30 100, 70 126, 110 112 S 190 98, 230 112\" stroke=\"#FFFFFF\" stroke-width=\"6\"/><path d=\"M-10 126 C 40 116, 60 138, 110 126 S 180 114, 230 126\" stroke=\"#4277B5\" stroke-width=\"7\"/><path d=\"M-10 140 C 30 130, 70 152, 110 140 S 190 128, 230 140\" stroke=\"#1B2A38\" stroke-width=\"2\"/><path d=\"M-10 156 C 34 142, 66 170, 110 156 S 186 142, 230 156\" stroke=\"#B85558\" stroke-width=\"4\"/><path d=\"M-10 170 C 30 160, 70 182, 110 170 S 190 158, 230 170\" stroke=\"#FFFFFF\" stroke-width=\"5\"/><path d=\"M-10 186 C 40 172, 60 200, 110 186 S 180 172, 230 186\" stroke=\"#C0802F\" stroke-width=\"7\"/><path d=\"M-10 200 C 30 190, 70 212, 110 200 S 190 188, 230 200\" stroke=\"#1B2A38\" stroke-width=\"3\"/><path d=\"M-10 214 C 34 202, 66 226, 110 214 S 186 202, 230 214\" stroke=\"#4277B5\" stroke-width=\"8\"/><path d=\"M-10 230 C 30 220, 70 242, 110 230 S 190 218, 230 230\" stroke=\"#FFFFFF\" stroke-width=\"4\"/><path d=\"M-10 246 C 40 234, 60 258, 110 246 S 180 234, 230 246\" stroke=\"#B85558\" stroke-width=\"3\"/><path d=\"M-10 262 C 30 250, 70 274, 110 262 S 190 250, 230 262\" stroke=\"#1B2A38\" stroke-width=\"2.5\"/><path d=\"M-10 276 C 34 266, 66 286, 110 276 S 186 266, 230 276\" stroke=\"#C0802F\" stroke-width=\"5\"/> </g> <rect x=\"44\" y=\"104\" width=\"134\" height=\"66\" fill=\"#FFFFFF\" stroke=\"#1B2A38\" stroke-width=\"1\"/><rect x=\"48\" y=\"108\" width=\"126\" height=\"58\" fill=\"none\" stroke=\"#1B2A38\" stroke-width=\"0.5\"/> <rect width=\"12\" height=\"280\" fill=\"#000000\" fill-opacity=\"0.18\"/><line x1=\"12.5\" y1=\"0\" x2=\"12.5\" y2=\"280\" stroke=\"#FFFFFF\" stroke-opacity=\"0.2\"/> </symbol> <symbol id=\"cv-kraft\" viewBox=\"0 0 210 280\"> <rect width=\"210\" height=\"280\" fill=\"url(#cv-pt-kraft)\"/> <line x1=\"22\" y1=\"0\" x2=\"22\" y2=\"280\" stroke=\"#8A6338\" stroke-width=\"1.2\" stroke-dasharray=\"5 4\"/> <rect x=\"178\" y=\"0\" width=\"11\" height=\"280\" fill=\"#1B2A38\"/><line x1=\"180.5\" y1=\"0\" x2=\"180.5\" y2=\"280\" stroke=\"#FFFFFF\" stroke-opacity=\"0.14\"/> <rect x=\"40\" y=\"66\" width=\"124\" height=\"76\" rx=\"6\" fill=\"#FBF8F1\" stroke=\"#A67C4F\" stroke-width=\"0.8\"/> <line x1=\"52\" y1=\"104\" x2=\"152\" y2=\"104\" stroke=\"#B9D3E8\" stroke-width=\"0.8\"/><line x1=\"52\" y1=\"124\" x2=\"152\" y2=\"124\" stroke=\"#B9D3E8\" stroke-width=\"0.8\"/> <rect width=\"12\" height=\"280\" fill=\"#000000\" fill-opacity=\"0.16\"/> </symbol> <symbol id=\"cv-bauhaus\" viewBox=\"0 0 210 280\"> <rect width=\"210\" height=\"280\" fill=\"#EFEAE0\"/> <circle cx=\"156\" cy=\"64\" r=\"60\" fill=\"#D0452F\"/> <rect x=\"12\" y=\"168\" width=\"96\" height=\"112\" fill=\"#1B2A38\"/> <path d=\"M108 280 A 80 80 0 0 1 188 200 V 280 Z\" fill=\"#E0A526\"/> <line x1=\"12\" y1=\"150\" x2=\"210\" y2=\"150\" stroke=\"#1B2A38\" stroke-width=\"2.5\"/> <circle cx=\"182\" cy=\"172\" r=\"9\" fill=\"#1B2A38\"/> <rect width=\"12\" height=\"280\" fill=\"#000000\" fill-opacity=\"0.16\"/> </symbol> <symbol id=\"cv-terrazzo\" viewBox=\"0 0 210 280\"> <rect width=\"210\" height=\"280\" fill=\"url(#cv-pt-terr)\"/> <rect x=\"40\" y=\"210\" width=\"140\" height=\"40\" rx=\"20\" fill=\"#1B2A38\"/> <rect width=\"12\" height=\"280\" fill=\"#000000\" fill-opacity=\"0.14\"/> </symbol> <symbol id=\"cv-tide\" viewBox=\"0 0 210 280\"> <rect width=\"210\" height=\"280\" fill=\"#DCEEE8\"/> <circle cx=\"160\" cy=\"46\" r=\"16\" fill=\"#F5D76E\"/> <path d=\"M0 78 C 40 64, 80 92, 120 78 S 190 64, 220 78 V280 H0 Z\" fill=\"#A9D3C6\"/> <path d=\"M0 124 C 40 112, 80 138, 120 124 S 190 110, 220 124 V280 H0 Z\" fill=\"#6FB3A0\"/> <path d=\"M0 168 C 40 156, 80 182, 120 168 S 190 154, 220 168 V280 H0 Z\" fill=\"#2F8A72\"/> <path d=\"M0 210 C 40 198, 80 224, 120 210 S 190 196, 220 210 V280 H0 Z\" fill=\"#1F5E4F\"/> <path d=\"M0 248 C 40 238, 80 260, 120 248 S 190 236, 220 248 V280 H0 Z\" fill=\"#143F35\"/> <path d=\"M0 124 C 40 112, 80 138, 120 124 S 190 110, 220 124\" fill=\"none\" stroke=\"#FFFFFF\" stroke-opacity=\"0.35\" stroke-width=\"1\"/> <rect width=\"12\" height=\"280\" fill=\"#000000\" fill-opacity=\"0.16\"/> </symbol> <symbol id=\"cv-blueprint\" viewBox=\"0 0 210 280\"> <rect width=\"210\" height=\"280\" fill=\"#1F4E8C\"/><rect width=\"210\" height=\"280\" fill=\"url(#cv-pt-bpf)\"/><rect width=\"210\" height=\"280\" fill=\"url(#cv-pt-bpm)\"/> <g fill=\"none\" stroke=\"#FFFFFF\"><circle cx=\"110\" cy=\"108\" r=\"46\" stroke-width=\"1.2\" stroke-opacity=\"0.85\"/><circle cx=\"110\" cy=\"108\" r=\"22\" stroke-width=\"1\"/><line x1=\"52\" y1=\"108\" x2=\"168\" y2=\"108\" stroke-width=\"0.6\" stroke-opacity=\"0.7\" stroke-dasharray=\"6 3 1 3\"/><line x1=\"110\" y1=\"50\" x2=\"110\" y2=\"166\" stroke-width=\"0.6\" stroke-opacity=\"0.7\" stroke-dasharray=\"6 3 1 3\"/><circle cx=\"110\" cy=\"70\" r=\"4\" stroke-width=\"0.8\"/><circle cx=\"148\" cy=\"108\" r=\"4\" stroke-width=\"0.8\"/><circle cx=\"110\" cy=\"146\" r=\"4\" stroke-width=\"0.8\"/><circle cx=\"72\" cy=\"108\" r=\"4\" stroke-width=\"0.8\"/><line x1=\"64\" y1=\"184\" x2=\"156\" y2=\"184\" stroke-width=\"0.7\"/><line x1=\"64\" y1=\"178\" x2=\"64\" y2=\"190\" stroke-width=\"0.7\"/><line x1=\"156\" y1=\"178\" x2=\"156\" y2=\"190\" stroke-width=\"0.7\"/><polyline points=\"70,181 64,184 70,187\" stroke-width=\"0.7\"/><polyline points=\"150,181 156,184 150,187\" stroke-width=\"0.7\"/></g> <text x=\"110\" y=\"180\" font-family=\"Overpass, sans-serif\" font-size=\"9\" fill=\"#FFFFFF\" fill-opacity=\"0.85\" text-anchor=\"middle\">\u00d8 92</text> <rect x=\"104\" y=\"218\" width=\"94\" height=\"50\" fill=\"#1F4E8C\" stroke=\"#FFFFFF\" stroke-width=\"1\"/><line x1=\"104\" y1=\"240\" x2=\"198\" y2=\"240\" stroke=\"#FFFFFF\" stroke-width=\"0.7\"/> <text x=\"151\" y=\"257\" font-family=\"Overpass, sans-serif\" font-size=\"8\" fill=\"#FFFFFF\" fill-opacity=\"0.7\" text-anchor=\"middle\">Sheet 1 of 1</text> <rect width=\"12\" height=\"280\" fill=\"#000000\" fill-opacity=\"0.22\"/> </symbol> <symbol id=\"cv-botanical\" viewBox=\"0 0 210 280\"> <rect width=\"210\" height=\"280\" fill=\"#23392F\"/> <g fill=\"#2D4A3D\" stroke=\"#9DB89A\" stroke-width=\"1.4\" stroke-linejoin=\"round\"><path d=\"M150 40 C 200 60, 206 140, 160 172 C 120 150, 110 80, 150 40 Z\"/><path d=\"M70 170 C 30 190, 24 250, 60 290 C 96 262, 104 200, 70 170 Z\"/><path d=\"M190 200 C 170 210, 166 240, 180 266 C 198 250, 206 222, 190 200 Z\"/></g> <g fill=\"none\" stroke=\"#9DB89A\" stroke-width=\"1\" stroke-linecap=\"round\"><path d=\"M150 44 C 156 90, 162 130, 160 170\"/><path d=\"M154 80 L 178 70\"/><path d=\"M157 106 L 186 98\"/><path d=\"M159 132 L 184 130\"/><path d=\"M155 94 L 132 84\"/><path d=\"M158 122 L 130 116\"/><path d=\"M70 174 C 66 210, 62 250, 60 288\"/><path d=\"M68 204 L 46 214\"/><path d=\"M66 232 L 40 246\"/><path d=\"M68 214 L 88 218\"/><path d=\"M64 248 L 86 256\"/><path d=\"M190 204 C 186 226, 182 246, 180 264\"/></g> <rect width=\"12\" height=\"280\" fill=\"#000000\" fill-opacity=\"0.22\"/> </symbol> <symbol id=\"cv-riso\" viewBox=\"0 0 210 280\"> <rect width=\"210\" height=\"280\" fill=\"#F7E8E4\"/> <circle cx=\"88\" cy=\"112\" r=\"62\" fill=\"#00838A\" fill-opacity=\"0.9\" style=\"mix-blend-mode: multiply\"/> <circle cx=\"142\" cy=\"168\" r=\"62\" fill=\"#FF5FA2\" fill-opacity=\"0.85\" style=\"mix-blend-mode: multiply\"/> <circle cx=\"92\" cy=\"108\" r=\"62\" fill=\"none\" stroke=\"#1B2A38\" stroke-opacity=\"0.45\" stroke-width=\"0.8\"/> <circle cx=\"62\" cy=\"214\" r=\"34\" fill=\"url(#cv-pt-half)\"/> <rect width=\"12\" height=\"280\" fill=\"#000000\" fill-opacity=\"0.1\"/> </symbol> <symbol id=\"cv-cloth\" viewBox=\"0 0 210 280\"> <rect width=\"210\" height=\"280\" fill=\"#6E2430\"/><rect width=\"210\" height=\"280\" fill=\"url(#cv-pt-linen)\"/> <rect x=\"30\" y=\"26\" width=\"156\" height=\"228\" rx=\"3\" fill=\"none\" stroke=\"#4E1720\" stroke-width=\"2.4\"/><rect x=\"31.5\" y=\"27.5\" width=\"156\" height=\"228\" rx=\"3\" fill=\"none\" stroke=\"#8A3A47\" stroke-width=\"1\" stroke-opacity=\"0.5\"/> <line x1=\"78\" y1=\"122\" x2=\"138\" y2=\"122\" stroke=\"#D9B36C\" stroke-width=\"0.8\"/><line x1=\"78\" y1=\"160\" x2=\"138\" y2=\"160\" stroke=\"#D9B36C\" stroke-width=\"0.8\"/> <rect width=\"12\" height=\"280\" fill=\"#000000\" fill-opacity=\"0.25\"/> </symbol><linearGradient id=\"cv-shade\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0.55\" stop-color=\"#000\" stop-opacity=\"0\"/><stop offset=\"1\" stop-color=\"#000\" stop-opacity=\"0.55\"/></linearGradient>" + MORE_ART + NEW_ART;

// Grouped into collections for the picker.
export const COVER_GROUPS = [['classic', 'Classic'], ['lined', 'Lined & paper'], ['nature', 'Nature'], ['calm', 'Calm'], ['asia', 'Singapore & Asia'], ['pattern', 'Patterns'], ['bold', 'Bold'], ['fun', 'Fun'], ['future', 'Futuristic'], ['ai', 'AI & data'], ['night', 'Night']];

export const COVERS = [
  { id: 'kraft', name: 'Kraft', group: 'classic', t: { x: 102, y: 100, font: 'hand', size: 25, fill: '#1B2A38', anchor: 'middle', max: 114, g: 'mid', b: [70, 138] } },
  { id: 'cloth', name: 'Cloth', group: 'classic', t: { x: 108, y: 147, font: 'serif', size: 20, fill: '#D9B36C', anchor: 'middle', max: 140, g: 'mid', b: [124, 158] } },
  { id: 'composition', name: 'Composition', group: 'classic', t: { x: 120, y: 96, font: 'hand', size: 24, fill: '#1B2A38', anchor: 'middle', max: 112, g: 'mid', b: [61, 127] } },
  { id: 'leather', name: 'Leather', group: 'classic', t: { x: 101, y: 134, font: 'serif', size: 20, fill: '#E2C27A', anchor: 'middle', max: 122, g: 'mid', b: [111, 145] } },
  { id: 'tide', name: 'Tide', group: 'nature', t: { x: 28, y: 268, font: 'serif', italic: true, size: 26, fill: '#FFFFFF', max: 165, g: 'up' } },
  { id: 'botanical', name: 'Botanical', group: 'nature', t: { x: 28, y: 64, font: 'serif', italic: true, size: 25, fill: '#E8EFE6', max: 160, g: 'down' } },
  { id: 'peaks', name: 'Peaks at dawn', group: 'nature', t: { x: 26, y: 266, font: 'serif', italic: true, size: 25, fill: '#F6EEE6', max: 165, g: 'up' } },
  { id: 'pines', name: 'Pine forest', group: 'nature', t: { x: 26, y: 54, font: 'serif', italic: true, size: 25, fill: '#2F4B40', max: 168, g: 'down' } },
  { id: 'wildflowers', name: 'Wildflowers', group: 'nature', t: { x: 111, y: 72, font: 'serif', italic: true, size: 24, fill: '#3B3A36', anchor: 'middle', max: 160, g: 'up', b: [14, 84] } },
  { id: 'monstera', name: 'Monstera', group: 'nature', t: { x: 26, y: 50, font: 'serif', italic: true, size: 25, fill: '#244A38', max: 168, g: 'down' } },
  { id: 'pera', name: 'Peranakan tile', group: 'asia', t: { x: 111, y: 230, font: 'serif', size: 21, fill: '#1B2A38', anchor: 'middle', max: 128, g: 'mid', b: [204, 242] } },
  { id: 'shophouse', name: 'Shophouses', group: 'asia', t: { x: 111, y: 167, font: 'serif', size: 17, fill: '#E8C46A', anchor: 'middle', max: 152, g: 'mid', b: [146, 176] } },
  { id: 'estate', name: 'HDB estate', group: 'asia', t: { x: 24, y: 40, font: 'serif', size: 22, fill: '#1B2A38', max: 170, g: 'mid', b: [6, 60] } },
  { id: 'lanterns', name: 'Lanterns', group: 'asia', t: { x: 111, y: 260, font: 'serif', size: 24, fill: '#F2C76A', anchor: 'middle', max: 160, g: 'mid', b: [236, 276] } },
  { id: 'waves', name: 'Waves', group: 'asia', t: { x: 111, y: 252, font: 'serif', size: 24, fill: '#F3EBDD', anchor: 'middle', max: 160, g: 'mid', b: [214, 276] } },
  { id: 'koi', name: 'Koi pond', group: 'asia', t: { x: 26, y: 262, font: 'serif', italic: true, size: 26, fill: '#F4EFE6', max: 165, g: 'up' } },
  { id: 'shibori', name: 'Shibori', group: 'asia', t: { x: 111, y: 238, font: 'serif', size: 17, fill: '#1E2F63', anchor: 'middle', max: 122, g: 'mid', b: [218, 246] } },
  { id: 'marbled', name: 'Marbled', group: 'pattern', t: { x: 111, y: 143, font: 'serif', size: 20, fill: '#1B2A38', anchor: 'middle', max: 112, g: 'mid', b: [110, 164] } },
  { id: 'terrazzo', name: 'Terrazzo', group: 'pattern', t: { x: 110, y: 236, font: 'sans', weight: 600, size: 17, fill: '#FFFFFF', anchor: 'middle', max: 118, g: 'mid', b: [212, 248] } },
  { id: 'gingham', name: 'Gingham', group: 'pattern', t: { x: 111, y: 142, font: 'serif', size: 20, fill: '#2F4B3C', anchor: 'middle', max: 120, g: 'mid', b: [106, 164] } },
  { id: 'tweed', name: 'Tweed', group: 'pattern', t: { x: 111, y: 222, font: 'serif', size: 15, fill: '#F2E3CB', anchor: 'middle', max: 100, g: 'mid', b: [202, 232] } },
  { id: 'polka', name: 'Polka dots', group: 'pattern', t: { x: 111, y: 243, font: 'serif', size: 22, fill: '#9E2430', anchor: 'middle', max: 170, g: 'mid', b: [220, 253] } },
  { id: 'stripes', name: 'Stripes', group: 'pattern', t: { x: 111, y: 147, font: 'sans', weight: 700, size: 20, fill: '#FFFFFF', anchor: 'middle', max: 172, g: 'mid', b: [121, 159] } },
  { id: 'tartan', name: 'Tartan', group: 'pattern', t: { x: 111, y: 73, font: 'serif', size: 18, fill: '#1F3B5C', anchor: 'middle', max: 118, g: 'mid', b: [46, 88] } },
  { id: 'bauhaus', name: 'Bauhaus', group: 'bold', t: { x: 26, y: 138, font: 'sans', weight: 700, size: 34, fill: '#1B2A38', max: 170, g: 'up', b: [8, 149] } },
  { id: 'blueprint', name: 'Blueprint', group: 'bold', t: { x: 151, y: 234, font: 'sans', weight: 600, size: 12, fill: '#FFFFFF', anchor: 'middle', max: 84, g: 'mid', b: [219, 239] } },
  { id: 'riso', name: 'Risograph', group: 'bold', t: { x: 24, y: 264, font: 'sans', weight: 700, size: 26, fill: '#1B2A38', max: 172, g: 'up' } },
  { id: 'memphis', name: 'Memphis', group: 'bold', t: { x: 26, y: 160, font: 'sans', weight: 700, size: 30, fill: '#1B1B1B', max: 172, g: 'up' } },
  { id: 'aura', name: 'Aura', group: 'bold', t: { x: 111, y: 150, font: 'serif', italic: true, size: 28, fill: '#2C2440', anchor: 'middle', max: 160, g: 'mid', b: [60, 240] } },
  { id: 'retro', name: 'Seventies', group: 'bold', t: { x: 198, y: 50, font: 'sans', weight: 700, size: 22, fill: '#5A2E1E', anchor: 'end', max: 150, g: 'down' } },
  { id: 'planes', name: 'Paper planes', group: 'bold', t: { x: 26, y: 264, font: 'sans', weight: 700, size: 22, fill: '#21436E', max: 170, g: 'up' } },
  { id: 'citrus', name: 'Citrus', group: 'bold', t: { x: 111, y: 236, font: 'sans', weight: 700, size: 18, fill: '#D2691E', anchor: 'middle', max: 128, g: 'mid', b: [213, 247] } },
  { id: 'contour', name: 'Contour', group: 'night', t: { x: 28, y: 70, font: 'serif', italic: true, size: 26, fill: '#F1F4F2', max: 160, g: 'down' } },
  { id: 'night', name: 'Night chart', group: 'night', t: { x: 28, y: 262, font: 'serif', size: 26, fill: '#E4ECE9', max: 118, g: 'up' } },
  { id: 'aurora', name: 'Aurora', group: 'night', t: { x: 26, y: 262, font: 'serif', size: 25, fill: '#E8F2EE', max: 165, g: 'up' } },
  { id: 'orbit', name: 'Orbit', group: 'night', t: { x: 26, y: 50, font: 'sans', weight: 700, size: 22, fill: '#F2F0E8', max: 165, g: 'down' } },
  { id: 'city', name: 'City at dusk', group: 'night', t: { x: 26, y: 54, font: 'serif', italic: true, size: 26, fill: '#F6EAF0', max: 165, g: 'down' } },
  { id: 'deco', name: 'Art deco', group: 'night', t: { x: 111, y: 88, font: 'sans', weight: 600, size: 15, fill: '#E2C27A', anchor: 'middle', max: 124, g: 'mid', b: [68, 96] } },
  // The second set (tools/covergen2.py).
  ...NEW_COVERS,
];
export const PLAIN_COLORS = [['Chart blue', '#2B5684'], ['Forest', '#1F6F50'], ['Oxblood', '#8A3537'], ['Ochre', '#C0802F'], ['Charcoal', '#2B2F33'], ['Plum', '#5B3E99'], ['Sea', '#2A8C9C'], ['Rose', '#B8578E']];
const PLAIN_T = { x: 28, y: 70, font: 'serif', size: 26, fill: '#FFFFFF', max: 160, g: 'down' };

const FAMILY = { serif: "Spectral, Georgia, serif", sans: "Overpass, system-ui, sans-serif", hand: "Caveat, cursive" };

// Put the shared artwork in the page once.
export function ensureCoverSprite() {
  if (document.getElementById('cover-sprite')) return;
  const holder = document.createElement('div');
  holder.innerHTML = `<svg id="cover-sprite" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden"><defs>${SPRITE}</defs></svg>`;
  document.body.appendChild(holder.firstChild);
}

// Fitting a title on a cover. A name that fits stays on one line (shrinking
// a little if needed). A longer one breaks into two lines at a word (three if
// two would be tiny), which grow upwards, downwards or from the middle of a
// label (the cover's `g`), staying inside the space the cover leaves for it
// (`b`, top and bottom). Only a name too long even for that ends in "…".
const LINE = 1.12; // gap between lines' baselines, as a share of the size
const ASC = 0.8; // how far letters reach above the baseline
const DESC = 0.3; // and below it (g, j, y)
const ONE_LINE_MIN = 0.8; // below this share of the size, two lines read better
const TWO_LINE_MIN = 0.55; // below this, try three lines
let mctx;
function fit(text, t, family) {
  if (!mctx) mctx = document.createElement('canvas').getContext('2d');
  const font = (sz) => `${t.italic ? 'italic ' : ''}${t.weight || 400} ${sz}px ${family}`;
  const width = (s, sz) => { mctx.font = font(sz); return mctx.measureText(s).width; };
  const S = t.size;
  const w1 = width(text, S);
  if (w1 <= t.max) return { lines: [text], size: S };
  const s1 = (S * t.max) / w1;
  const words = text.split(/\s+/).filter(Boolean);
  const single = () => settled([text], t, Math.max(S * 0.62, s1), width);
  if (s1 >= S * ONE_LINE_MIN || words.length < 2) return single();
  let pick = lines(words, 2, t, S, width);
  if ((pick.cut || pick.size < S * TWO_LINE_MIN) && words.length > 2) {
    const three = lines(words, 3, t, S, width);
    if ((pick.cut && !three.cut) || (three.cut === pick.cut && three.size > pick.size * 1.1)) pick = three;
  }
  if (pick.size <= s1) return single();
  return settled(pick.lines, t, pick.size, width);
}
// The most even split of the words into n lines (the longest line sets the
// size), and the size that fits both across and in the space above/below.
function lines(words, n, t, S, width) {
  let best = null;
  const splits = n === 2 ? words.slice(1).map((_, i) => [i + 1]) : words.slice(1).flatMap((_, i) => words.slice(i + 2).map((__, j) => [i + 1, i + 2 + j]));
  for (const cuts of splits) {
    const ls = [0, ...cuts].map((c, k) => words.slice(c, k < cuts.length ? cuts[k] : undefined).join(' '));
    const wide = Math.max(...ls.map((l) => width(l, S)));
    if (!best || wide < best.wide) best = { ls, wide };
  }
  const [top, bottom] = t.b || [6, 274];
  const gaps = (n - 1) * LINE;
  const room = t.g === 'up' ? (t.y - top) / (gaps + ASC) : t.g === 'down' ? (bottom - t.y) / (gaps + DESC) : (bottom - top) / (gaps + ASC + DESC);
  let size = Math.min(S, room, Math.max(S * 0.45, (S * t.max) / best.wide));
  // A word too long for any line gets cut anyway, so don't make it tiny too.
  const cut = (best.wide * size) / S > t.max;
  if (cut) size = Math.min(S, room, Math.max(S * 0.62, size));
  return { lines: best.ls, size, cut };
}
// Text doesn't scale exactly with size, so a line worked out to just fit can
// be a hair too wide: step down a little rather than cut it. Then shorten any
// line that still doesn't fit with "…".
function settled(ls, t, size, width) {
  size = Math.floor(size * 10) / 10;
  for (let i = 0; i < 5 && ls.some((l) => width(l, size) > t.max); i++) size = Math.round((size - 0.1) * 10) / 10;
  return { lines: ls.map((l) => cut(l, t.max, size, width)), size };
}
function cut(line, max, size, width) {
  if (width(line, size) <= max) return line;
  let out = line;
  while (out.length > 1) { out = out.slice(0, -1).trimEnd(); if (width(`${out}…`, size) <= max) break; }
  return `${out}…`;
}
// Baselines for the lines: extra lines grow up, down or from the middle.
function baselines(t, n, size) {
  const gap = size * LINE;
  if (n === 1) return [t.y];
  if (t.g === 'up') return [...Array(n)].map((_, i) => t.y - (n - 1 - i) * gap);
  if (t.g === 'down') return [...Array(n)].map((_, i) => t.y + i * gap);
  // Centred in the label, or where the one-line title's letters were centred.
  const mid = (t.b ? (t.b[0] + t.b[1]) / 2 : t.y - (ASC - DESC) * t.size / 2) + (ASC - DESC) * size / 2;
  return [...Array(n)].map((_, i) => mid + (i - (n - 1) / 2) * gap);
}

// The cover as an SVG string. `photoUrl` is the decrypted cover photo, if any.
export function coverSVG(nb, { width = 140, photoUrl = null, label = true } = {}) {
  ensureCoverSprite();
  const cv = nb.cover || {};
  const style = cv.style || 'contour';
  const preset = COVERS.find((c) => c.id === style);
  let art;
  let t;
  if (style === 'photo') {
    art = `<rect width="210" height="280" fill="#DCE3E1"/>${photoUrl ? `<image href="${esc(photoUrl)}" width="210" height="280" preserveAspectRatio="xMidYMid slice"/>` : ''}<rect width="210" height="280" fill="url(#cv-shade)"/><rect width="12" height="280" fill="#000" fill-opacity="0.22"/>`;
    t = { ...PLAIN_T, y: 252, g: 'up' };
  } else if (style === 'plain' || !preset) {
    art = `<rect width="210" height="280" fill="${esc(cv.color || '#2B5684')}"/><rect width="12" height="280" fill="#000" fill-opacity="0.2"/>`;
    t = PLAIN_T;
  } else {
    art = `<use href="#cv-${style}"/>`;
    t = preset.t;
  }
  let title = '';
  const ts = cv.titleStyle || 'printed';
  if (ts !== 'hidden' && nb.title) {
    const hand = ts === 'hand';
    const fam = hand ? FAMILY.hand : FAMILY[t.font];
    const base = hand ? { ...t, size: t.size * 1.18, italic: false, weight: 400 } : t;
    const f = fit(nb.title, base, fam);
    const ys = baselines(base, f.lines.length, f.size);
    const body = f.lines.length === 1 ? esc(f.lines[0]) : f.lines.map((l, i) => `<tspan x="${t.x}" y="${Math.round(ys[i] * 10) / 10}">${esc(l)}</tspan>`).join('');
    title = `<text class="cover-title" x="${t.x}" y="${Math.round(ys[0] * 10) / 10}" font-family="${fam}" font-size="${f.size}" ${base.italic ? 'font-style="italic"' : ''} font-weight="${base.weight || 400}" fill="${t.fill}" ${t.anchor ? `text-anchor="${t.anchor}"` : ''}>${body}</text>`;
  }
  const h = Math.round(width * 4 / 3);
  return `<svg class="cover-svg" width="${width}" height="${h}" viewBox="0 0 210 280" ${label ? `role="img" aria-label="${esc(nb.title || 'Notebook')} cover"` : 'aria-hidden="true"'}>${art}${title}</svg>`;
}

// A self-contained SVG (art included) for turning a cover into an image.
export function coverStandaloneSVG(nb, { width = 1050, photoUrl = null } = {}) {
  const inner = coverSVG(nb, { width, photoUrl, label: false }).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${Math.round(width * 4 / 3)}" viewBox="0 0 210 280"><defs>${SPRITE}</defs>${inner}</svg>`;
}

export const coverName = (style) => COVERS.find((c) => c.id === style)?.name || (style === 'photo' ? 'Your photo' : 'Plain colour');
