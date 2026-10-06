#!/usr/bin/env node
/* ============================================================
   贞观紫微 · 排盘引擎 CLI
   agent 通过 Bash 调用：node engine-cli.mjs 生辰参数 [--format json|html]
   JSON 模式输出结构化命盘；HTML 模式输出单文件内联排盘报告（file:// 双击可用）
   ============================================================ */

import { createRequire } from 'node:module';
globalThis.self = globalThis;  // iztro UMD 头部用 self 全局，node 需 shim
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
globalThis.window = {
  iztro: require('./lib/iztro.min.js'),
  Solar: require('./lib/lunar.js').Solar,
};

const Engine = await import('./js/ziwei-engine.js');
const { PROVINCES } = await import('./js/cities.js');
const {
  generateChart, calcTrueSolarBranch, calcSolarOffset,
  getDaXianDetail, getLiuNianDetail,
  SHICHEN, STEMS, BRANCHES,
} = Engine;

/* ---------- 参数解析 ---------- */
/* 位置参数：年 月 日 时 分 性别 [省] [市]
   选项参数：可出现在任意位置（省/市 可省略，选项不与位置位冲突） */
const FLAG_ARGS = new Set(['--format', '--daxian', '--liunian', '--out', '--name', '--longitude']);

function parseArgs(argv) {
  const a = {
    year: NaN, month: NaN, day: NaN, hour: NaN, minute: 0,
    gender: null,
    province: null, city: null, longitude: null,
    format: 'json', daxian: undefined, liunian: undefined, out: null, name: null,
  };
  const pos = [];
  for (let j = 0; j < argv.length; j++) {
    const arg = argv[j];
    if (FLAG_ARGS.has(arg)) {
      const val = argv[++j];
      if (arg === '--format') a.format = val;
      else if (arg === '--daxian') a.daxian = +val;
      else if (arg === '--liunian') a.liunian = +val;
      else if (arg === '--out') a.out = val;
      else if (arg === '--name') a.name = val;
      else if (arg === '--longitude') {
        const n = parseFloat(val);
        if (!Number.isNaN(n)) a.longitude = n;   // 非法值不覆盖，回落到省市查表
      }
    } else if (arg === '--') {
      pos.push(...argv.slice(j + 1));            // 显式终止选项解析
      break;
    } else if (arg.startsWith('--')) {
      // 未知选项：忽略自身，不误吞后续位置参数
    } else {
      pos.push(arg);
    }
  }
  a.year = +pos[0]; a.month = +pos[1]; a.day = +pos[2];
  a.hour = +pos[3];
  if (pos[4] !== undefined) a.minute = +pos[4];
  a.gender = pos[5];
  if (pos[6] !== undefined) a.province = pos[6];
  if (pos[7] !== undefined) a.city = pos[7];
  return a;
}

/** 兜底经度：缺省市时按北京（116.4°E）计——与《05-0》文档口径一致 */
const FALLBACK_LONGITUDE = 116.4;

function lookupLongitude(province, city) {
  if (!province) return FALLBACK_LONGITUDE;
  const p = PROVINCES.find(x => x.name === province || x.name.startsWith(province));
  if (!p) return FALLBACK_LONGITUDE;
  if (!city) return p.cities[0].longitude;
  const c = p.cities.find(x => x.name === city || x.name.startsWith(city));
  return c ? c.longitude : p.cities[0].longitude;
}

function buildBirthInfo(a) {
  const longitude = a.longitude ?? lookupLongitude(a.province, a.city);
  const timeIndex = calcTrueSolarBranch(a.year, a.month, a.day, a.hour, a.minute, longitude);
  const offsetMin = Math.round(calcSolarOffset(a.year, a.month, a.day, longitude));
  return {
    year: a.year, month: a.month, day: a.day,
    hour: timeIndex, minute: a.minute, gender: a.gender, name: a.name,
    province: a.province, city: a.city, longitude,
    _clockHour: a.hour, _offsetMin: offsetMin, _shichenName: SHICHEN[timeIndex].name,
  };
}

/* ---------- HTML 单文件内联 ---------- */
function stripEsm(code) {
  return code
    // export function/const/let/var/class → 去掉 export 前缀
    .replace(/^export\s+(function|const|let|var|class)\s/gm, '$1 ')
    // export { a, b }; → 删掉（命名导出）
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, '')
    // import ... from '...'; （单行或多行，匹配 import 开头到 from '...' + ; 整块）
    .replace(/^\s*import\s[\s\S]*?from\s+['"][^'"]+['"]\s*;?[^\n]*\n/gm, '')
    // import 'xxx'; （副作用 import，无 from）
    .replace(/^\s*import\s+['"][^'"]+['"]\s*;?\s*$/gm, '');
}

