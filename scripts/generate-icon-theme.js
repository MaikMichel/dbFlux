// Generates the dbFlux file icon theme (SVGs + theme JSON).
// usage: node scripts/generate-icon-theme.js icons
// Edit the folders/files tables below, then re-run to regenerate icons/.
const fs = require('fs');
const path = require('path');

const out = path.resolve(process.argv[2]);
fs.mkdirSync(path.join(out, 'folders'), { recursive: true });
fs.mkdirSync(path.join(out, 'files'), { recursive: true });

// ---------- glyphs, drawn in a 6x6 local box, white ----------
const st = (w = 1.1) => `fill="none" stroke="#fff" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
const S = st();
const F = 'fill="#fff"';
const glyphs = {
  database: `<ellipse cx="3" cy="1" rx="2.5" ry="0.9" ${S}/><path d="M0.5 1V5A2.5 0.9 0 0 0 5.5 5V1M0.5 3A2.5 0.9 0 0 0 5.5 3" ${S}/>`,
  apex: `<path d="M0.4 6L3 0L5.6 6M1.4 3.9H4.6" ${S}/>`,
  image: `<rect x="0.3" y="0.6" width="5.4" height="4.8" rx="0.6" ${S}/><path d="M0.6 5L2.4 3L3.7 4.2L4.5 3.5L5.4 4.4" ${S}/><circle cx="4.2" cy="2" r="0.6" ${F}/>`,
  globe: `<circle cx="3" cy="3" r="2.7" ${S}/><ellipse cx="3" cy="3" rx="1.1" ry="2.7" ${S}/><path d="M0.3 3H5.7" ${S}/>`,
  bars: `<path d="M1 5.8V3.4M3 5.8V0.4M5 5.8V2" ${st(1.4)}/>`,
  plug: `<path d="M2 0.2V2M4 0.2V2M0.9 2H5.1V3.3A2.1 2.1 0 0 1 0.9 3.3ZM3 5.4V6" ${S}/>`,
  hook: `<path d="M4 0.3V3.9A1.8 1.8 0 0 1 0.4 3.9L1.4 2.9" ${S}/><circle cx="4" cy="0.6" r="0.6" ${F}/>`,
  gear: `<circle cx="3" cy="3" r="1.6" ${S}/><path d="M3 0V0.9M3 5.1V6M0 3H0.9M5.1 3H6M0.9 0.9L1.5 1.5M4.5 4.5L5.1 5.1M5.1 0.9L4.5 1.5M1.5 4.5L0.9 5.1" ${S}/>`,
  lock: `<rect x="0.7" y="2.6" width="4.6" height="3.3" rx="0.5" ${F}/><path d="M1.8 2.6V1.6A1.2 1.2 0 0 1 4.2 1.6V2.6" ${S}/>`,
  braces: `<path d="M2 0.3C1 0.3 1.3 1 1.2 2C1.1 2.8 0.8 3 0.3 3C0.8 3 1.1 3.2 1.2 4C1.3 5 1 5.7 2 5.7M4 0.3C5 0.3 4.7 1 4.8 2C4.9 2.8 5.2 3 5.7 3C5.2 3 4.9 3.2 4.8 4C4.7 5 5 5.7 4 5.7" ${S}/>`,
  plusbox: `<rect x="0.5" y="0.5" width="5" height="5" rx="0.8" ${S}/><path d="M3 1.8V4.2M1.8 3H4.2" ${S}/>`,
  rows: `<path d="M0.5 1H5.5M0.5 3H5.5M0.5 5H3.5" ${S}/><path d="M4.4 4.2L5.6 5L4.4 5.8" ${S}/>`,
  sort: `<path d="M1.5 0.5V5.5M0.3 4.3L1.5 5.5L2.7 4.3M3.6 1H5.7M3.6 3H5.1M3.6 5H4.4" ${S}/>`,
  clock: `<circle cx="3" cy="3" r="2.7" ${S}/><path d="M3 1.4V3L4.2 3.9" ${S}/>`,
  shield: `<path d="M3 0.2L5.5 1.1V2.9C5.5 4.5 4.3 5.4 3 5.9C1.7 5.4 0.5 4.5 0.5 2.9V1.1Z" ${S}/><path d="M1.9 3L2.8 3.9L4.2 2.2" ${S}/>`,
  sequence: `<circle cx="1" cy="5" r="0.85" ${F}/><circle cx="3" cy="3" r="0.85" ${F}/><circle cx="5" cy="1" r="0.85" ${F}/>`,
  code: `<path d="M1.8 1.2L0.2 3L1.8 4.8M4.2 1.2L5.8 3L4.2 4.8M3.6 0.6L2.4 5.4" ${S}/>`,
  eye: `<path d="M0.2 3Q3 -0.4 5.8 3Q3 6.4 0.2 3Z" ${S}/><circle cx="3" cy="3" r="1" ${F}/>`,
  eyestack: `<path d="M0.2 2.2Q3 -0.9 5.8 2.2Q3 5.3 0.2 2.2Z" ${S}/><circle cx="3" cy="2.2" r="0.9" ${F}/><path d="M0.6 5.6H5.4" ${S}/>`,
  table: `<rect x="0.3" y="0.6" width="5.4" height="4.8" rx="0.5" ${S}/><path d="M0.3 2.2H5.7M0.3 3.8H5.7M2.6 2.2V5.4" ${S}/>`,
  tableplus: `<rect x="0.3" y="0.6" width="4" height="3.8" rx="0.5" ${S}/><path d="M0.3 2H4.3M2 2V4.4" ${S}/><path d="M4.8 3.6V6M3.6 4.8H6" ${S}/>`,
  check: `<path d="M0.6 3.2L2.3 4.9L5.5 1.1" ${st(1.4)}/>`,
  swap: `<path d="M0.5 1.6H5.2M4 0.4L5.2 1.6L4 2.8M5.5 4.4H0.8M2 3.2L0.8 4.4L2 5.6" ${S}/>`,
  func: `<path d="M4.8 0.6C3.6 0.2 3 0.8 2.8 2L2.2 5.2C2 6 1.3 6 0.8 5.8M1.4 2.6H4.4" ${S}/>`,
  cube: `<path d="M3 0.3L5.6 1.6V4.4L3 5.7L0.4 4.4V1.6ZM0.4 1.6L3 2.9L5.6 1.6M3 2.9V5.7" ${S}/>`,
  play: `<path d="M1.2 0.5L5.5 3L1.2 5.5Z" ${F}/>`,
  bolt: `<path d="M3.6 0L0.8 3.4H2.8L2.4 6L5.2 2.6H3.2Z" ${F}/>`,
  diamond: `<path d="M3 0.3L5.7 3L3 5.7L0.3 3Z" ${S}/><circle cx="3" cy="3" r="0.8" ${F}/>`,
  blocks: `<rect x="0.3" y="0.3" width="2.3" height="2.3" rx="0.4" ${F}/><rect x="3.4" y="0.3" width="2.3" height="2.3" rx="0.4" ${F}/><rect x="0.3" y="3.4" width="2.3" height="2.3" rx="0.4" ${F}/><rect x="3.4" y="3.4" width="2.3" height="2.3" rx="0.4" ${S}/>`,
  key: `<circle cx="1.7" cy="4.3" r="1.3" ${S}/><path d="M2.6 3.4L5.6 0.4M4.4 1.6L5.4 2.6M3.6 2.4L4.3 3.1" ${S}/>`,
  person: `<circle cx="3" cy="1.6" r="1.3" ${S}/><path d="M0.6 5.8C0.8 3.4 5.2 3.4 5.4 5.8" ${S}/>`,
  star: `<path d="M3 0.2L3.8 2.1L5.8 2.2L4.2 3.5L4.8 5.6L3 4.4L1.2 5.6L1.8 3.5L0.2 2.2L2.2 2.1Z" ${F}/>`,
  js: `<text x="3" y="5.2" text-anchor="middle" font-family="Segoe UI,Helvetica,Arial,sans-serif" font-weight="700" font-size="4.6" fill="#fff">JS</text>`,
  hash: `<path d="M2 0.4L1.4 5.6M4.6 0.4L4 5.6M0.5 2H5.6M0.4 4H5.5" ${S}/>`,
  window: `<rect x="0.3" y="0.6" width="5.4" height="4.8" rx="0.6" ${S}/><path d="M0.3 2H5.7" ${S}/>`,
  pin: `<path d="M3 5.8C3 5.8 0.9 3.6 0.9 2.2A2.1 2.1 0 0 1 5.1 2.2C5.1 3.6 3 5.8 3 5.8Z" ${S}/><circle cx="3" cy="2.2" r="0.7" ${F}/>`,
};

// ---------- folder definitions: id -> [color, glyph, folderNames] ----------
const folders = {
  db:          ['#1E88E5', 'database', ['db']],
  apex:        ['#E8590C', 'apex', ['apex']],
  static:      ['#8E44AD', 'image', ['static']],
  rest:        ['#00897B', 'globe', ['rest']],
  reports:     ['#F9A825', 'bars', ['reports']],
  plugin:      ['#D81B60', 'plug', ['plugin', 'plugins']],
  hooks:       ['#607D8B', 'hook', ['.hooks']],
  setup:       ['#546E7A', 'gear', ['_setup']],
  workspaces:  ['#5C6BC0', 'window', ['workspaces']],
  constraints: ['#C62828', 'lock', ['constraints', 'checks', 'foreigns', 'primaries', 'uniques']],
  contexts:    ['#6D4C41', 'braces', ['contexts']],
  ddl:         ['#3949AB', 'plusbox', ['ddl']],
  dml:         ['#00838F', 'rows', ['dml']],
  indexes:     ['#7CB342', 'sort', ['indexes', 'defaults']],
  jobs:        ['#F57C00', 'clock', ['jobs']],
  policies:    ['#455A64', 'shield', ['policies']],
  sequences:   ['#00ACC1', 'sequence', ['sequences']],
  sources:     ['#5E35B1', 'code', ['sources']],
  views:       ['#039BE5', 'eye', ['views']],
  mviews:      ['#0277BD', 'eyestack', ['mviews']],
  tables:      ['#2E7D32', 'table', ['tables']],
  tables_ddl:  ['#558B2F', 'tableplus', ['tables_ddl']],
  tests:       ['#43A047', 'check', ['tests', 'test']],
  synonyms:    ['#8D6E63', 'swap', ['synonyms', 'private', 'public']],
  functions:   ['#00897B', 'func', ['functions']],
  packages:    ['#EF6C00', 'cube', ['packages']],
  procedures:  ['#6A1B9A', 'play', ['procedures']],
  triggers:    ['#E53935', 'bolt', ['triggers']],
  types:       ['#AD1457', 'diamond', ['types']],
  modules:     ['#00796B', 'blocks', ['modules']],
  access:      ['#BF360C', 'key', ['access']],
  roles:       ['#3F51B5', 'person', ['roles']],
  privileges:  ['#F9A825', 'star', ['privileges']],
  mapping:     ['#26A69A', 'swap', ['mapping']],
  src:         ['#5E35B1', 'code', ['src']],
  js:          ['#C9A100', 'js', ['js']],
  css:         ['#1565C0', 'hash', ['css']],
  img:         ['#8E44AD', 'image', ['img', 'images']],
};

const shade = (hex, f) => '#' + [1, 3, 5].map(i => {
  const v = Math.round(parseInt(hex.substr(i, 2), 16) * f);
  return Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
}).join('');

const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">${body}</svg>\n`;

