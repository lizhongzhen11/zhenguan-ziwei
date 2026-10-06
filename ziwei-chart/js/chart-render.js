/* ============================================================
   贞观紫微 · 命盘渲染器
   本命 + 大限面板(选中) + 流年面板(大限下) + 三方四正
   ============================================================ */

import {
  STEMS, BRANCHES,
  BRANCH_GRID_POS, ANIMATION_ORDER, BRANCH_SVG_POS,
  getYearStemIndex, getYearBranchIndex,
  buildSiHuaOverlay, getDaXianSiHua, getLiuNianSiHua,
  getSanFangSiZheng,
} from './ziwei-engine.js';

const SIHUA_CLASS = { '禄':'lu', '权':'quan', '科':'ke', '忌':'ji' };
const PALACE_NAMES = ['命宫','兄弟','夫妻','子女','财帛','疾厄','迁移','交友','官禄','田宅','福德','父母'];

export function createChartRenderer(container) {
  const state = {
    chart: null,
    selectedBranch: null,
    selectedDxIndex: null,       // 大限选中项（render 时默认当前大限）
    selectedLiuNianYear: null,   // 选中流年年份
  };

  function render(chart) {
    state.chart = chart;
    state.selectedBranch = null;
    // 默认选中命主当前所处大限（虚岁口径，引擎已算好）；越界（起运前/出运后）回退到最近的一个
    let dxIdx = chart.currentDaXianIndex;
    if (dxIdx === undefined || dxIdx === null || dxIdx < 0) {
      const age = chart.currentAge;
      const arr = chart.daXians || [];
      if (arr.length > 0) {
        dxIdx = (age !== undefined && age < arr[0].startAge) ? 0 : arr.length - 1;
      } else {
        dxIdx = null;
      }
    }
    state.selectedDxIndex = dxIdx;
    state.selectedLiuNianYear = null;
    draw();
  }

  function draw() {
    const { chart, selectedBranch, selectedDxIndex, selectedLiuNianYear } = state;
    if (!chart) return;

    // ── 大限叠加 ──
    let daxianOverlay = {};
    let daxianNames = null;
    let daxianMingBranch = null;
    let daxianStemName = '';
    if (selectedDxIndex !== null && chart.daXians[selectedDxIndex]) {
      const dx = chart.daXians[selectedDxIndex];
      const info = getDaXianSiHua(chart, selectedDxIndex);
      if (info) { daxianOverlay = info.overlay; daxianStemName = info.stemName; }
      daxianMingBranch = dx.palaceBranch;
      daxianNames = {};
      PALACE_NAMES.forEach((name, i) => {
        daxianNames[(dx.palaceBranch - i + 12) % 12] = name;
      });
    }

    // ── 流年叠加 ──
    let liunianOverlay = {};
    let liunianBranch = null;
    let liunianStemName = '';
    let liunianNames = null;
    if (selectedLiuNianYear !== null) {
      const info = getLiuNianSiHua(selectedLiuNianYear);
      liunianOverlay = info.overlay;
      liunianStemName = info.stemName;
      liunianBranch = getYearBranchIndex(selectedLiuNianYear);
      // 流年12宫名映射（同大限规则：命宫=年支，逆地支顺时针）
      liunianNames = {};
      PALACE_NAMES.forEach((name, i) => {
        liunianNames[(liunianBranch - i + 12) % 12] = name;
      });
    }

    const sanFangSet = selectedBranch !== null
      ? new Set(getSanFangSiZheng(selectedBranch))
      : null;

    const palaceMap = {};
    chart.palaces.forEach(p => { palaceMap[p.branch] = p; });

    // 本命四化（年干，始终显示）
    const nativeStemIdx = getYearStemIndex(chart.birthInfo.year);
    const nativeStemName = STEMS[nativeStemIdx];
    const nativeOverlay = buildSiHuaOverlay(nativeStemIdx);

    let html = '';
    html += renderOverlayInfo(nativeStemName, nativeOverlay, selectedDxIndex, daxianStemName, daxianOverlay, selectedLiuNianYear, liunianStemName, liunianOverlay);
    html += renderTitle(chart);
    html += '<div class="chart-grid">';
    ANIMATION_ORDER.forEach(branch => {
      const palace = palaceMap[branch];
      if (!palace) return;
      const [row, col] = BRANCH_GRID_POS[branch];
      html += renderPalace(palace, {
        isSelected: selectedBranch === branch,
        isSanFang: !!(sanFangSet && sanFangSet.has(branch) && selectedBranch !== branch),
        isDaxianMing: selectedDxIndex !== null && branch === daxianMingBranch,
        isLiunianSelected: selectedLiuNianYear !== null && branch === liunianBranch,
        daxianName: daxianNames ? daxianNames[branch] : null,
        daxianOverlay,
        liunianName: liunianNames ? liunianNames[branch] : null,
        liunianOverlay, liunianLabel: '年',
        row, col,
      });
    });
    html += renderCenter(chart, selectedDxIndex, selectedLiuNianYear);
    if (selectedBranch !== null) html += renderSanFangSvg(selectedBranch);
    html += '</div>';
    html += renderLegend();
    html += renderDaXianPanel(chart, selectedDxIndex);
    html += renderLiuNianPanel(chart, selectedDxIndex, selectedLiuNianYear);

    container.innerHTML = html;
  }

  // ── 事件委托 ──
  container.addEventListener('click', (e) => {
    // 流年项点击
    const lnItem = e.target.closest('.liunian-item');
    if (lnItem) {
      const year = parseInt(lnItem.dataset.year, 10);
      state.selectedLiuNianYear = state.selectedLiuNianYear === year ? null : year;
      draw();
      return;
    }
    // 大限项点击
    const dxItem = e.target.closest('.daxian-item');
    if (dxItem) {
      const idx = parseInt(dxItem.dataset.dx, 10);
      // 切换大限时清除流年选中 + 三方四正（命盘刷新干净）
      if (state.selectedDxIndex !== idx) {
        state.selectedLiuNianYear = null;
        state.selectedBranch = null;
      }
      state.selectedDxIndex = state.selectedDxIndex === idx ? null : idx;
      draw();
      return;
    }
    // 点击宫位上的大限年龄 → 切换该大限（联动大限面板，清流年）
    const daxianAge = e.target.closest('.daxian-age');
    if (daxianAge) {
      const palaceEl = daxianAge.closest('.palace');
      const branch = parseInt(palaceEl.dataset.branch, 10);
      const dxIdx = state.chart.daXians.findIndex(dx => dx.palaceBranch === branch);
      if (dxIdx >= 0) {
        if (state.selectedDxIndex !== dxIdx) {
          state.selectedLiuNianYear = null;
          state.selectedBranch = null;
        }
        state.selectedDxIndex = state.selectedDxIndex === dxIdx ? null : dxIdx;
        draw();
      }
      return;
    }
    // 宫位选中（三方四正）
    const palaceEl = e.target.closest('.palace');
    if (palaceEl) {
      const branch = parseInt(palaceEl.dataset.branch, 10);
      state.selectedBranch = state.selectedBranch === branch ? null : branch;
      draw();
      return;
    }
  });

  return { render };
}