function patchMain(mainCode, birthInfo) {
  const emb = `var EMBEDDED_BIRTH = ${JSON.stringify({
    year: birthInfo.year, month: birthInfo.month, day: birthInfo.day,
    hour: birthInfo._clockHour, minute: birthInfo.minute,
    gender: birthInfo.gender, province: birthInfo.province || '北京市',
    city: birthInfo.city || '北京', name: birthInfo.name || '',
  })};`;
  const setup = `
${emb}
["f_year","f_month","f_day","f_hour","f_minute"].forEach(function(id,i){
  document.getElementById(id).value = [EMBEDDED_BIRTH.year,EMBEDDED_BIRTH.month,EMBEDDED_BIRTH.day,EMBEDDED_BIRTH.hour,EMBEDDED_BIRTH.minute][i];
});
document.querySelector("input[name=gender][value=" + EMBEDDED_BIRTH.gender + "]").checked = true;
if (EMBEDDED_BIRTH.name) document.getElementById("f_name").value = EMBEDDED_BIRTH.name;
provSelect.value = EMBEDDED_BIRTH.province; provSelect.dispatchEvent(new Event("change"));
citySelect.value = EMBEDDED_BIRTH.city; citySelect.dispatchEvent(new Event("change"));`;
  // 替换默认省市块（锚定标记块，不依赖具体注释文字）
  return mainCode.replace(
    /\/\* DEFAULT_LOCATION_START \*\/[\s\S]*?\/\* DEFAULT_LOCATION_END \*\//,
    setup.trim()
  );
}

function buildSingleFileHTML(birthInfo) {
  const dir = import.meta.dirname;
  const read = f => fs.readFileSync(path.join(dir, f), 'utf-8');

  let html = read('index.html');
  // 内联 CSS
  html = html.replace(/<link rel="stylesheet" href="css\/chart\.css" \/>/, `<style>${read('css/chart.css')}</style>`);
  // 所有 JS 内联到一个 script（同 script 内 const 可见，避免跨 script 作用域）
  const allJs = [
    read('lib/iztro.min.js'),
    read('lib/lunar.js'),
    stripEsm(read('js/cities.js')),
    stripEsm(read('js/ziwei-engine.js')),
    stripEsm(read('js/chart-render.js')),
    patchMain(stripEsm(read('js/main.js')), birthInfo),
  ].join('\n;\n');
  // allJs 里的 </script> 转义，避免浏览器提前关闭 script 标签
  const allJsSafe = allJs.replace(/<\/script>/g, '<\\/script>');
  // 用 split/join 稳健替换（不依赖正则）
  html = html.split('<script src="lib/iztro.min.js"></script>').join('');
  html = html.split('<script src="lib/lunar.js"></script>').join('');
  html = html.split('<script type="module" src="js/main.js"></script>').join(`<script>${allJsSafe}</script>`);
  return html;
}

/* ---------- 主流程 ---------- */
const a = parseArgs(process.argv.slice(2));
if (!a.year || !a.month || !a.day || isNaN(a.hour) || isNaN(a.minute) || !a.gender) {
  console.error('用法: node engine-cli.mjs <年> <月> <日> <时> <分> <male|female> [省] [市] [--format json|html] [--daxian <idx>] [--liunian <年>] [--out <路径>] [--name <名>] [--longitude <度>]');
  process.exit(1);
}

const birthInfo = buildBirthInfo(a);
const chart = generateChart(birthInfo);

if (a.format === 'html') {
  const html = buildSingleFileHTML(birthInfo);
  const defaultName = a.name || '匿名';
  const dateStr = `${a.year}${String(a.month).padStart(2,'0')}${String(a.day).padStart(2,'0')}`;
  const out = a.out || `${process.cwd()}/${defaultName}-${dateStr}-排盘.html`;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html, 'utf-8');
  console.log(JSON.stringify({ ok: true, path: out, size: html.length }));
  process.exit(0);
}

// JSON 模式
let payload = { type: 'natal', birthInfo, chart };
if (a.daxian !== undefined) {
  payload = { type: 'daxian', daxianIndex: a.daxian, ...getDaXianDetail(chart, a.daxian) };
}
if (a.liunian !== undefined) {
  const ln = getLiuNianDetail(chart, a.liunian);
  payload = a.daxian !== undefined
    ? { type: 'daxian_liunian', daxianIndex: a.daxian, liunian: a.liunian,
        daxian: getDaXianDetail(chart, a.daxian), liunian: ln }
    : { type: 'liunian', liunian: a.liunian, ...ln };
}
process.stdout.write(JSON.stringify(payload, null, 2));
