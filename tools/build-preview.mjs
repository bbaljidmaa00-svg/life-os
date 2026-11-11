/**
 * Урьдчилан харах хувилбар бүтээгч — npm, интернэт шаардлагагүй.
 *
 *   node tools/build-preview.mjs
 *
 * js/ доторх ES модулиудыг нэг энгийн <script> болгон нэгтгэж, CSS-ийг
 * дотор нь суулгаад preview.html үүсгэнэ. preview.html-г давхар дарж
 * (file://) нээж болох бөгөөд жишээ өгөгдөлтэй session горимд ажиллана.
 *
 * Supabase-тэй ажиллуулах бол preview.html биш, index.html-г локал
 * сервероор нээнэ (README-г үзнэ үү).
 *
 * Энэ нь зөвхөн энэ төслийн импорт/экспортын хэлбэрийг дэмждэг энгийн нэгтгэгч:
 *   import { a, b as c } from './x.js'    import X from './x.js'
 *   export function / export async function / export const / export default {
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const FRAGMENT = args.has('--fragment'); // <html>/<head>/<body>-гүй хэсэг (embed хийхэд)
const SANDBOX = args.has('--sandbox'); // хэвлэх / файл татах товчгүй
// --prod: жинхэнэ хувилбар — js/config.js-ийн Supabase тохиргоог хадгалж, жишээ өгөгдөл ачаалахгүй.
//         Үр дүн: dist/index.html — GitHub Pages-д ганц файл байдлаар байршуулна.
const PROD = args.has('--prod');
const outArg = process.argv.slice(2).find((a) => a.startsWith('--out='));
const OUT = outArg ? resolve(outArg.slice(6)) : join(ROOT, PROD ? 'dist/index.html' : 'preview.html');

const modules = new Map(); // id -> transformed source
const order = [];

function idOf(abs) { return relative(ROOT, abs).split('\\').join('/'); }

function transform(abs) {
  const id = idOf(abs);
  if (modules.has(id)) return id;
  modules.set(id, null); // placeholder (cycle guard)
  let src = readFileSync(abs, 'utf8');
  // Урьдчилан харах хувилбар үргэлж session горимд (жишээ өгөгдөлтэй) ажиллана —
  // жинхэнэ өгөгдлийн сан руу хэзээ ч холбогдохгүй.
  if (id === 'js/config.js' && !PROD) {
    src = src.replace(/^export const SUPABASE_URL = .*$/m, "export const SUPABASE_URL = '';")
      .replace(/^export const SUPABASE_ANON_KEY = .*$/m, "export const SUPABASE_ANON_KEY = '';");
  }
  const exportsList = [];
  const dir = dirname(abs);
  const req = (spec) => {
    if (!spec.startsWith('.')) throw new Error(`${id}: зөвхөн харьцангуй импорт дэмжинэ (${spec})`);
    return transform(resolve(dir, spec));
  };

  // import { a, b as c } from './x.js';   (олон мөртэй ч болно)
  src = src.replace(/^import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?/gm, (_, names, spec) => {
    const dep = req(spec);
    const binds = names.split(',').map((s) => s.trim()).filter(Boolean)
      .map((s) => s.replace(/^([\w$]+)\s+as\s+([\w$]+)$/, '$1: $2'));
    return `const { ${binds.join(', ')} } = __req(${JSON.stringify(dep)});`;
  });
  // import X from './x.js';
  src = src.replace(/^import\s+([\w$]+)\s+from\s*['"]([^'"]+)['"];?/gm, (_, name, spec) => `const ${name} = __req(${JSON.stringify(req(spec))}).default;`);
  if (/^import\s/m.test(src)) throw new Error(`${id}: танигдаагүй import хэлбэр`);

  src = src.replace(/^export\s+(async\s+function\*?|function\*?)\s+([\w$]+)/gm, (_, kw, name) => { exportsList.push([name, name]); return `${kw} ${name}`; });
  src = src.replace(/^export\s+const\s+([\w$]+)/gm, (_, name) => { exportsList.push([name, name]); return `const ${name}`; });
  src = src.replace(/^export\s+default\s+/gm, () => { exportsList.push(['default', '__default']); return 'const __default = '; });
  if (/^export\s/m.test(src)) throw new Error(`${id}: танигдаагүй export хэлбэр`);

  const getters = exportsList.map(([k, v]) => `Object.defineProperty(__e, ${JSON.stringify(k)}, { enumerable: true, get: () => ${v} });`).join('\n');
  modules.set(id, `__def(${JSON.stringify(id)}, function (__e) {\n'use strict';\n${getters}\n${src}\n});`);
  order.push(id);
  return id;
}

const entry = transform(join(ROOT, 'js/main.js'));

const loader = `(function () {
  var defs = {}, cache = {};
  window.__def = function (id, fn) { defs[id] = fn; };
  window.__req = function (id) {
    if (cache[id]) return cache[id];
    var e = cache[id] = {};
    defs[id](e);
    return e;
  };
})();`;

const bundle = [
  PROD ? '' : `window.LIFEOS_DEMO = true;${SANDBOX ? '\nwindow.LIFEOS_SANDBOX = true;' : ''}`,
  loader,
  ...order.map((id) => modules.get(id)),
  `__req(${JSON.stringify(entry)});`,
].join('\n\n').replace(/<\/script/gi, '<\\/script');

const css = ['tokens', 'base', 'components', 'pages', 'decor']
  .map((n) => `/* ── css/${n}.css ── */\n${readFileSync(join(ROOT, `css/${n}.css`), 'utf8')}`).join('\n');

const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const pick = (re) => (html.match(re) || [''])[0];
const title = '<title>Life OS</title>';
const favicon = pick(/<link rel="icon"[^>]*>/);
const fonts = pick(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/);
const themeBoot = pick(/<script>\s*\(function \(\) \{[\s\S]*?<\/script>/);
const bodyMarkup = `<div id="app">
  <div class="boot">
    <div class="boot-mark">Life OS</div>
    <p id="boot-msg" class="muted">Ачаалж байна…</p>
  </div>
</div>
<div id="modal-root"></div>
<div id="toast-root" aria-live="polite"></div>`;

const head = `${title}
<meta name="description" content="${PROD ? 'Life OS — хувийн төлөвлөгч.' : 'Life OS — жишээ өгөгдөлтэй урьдчилан харах хувилбар.'}" />
${favicon}
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
${fonts}
<style>
${css}
</style>
${themeBoot}`;

const scriptTag = `<script>\n${bundle}\n</script>`;

const out = FRAGMENT
  ? `${head}\n${bodyMarkup}\n${scriptTag}\n`
  : `<!DOCTYPE html>
<html lang="mn">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#F6F5F1" />
<!-- Автоматаар үүсгэсэн файл (tools/build-preview.mjs). Засварыг js/ болон css/ дотор хийнэ. -->
${head}
</head>
<body>
${bodyMarkup}
${scriptTag}
</body>
</html>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out);
console.log(`${relative(process.cwd(), OUT)} — ${order.length} модуль, ${(out.length / 1024).toFixed(0)} КБ`);