/* ---------- 叠加四化信息条 ---------- */
function renderOverlayInfo(nativeStemName, nativeOverlay, selectedDxIndex, daxianStemName, daxianOverlay, selectedLiuNianYear, liunianStemName, liunianOverlay) {
  let html = '<div class="overlay-bar">';
  // 本命四化（始终显示，红色）
  html += '<div class="overlay-info native-info">';
  html += `<span class="label">本命 · ${nativeStemName}干四化：</span>`;
  ['禄','权','科','忌'].forEach(sh => {
    const starName = Object.keys(nativeOverlay).find(k => nativeOverlay[k] === sh);
    if (starName) html += `<span class="sihua-item native">${starName}化${sh}</span>`;
  });
  html += '</div>';
  if (selectedDxIndex !== null && daxianStemName) {
    html += '<div class="overlay-info daxian-info">';
    html += `<span class="label">大限 · ${daxianStemName}干四化：</span>`;
    ['禄','权','科','忌'].forEach(sh => {
      const starName = Object.keys(daxianOverlay).find(k => daxianOverlay[k] === sh);
      if (starName) html += `<span class="sihua-item dx">${starName}化${sh}</span>`;
    });
    html += '</div>';
  }
  if (selectedLiuNianYear !== null && liunianStemName) {
    html += '<div class="overlay-info liunian-info">';
    html += `<span class="label">${selectedLiuNianYear} · ${liunianStemName}年四化：</span>`;
    ['禄','权','科','忌'].forEach(sh => {
      const starName = Object.keys(liunianOverlay).find(k => liunianOverlay[k] === sh);
      if (starName) html += `<span class="sihua-item ln">${starName}化${sh}</span>`;
    });
    html += '</div>';
  }
  html += '</div>';
  return html;
}