const closedFolder = (color, glyph) => svg(
  `<path d="M1.5 2.5H6L7.5 4H14.5A1 1 0 0 1 15.5 5V13A1 1 0 0 1 14.5 14H1.5A1 1 0 0 1 0.5 13V3.5A1 1 0 0 1 1.5 2.5Z" fill="${color}"/>` +
  (glyph ? `<g transform="translate(5 6.6)">${glyphs[glyph]}</g>` : ''));

const openFolder = (color, glyph) => svg(
  `<path d="M1.5 2.5H6L7.5 4H13.5A1 1 0 0 1 14.5 5V6.5H3.4L0.5 13V3.5A1 1 0 0 1 1.5 2.5Z" fill="${shade(color, 0.7)}"/>` +
  `<path d="M3.4 6.5H15.2A0.6 0.6 0 0 1 15.75 7.3L13.1 13.5A1 1 0 0 1 12.2 14H0.9A0.5 0.5 0 0 1 0.5 13.3Z" fill="${color}"/>` +
  (glyph ? `<g transform="translate(5.6 7.4) scale(0.95)">${glyphs[glyph]}</g>` : ''));

// ---------- file definitions: id -> [color, label|glyph, extensions, fileNames, textColor] ----------
const files = {
  sql:  ['#1E88E5', 'SQL', ['sql']],
  pks:  ['#EF6C00', 'PKS', ['pks']],
  pkb:  ['#BF360C', 'PKB', ['pkb']],
  tps:  ['#AD1457', 'TPS', ['tps']],
  tpb:  ['#880E4F', 'TPB', ['tpb']],
  prc:  ['#6A1B9A', 'PRC', ['prc']],
  fnc:  ['#00897B', 'FNC', ['fnc']],
  trg:  ['#E53935', 'TRG', ['trg']],
  vw:   ['#039BE5', 'VW', ['vw']],
  js:   ['#F0DB4F', 'JS', ['js', 'mjs', 'cjs'], [], '#323330'],
  ts:   ['#3178C6', 'TS', ['ts']],
  css:  ['#1565C0', 'CSS', ['css', 'scss', 'less']],
  html: ['#E44D26', '</>', ['html', 'htm']],
  json: ['#F9A825', '{}', ['json', 'jsonc'], [], '#3E2723'],
  md:   ['#546E7A', 'MD', ['md', 'markdown']],
  sh:   ['#388E3C', 'SH', ['sh', 'bash', 'zsh']],
  bat:  ['#455A64', 'BAT', ['bat', 'cmd', 'ps1']],
  env:  ['#7CB342', 'ENV', ['env'], ['build.env', 'apply.env', '.env']],
  yml:  ['#C62828', 'YML', ['yml', 'yaml']],
  xml:  ['#FF7043', 'XML', ['xml']],
  txt:  ['#78909C', 'TXT', ['txt']],
  log:  ['#607D8B', 'LOG', ['log']],
  csv:  ['#2E7D32', 'CSV', ['csv']],
  pdf:  ['#D32F2F', 'PDF', ['pdf']],
  zip:  ['#8D6E63', 'ZIP', ['zip', 'gz', 'tar', 'tgz']],
  git:  ['#F4511E', 'GIT', [], ['.gitignore', '.gitattributes', '.gitkeep']],
  image:['#26A69A', '@image', ['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp', 'bmp']],
  font: ['#5C6BC0', 'Aa', ['woff', 'woff2', 'ttf', 'otf', 'eot']],
};

