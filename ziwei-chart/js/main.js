/* ============================================================
   贞观紫微 · 入口
   表单 + 省市选择 + 真太阳时校正 → generateChart → 渲染
   ============================================================ */

import { generateChart, calcTrueSolarBranch, calcSolarOffset, SHICHEN } from './ziwei-engine.js';
import { createChartRenderer } from './chart-render.js';
import { PROVINCES } from './cities.js';

const chartArea = document.getElementById('chartArea');
const renderer = createChartRenderer(chartArea);

/* ---------- 省市选择 ---------- */
const provSelect = document.getElementById('f_province');
const citySelect = document.getElementById('f_city');
const locInfo = document.getElementById('locationInfo');

let curLongitude = 120;  // 默认北京时间（东经120）

// 填充省份
PROVINCES.forEach(p => {
  const opt = document.createElement('option');
  opt.value = p.name;
  opt.textContent = p.name;
  provSelect.appendChild(opt);
});

function getFormDate() {
  return {
    year: parseInt(document.getElementById('f_year').value, 10),
    month: parseInt(document.getElementById('f_month').value, 10),
    day: parseInt(document.getElementById('f_day').value, 10),
  };
}

function updateLocationInfo() {
  const { year, month, day } = getFormDate();
  if (!year || !month || !day) {
    locInfo.textContent = `经度 ${curLongitude.toFixed(1)}°E`;
    return;
  }
  const totalOffset = calcSolarOffset(year, month, day, curLongitude);
  const offsetMin = Math.round(totalOffset);
  const sign = offsetMin > 0 ? '+' : '';
  locInfo.textContent = `经度 ${curLongitude.toFixed(1)}°E · 真太阳时差 ${sign}${offsetMin} 分钟（含均时差）`;
}

provSelect.addEventListener('change', () => {
  const prov = PROVINCES.find(p => p.name === provSelect.value);
  citySelect.innerHTML = '';
  if (!prov) {
    citySelect.disabled = true;
    citySelect.innerHTML = '<option value="">先选省份</option>';
    curLongitude = 120;
    locInfo.textContent = '未选择地点 · 按北京时间起盘';
    updateShichenHint();
    return;
  }
  citySelect.disabled = false;
  prov.cities.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.name;
    opt.textContent = c.name;
    citySelect.appendChild(opt);
  });
  citySelect.value = prov.cities[0].name;
  curLongitude = prov.cities[0].longitude;
  updateLocationInfo();
  updateShichenHint();
});

citySelect.addEventListener('change', () => {
  const prov = PROVINCES.find(p => p.name === provSelect.value);
  const city = prov?.cities.find(c => c.name === citySelect.value);
  if (city) {
    curLongitude = city.longitude;
    updateLocationInfo();
    updateShichenHint();
  }
});

/* ---------- 时辰实时提示（真太阳时）---------- */
function updateShichenHint() {
  const h = parseInt(document.getElementById('f_hour').value, 10);
  const m = parseInt(document.getElementById('f_minute').value, 10);
  if (isNaN(h)) return;
  const { year, month, day } = getFormDate();
  const branch = calcTrueSolarBranch(year, month, day, h, isNaN(m) ? 0 : m, curLongitude);
  const hint = document.getElementById('shichenHint');
  hint.textContent = SHICHEN[branch].name;
  hint.title = SHICHEN[branch].range;
}
['f_hour', 'f_minute'].forEach(id => {
  document.getElementById(id).addEventListener('input', updateShichenHint);
});
['f_year', 'f_month', 'f_day'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    updateLocationInfo();
    updateShichenHint();
  });
});

// 默认不预填省市——由用户在表单中自行选择（避免预填值导致误排）
// 单文件 HTML 导出时，下方 DEFAULT_LOCATION 块会被替换为命主实际生辰
/* DEFAULT_LOCATION_START */
/* DEFAULT_LOCATION_END */

/* ---------- 表单提交 ---------- */
const form = document.getElementById('birthForm');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  doChart();
});

function doChart() {
  const year   = parseInt(document.getElementById('f_year').value, 10);
  const month  = parseInt(document.getElementById('f_month').value, 10);
  const day    = parseInt(document.getElementById('f_day').value, 10);
  const hour   = parseInt(document.getElementById('f_hour').value, 10);
  const minute = parseInt(document.getElementById('f_minute').value, 10);
  const gender = document.querySelector('input[name="gender"]:checked').value;
  const name   = document.getElementById('f_name').value.trim();

  if (!year || !month || !day || isNaN(hour)) {
    showEmpty();
    return;
  }

  chartArea.innerHTML = `<div class="chart-loading"><div class="spinner"></div><p>正在排盘…</p></div>`;

  setTimeout(() => {
    try {
      // 真太阳时时辰索引（经度校正后）
      const timeIndex = calcTrueSolarBranch(year, month, day, hour, isNaN(minute) ? 0 : minute, curLongitude);
      const chart = generateChart({
        year, month, day,
        hour: timeIndex,        // 传时辰索引（非钟表小时）
        minute, gender, name,
        longitude: curLongitude,
      });
      renderer.render(chart);
    } catch (err) {
      console.error('[排盘失败]', err);
      chartArea.innerHTML = `<div class="chart-error">
        <div class="err-title">排盘失败</div>
        <div>${escapeHtml(err.message || String(err))}</div>
        <div style="margin-top:8px;font-size:11px;opacity:0.7;">请检查出生信息是否正确，或刷新重试</div>
      </div>`;
    }
  }, 30);
}

function showEmpty() {
  chartArea.innerHTML = `<div class="chart-placeholder" id="chartPlaceholder">
    <div class="placeholder-mark">☯</div>
    <p>填入出生信息，点击「起盘」生成命盘</p>
  </div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

/* ---------- 页面加载即起默认盘 ---------- */
doChart();