/* ---------- 命盘标题 ---------- */
function renderTitle(chart) {
  const name = chart.birthInfo.name ? `${chart.birthInfo.name} · ` : '';
  return `<div class="chart-title">
    <div class="latin">Zi Wei Dou Shu</div>
    <h2>${name}紫微斗数命盘</h2>
  </div>`;
}

/* ---------- 宫位 cell ---------- */
function renderPalace(p, ctx) {
  const {
    isSelected, isSanFang, isDaxianMing, isLiunianSelected,
    daxianName, daxianOverlay,
    liunianName, liunianOverlay, liunianLabel,
    row, col,
  } = ctx;

  const cls = ['palace'];
  if (p.isMingGong) cls.push('is-ming');
  if (p.isShenGong) cls.push('is-shen');
  if (p.isCurrentDaXian) cls.push('is-current-daxian');
  if (isDaxianMing) cls.push('is-daxian-ming');
  if (isLiunianSelected) cls.push('is-liunian-selected');
  if (isSelected) cls.push('is-selected');
  if (isSanFang) cls.push('is-sanfang');

  const ganzhi = `${STEMS[p.stem]}${BRANCHES[p.branch]}`;
  let html = `<div class="${cls.join(' ')}" style="grid-row:${row};grid-column:${col}" data-branch="${p.branch}">`;

  if (p.daXianAge) {
    html += `<div class="daxian-age">${p.daXianAge[0]}–${p.daXianAge[1]}</div>`;
  }

  html += `<div class="palace-name-row"><span class="palace-name">${p.name}</span>`;
  if (p.isMingGong) html += `<span class="badge-tag ming">命</span>`;
  if (p.isShenGong) html += `<span class="badge-tag shen">身</span>`;
  if (daxianName) html += `<span class="palace-daxian-name">限·${daxianName}</span>`;
  if (liunianName) html += `<span class="palace-liunian-name">年·${liunianName}</span>`;
  html += `</div>`;

  html += `<div class="palace-ganzhi">${ganzhi}</div>`;

  const majorStars = p.stars.filter(s => s.type === 'major');
  const luckyStars = p.stars.filter(s => s.type === 'lucky');
  const shaStars   = p.stars.filter(s => s.type === 'sha');
  const minorStars = p.stars.filter(s => s.type === 'minor');

  // 主星（含空宫）
  html += `<div class="major-stars">`;
  if (majorStars.length === 0) {
    html += `<span class="empty-palace">空宫</span>`;
  } else {
    majorStars.forEach(s => {
      html += `<div class="star-major ${s.brightness}">`;
      html += `<span class="star-name">${s.name}</span>`;
      if (s.brightnessText) html += `<span class="brightness">${s.brightnessText}</span>`;
      if (s.siHua) html += renderSihuaBadge(s.siHua, 'native');
      const dxOv = daxianOverlay[s.name];
      if (dxOv) html += renderSihuaBadge(dxOv, 'daxian', '限');
      const lnOv = liunianOverlay[s.name];
      if (lnOv) html += renderSihuaBadge(lnOv, 'liunian', liunianLabel);
      html += `</div>`;
    });
  }
  html += `</div>`;

  // 吉星/煞星/杂曜
  const renderStarLine = (stars) => {
    if (stars.length === 0) return;
    html += `<div class="star-line">`;
    stars.forEach(s => {
      html += `<span class="star-${s.type}">${s.name}`;
      if (s.siHua) html += renderSihuaBadge(s.siHua, 'native');
      const dxOv = daxianOverlay[s.name];
      if (dxOv) html += renderSihuaBadge(dxOv, 'daxian', '限');
      const lnOv = liunianOverlay[s.name];
      if (lnOv) html += renderSihuaBadge(lnOv, 'liunian', liunianLabel);
      html += `</span>`;
    });
    html += `</div>`;
  };
  renderStarLine(luckyStars);
  renderStarLine(shaStars);
  renderStarLine(minorStars);

  html += `</div>`;
  return html;
}