const page = color =>
  `<path d="M3.5 1H10L13.5 4.5V14A1 1 0 0 1 12.5 15H3.5A1 1 0 0 1 2.5 14V2A1 1 0 0 1 3.5 1Z" fill="${color}"/>` +
  `<path d="M10 1V3.5A1 1 0 0 0 11 4.5H13.5Z" fill="#fff" fill-opacity="0.45"/>`;

const fileIcon = (color, label, textColor = '#fff') => {
  if (label.startsWith('@')) {
    return svg(page(color) + `<g transform="translate(5 7)">${glyphs[label.slice(1)]}</g>`);
  }
  const size = label.length >= 3 ? 4.4 : 5.4;
  return svg(page(color) +
    `<text x="8" y="12.6" text-anchor="middle" font-family="Segoe UI,Helvetica,Arial,sans-serif" font-weight="700" font-size="${size}" fill="${textColor}">${label.replace('<', '&lt;').replace('>', '&gt;')}</text>`);
};

const defaultFile = svg(
  `<path d="M3.5 1H10L13.5 4.5V14A1 1 0 0 1 12.5 15H3.5A1 1 0 0 1 2.5 14V2A1 1 0 0 1 3.5 1Z" fill="#90A4AE"/>` +
  `<path d="M10 1V3.5A1 1 0 0 0 11 4.5H13.5Z" fill="#fff" fill-opacity="0.45"/>` +
  `<path d="M5 7.5H11M5 9.5H11M5 11.5H9" stroke="#fff" stroke-width="1" stroke-linecap="round"/>`);