/* ---------- 四化 badge ---------- */
function renderSihuaBadge(siHua, type, label) {
  // 生年红 / 大限绿 / 流年蓝（统一色，靠颜色区分层级）
  const cls = type === 'native' ? 'native'
            : type === 'daxian' ? 'daxian'
            : 'liunian';
  let html = `<span class="sihua-badge ${cls}">`;
  if (label) html += `<span class="overlay-label">${label}</span>`;
  html += siHua;
  html += `</span>`;
  return html;
}

/* ---------- 中央摘要 ---------- */
function renderCenter(chart, selectedDxIndex, selectedLiuNianYear) {
  const { lunarInfo, mingGongBranch, shenGongBranch, wuxingJuName, daXians, currentDaXianIndex, birthInfo } = chart;
  const yearStemIdx = getYearStemIndex(birthInfo.year);
  const yinYang = yearStemIdx % 2 === 0 ? '阳' : '阴';
  const genderText = birthInfo.gender === 'male' ? '男' : '女';

  let html = `<div class="center-summary">`;
  html += `<div class="center-mark">☯</div>`;
  html += `<div class="center-content">`;
  html += `<div class="center-title">紫微斗数</div>`;
  html += `<div class="center-meta">`;
  html += `<div class="meta-row"><span class="meta-key">命宫</span><span class="meta-val">${BRANCHES[mingGongBranch]}</span></div>`;
  html += `<div class="meta-row"><span class="meta-key">身宫</span><span class="meta-val shen">${BRANCHES[shenGongBranch]}</span></div>`;
  html += `</div>`;
  html += `<div class="center-ju">${yinYang}${genderText} · ${wuxingJuName}</div>`;
  const showDxIndex = selectedDxIndex !== null ? selectedDxIndex : currentDaXianIndex;
  if (showDxIndex >= 0 && daXians[showDxIndex]) {
    const dx = daXians[showDxIndex];
    const isSel = selectedDxIndex !== null;
    html += `<div class="current-daxian-box ${isSel ? 'selected' : ''}">`;
    html += `<div class="cd-label">${isSel ? '选中大限' : '当前大限'}</div>`;
    html += `<div class="cd-age">${dx.startAge}–${dx.endAge}岁</div>`;
    html += `<div class="cd-name">${dx.palaceName}</div>`;
    html += `</div>`;
  }
  if (selectedLiuNianYear !== null) {
    const bIdx = getYearBranchIndex(selectedLiuNianYear);
    html += `<div class="current-liunian-box">`;
    html += `<div class="cd-label">选中流年</div>`;
    html += `<div class="cd-age">${selectedLiuNianYear}</div>`;
    html += `<div class="cd-name">${BRANCHES[bIdx]}宫</div>`;
    html += `</div>`;
  }
  html += `<div class="center-lunar">${lunarInfo.ganzhiYear}年 · 农历${lunarInfo.lunarMonth}月${lunarInfo.lunarDay}日</div>`;
  html += `</div></div>`;
  return html;
}

/* ---------- 大限面板 ---------- */
function renderDaXianPanel(chart, selectedDxIndex) {
  let html = '<div class="daxian-panel">';
  html += '<div class="daxian-panel-title">大限 · 点击选中（命盘叠加该大限盘）</div>';
  html += '<div class="daxian-list">';
  chart.daXians.forEach((dx, i) => {
    const palace = chart.palaces.find(p => p.branch === dx.palaceBranch);
    const stemName = palace ? STEMS[palace.stem] : '';
    const classes = ['daxian-item'];
    if (i === selectedDxIndex) classes.push('selected');
    if (i === chart.currentDaXianIndex) classes.push('current');
    html += `<div class="${classes.join(' ')}" data-dx="${i}">`;
    html += `<span class="dx-age">${dx.startAge}–${dx.endAge}岁</span>`;
    html += `<span class="dx-ganzhi">${stemName}${BRANCHES[dx.palaceBranch]}</span>`;
    html += `<span class="dx-name">${dx.palaceName}</span>`;
    html += `</div>`;
  });
  html += '</div></div>';
  return html;
}

/* ---------- 流年面板（选中大限下）---------- */
function renderLiuNianPanel(chart, selectedDxIndex, selectedLiuNianYear) {
  if (selectedDxIndex === null || !chart.daXians[selectedDxIndex]) {
    return '<div class="liunian-panel"><div class="liunian-panel-title">流年 · 请先选择大限</div></div>';
  }
  const dx = chart.daXians[selectedDxIndex];
  const birthYear = chart.birthInfo.year;
  let html = '<div class="liunian-panel">';
  html += `<div class="liunian-panel-title">流年 · ${dx.startAge}–${dx.endAge}岁大限下（点击选中，命盘叠加流年）</div>`;
  html += '<div class="liunian-list">';
  for (let n = dx.startAge; n <= dx.endAge; n++) {
    const year = birthYear + n - 1;  // 虚岁n → 公历年
    const stemIdx = getYearStemIndex(year);
    const branchIdx = getYearBranchIndex(year);
    const ganzhi = STEMS[stemIdx] + BRANCHES[branchIdx];
    const selected = year === selectedLiuNianYear ? ' selected' : '';
    html += `<div class="liunian-item${selected}" data-year="${year}">`;
    html += `<span class="ln-year">${year}</span>`;
    html += `<span class="ln-age">${n}岁</span>`;
    html += `<span class="ln-ganzhi">${ganzhi}</span>`;
    html += `<span class="ln-palace">${BRANCHES[branchIdx]}宫</span>`;
    html += `</div>`;
  }
  html += '</div></div>';
  return html;
}

/* ---------- 三方四正 SVG 连线 ---------- */
function renderSanFangSvg(branch) {
  const sf = getSanFangSiZheng(branch);
  const pts = sf.map(b => BRANCH_SVG_POS[b]);
  const dash = '6,5';
  const stroke = 'rgba(26,86,168,0.55)';
  const sw = '1.5';
  const [p0, p1, p2, p3] = pts;
  let html = `<svg class="sanfang-svg" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">`;
  html += `<line x1="${p0[0]}%" y1="${p0[1]}%" x2="${p1[0]}%" y2="${p1[1]}%" stroke="${stroke}" stroke-width="${sw}" stroke-dasharray="${dash}" stroke-linecap="round" />`;
  html += `<line x1="${p0[0]}%" y1="${p0[1]}%" x2="${p2[0]}%" y2="${p2[1]}%" stroke="${stroke}" stroke-width="${sw}" stroke-dasharray="${dash}" stroke-linecap="round" />`;
  html += `<line x1="${p2[0]}%" y1="${p2[1]}%" x2="${p3[0]}%" y2="${p3[1]}%" stroke="${stroke}" stroke-width="${sw}" stroke-dasharray="${dash}" stroke-linecap="round" />`;
  html += `<line x1="${p3[0]}%" y1="${p3[1]}%" x2="${p0[0]}%" y2="${p0[1]}%" stroke="${stroke}" stroke-width="${sw}" stroke-dasharray="${dash}" stroke-linecap="round" />`;
  pts.forEach((p, i) => {
    html += `<circle cx="${p[0]}%" cy="${p[1]}%" r="3" fill="${i === 0 ? 'rgba(26,86,168,0.85)' : 'rgba(26,86,168,0.4)'}" />`;
  });
  html += `</svg>`;
  return html;
}

/* ---------- 图例 ---------- */
function renderLegend() {
  return `<div class="legend">
    <span class="legend-item native">生年四化</span>
    <span class="legend-item dx">大限四化</span>
    <span class="legend-item ln">流年四化</span>
    <span class="legend-hint">点击宫位看三方四正</span>
  </div>`;
}