// ---------- write ----------
const theme = {
  iconDefinitions: {},
  file: '_file',
  folder: '_folder',
  folderExpanded: '_folder_open',
  rootFolder: '_folder',
  rootFolderExpanded: '_folder_open',
  folderNames: {},
  folderNamesExpanded: {},
  fileExtensions: {},
  fileNames: {},
  hidesExplorerArrows: false,
  showLanguageModuleIcons: true,
};

const def = (id, rel) => { theme.iconDefinitions[id] = { iconPath: './' + rel }; };

fs.writeFileSync(path.join(out, 'folders', 'folder.svg'), closedFolder('#90A4AE'));
fs.writeFileSync(path.join(out, 'folders', 'folder-open.svg'), openFolder('#90A4AE'));
def('_folder', 'folders/folder.svg');
def('_folder_open', 'folders/folder-open.svg');
fs.writeFileSync(path.join(out, 'files', 'file.svg'), defaultFile);
def('_file', 'files/file.svg');

for (const [id, [color, glyph, names]] of Object.entries(folders)) {
  fs.writeFileSync(path.join(out, 'folders', `${id}.svg`), closedFolder(color, glyph));
  fs.writeFileSync(path.join(out, 'folders', `${id}-open.svg`), openFolder(color, glyph));
  def(`_folder_${id}`, `folders/${id}.svg`);
  def(`_folder_${id}_open`, `folders/${id}-open.svg`);
  for (const n of names) {
    theme.folderNames[n] = `_folder_${id}`;
    theme.folderNamesExpanded[n] = `_folder_${id}_open`;
  }
}

for (const [id, [color, label, exts, names = [], textColor]] of Object.entries(files)) {
  fs.writeFileSync(path.join(out, 'files', `${id}.svg`), fileIcon(color, label, textColor));
  def(`_file_${id}`, `files/${id}.svg`);
  for (const e of exts) { theme.fileExtensions[e] = `_file_${id}`; }
  for (const n of names) { theme.fileNames[n] = `_file_${id}`; }
}

fs.writeFileSync(path.join(out, 'dbflux-icon-theme.json'), JSON.stringify(theme, null, 2) + '\n');
console.log(`folders: ${Object.keys(folders).length}, files: ${Object.keys(files).length}, definitions: ${Object.keys(theme.iconDefinitions).length}`);
