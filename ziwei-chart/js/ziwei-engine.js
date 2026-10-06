/* ============================================================
   贞观紫微 · 排盘引擎
   翻译自本地 ziwei-doushu-main 的 algorithm.ts / constants.ts / sihua.ts
   底层调用 iztro (https://github.com/SylarLong/iztro) + lunar-javascript
   ============================================================ */

// 库已通过 lib/iztro.min.js 和 lib/lunar.js 以 UMD 全局方式引入（解决 esm.sh 跨域）
const { astro } = window.iztro;
const Solar = window.Solar;

/* ---------- 常量 ---------- */
export const STEMS = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
export const BRANCHES = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];

export const SHICHEN = [
  { branch: 0,  name: '子时', range: '23:00-01:00' },
  { branch: 1,  name: '丑时', range: '01:00-03:00' },
  { branch: 2,  name: '寅时', range: '03:00-05:00' },
  { branch: 3,  name: '卯时', range: '05:00-07:00' },
  { branch: 4,  name: '辰时', range: '07:00-09:00' },
  { branch: 5,  name: '巳时', range: '09:00-11:00' },
  { branch: 6,  name: '午时', range: '11:00-13:00' },
  { branch: 7,  name: '未时', range: '13:00-15:00' },
  { branch: 8,  name: '申时', range: '15:00-17:00' },
  { branch: 9,  name: '酉时', range: '17:00-19:00' },
  { branch: 10, name: '戌时', range: '19:00-21:00' },
  { branch: 11, name: '亥时', range: '21:00-23:00' },
];

// 四化表：年干索引 → [化禄, 化权, 化科, 化忌]
export const SI_HUA_TABLE = {
  0: ['廉贞','破军','武曲','太阳'],  // 甲
  1: ['天机','天梁','紫微','太阴'],  // 乙
  2: ['天同','天机','文昌','廉贞'],  // 丙
  3: ['太阴','天同','天机','巨门'],  // 丁
  4: ['贪狼','太阴','右弼','天机'],  // 戊
  5: ['武曲','贪狼','天梁','文曲'],  // 己
  6: ['太阳','武曲','太阴','天同'],  // 庚
  7: ['巨门','太阳','文曲','文昌'],  // 辛
  8: ['天梁','紫微','左辅','武曲'],  // 壬
  9: ['破军','巨门','太阴','贪狼'],  // 癸
};

// 4×4 网格中每个地支的 [行, 列]
export const BRANCH_GRID_POS = {
  5: [1,1], 6: [1,2], 7: [1,3], 8: [1,4],
  4: [2,1],              9: [2,4],
  3: [3,1],             10: [3,4],
  2: [4,1], 1: [4,2], 0: [4,3], 11: [4,4],
};

// 顺时针渲染顺序（从巳宫开始）
export const ANIMATION_ORDER = [5,6,7,8,9,10,11,0,1,2,3,4];

// 三方四正连线坐标（百分比，用于 SVG）
export const BRANCH_SVG_POS = {
  5: [12.5,12.5], 6: [37.5,12.5], 7: [62.5,12.5], 8: [87.5,12.5],
  4: [12.5,37.5],                                     9: [87.5,37.5],
  3: [12.5,62.5],                                    10: [87.5,62.5],
  2: [12.5,87.5], 1: [37.5,87.5], 0: [62.5,87.5], 11: [87.5,87.5],
};

/* ---------- 工具函数 ---------- */

/** 公历小时(0-23) → 时辰索引(0-11)（按北京时间，无经度校正） */
export function hourToTimeIndex(hour) {
  return Math.floor((hour + 1) / 2) % 12;
}

/** 均时差（Equation of Time，NOAA 近似）：太阳时与钟表时的偏差，全年±15分钟
 *  返回分钟数，正值=太阳时快于钟表时，负值=慢于 */
export function calcEquationOfTime(year, month, day) {
  // 一年中第几天（1月1日=1）
  const start = Date.UTC(year, 0, 0);
  const now = Date.UTC(year, month - 1, day);
  const N = Math.floor((now - start) / 86400000);
  const B = (360 / 365) * (N - 81) * Math.PI / 180;
  return 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
}

/** 真太阳时总偏移（分钟）= 经度校正 + 均时差
 *  经度校正：(经度-120)×4 分钟/度（120°E=北京时间基准）
 *  均时差：地球椭圆轨道+黄赤交角导致 */
export function calcSolarOffset(year, month, day, longitude) {
  return (longitude - 120) * 4 + calcEquationOfTime(year, month, day);
}

/** 真太阳时时辰索引：钟表时间 + 经度校正 + 均时差 */
export function calcTrueSolarBranch(year, month, day, clockHour, clockMinute, longitude) {
  const clockMins = clockHour * 60 + clockMinute;
  const offset = calcSolarOffset(year, month, day, longitude);
  const solar = ((clockMins + offset) % 1440 + 1440) % 1440;
  if (solar >= 1380 || solar < 60) return 0;  // 子时
  return Math.floor((solar - 60) / 120) + 1;
}

/** 公历年 → 年柱天干索引 (0=甲 ... 9=癸) */
export function getYearStemIndex(year) {
  return ((year - 4) % 10 + 10) % 10;
}

/** 公历年 → 年柱地支索引 (0=子 ... 11=亥) */
export function getYearBranchIndex(year) {
  return ((year - 4) % 12 + 12) % 12;
}

/** 天干索引 → 四化映射 {星名: '禄'/'权'/'科'/'忌'} */
export function buildSiHuaOverlay(stemIndex) {
  const stars = SI_HUA_TABLE[stemIndex];
  if (!stars) return {};
  return {
    [stars[0]]: '禄',
    [stars[1]]: '权',
    [stars[2]]: '科',
    [stars[3]]: '忌',
  };
}

/** 由天干索引取四化四星 {禄,权,科,忌} */
export function getSiHuaByStem(stemIndex) {
  const arr = SI_HUA_TABLE[stemIndex];
  if (!arr) return { '禄':'', '权':'', '科':'', '忌':'' };
  return { '禄': arr[0], '权': arr[1], '科': arr[2], '忌': arr[3] };
}

/** 大限四化（取大限宫的宫干）*/
export function getDaXianSiHua(chart, dxIndex) {
  const dx = chart.daXians[dxIndex];
  if (!dx) return null;
  const dxPalace = chart.palaces.find(p => p.branch === dx.palaceBranch);
  if (!dxPalace) return null;
  const stemIndex = dxPalace.stem;
  return {
    stemIndex,
    stemName: STEMS[stemIndex] ?? '',
    transforms: getSiHuaByStem(stemIndex),
    overlay: buildSiHuaOverlay(stemIndex),
  };
}

/** 流年四化（取年干）*/
export function getLiuNianSiHua(year) {
  const stemIndex = getYearStemIndex(year);
  return {
    stemIndex,
    stemName: STEMS[stemIndex] ?? '',
    transforms: getSiHuaByStem(stemIndex),
    overlay: buildSiHuaOverlay(stemIndex),
  };
}

/** 三方四正：本宫 + 对宫 + 两个三合宫 */
export function getSanFangSiZheng(branch) {
  return [
    branch,
    (branch + 6) % 12,  // 对宫
    (branch + 4) % 12,  // 三合1
    (branch + 8) % 12,  // 三合2
  ];
}

/* ---------- 农历信息 ---------- */
export function getLunarInfo(year, month, day) {
  const solar = Solar.fromYmd(year, month, day);
  const lunar = solar.getLunar();
  const yearStem = STEMS.indexOf(lunar.getYearGan());
  const yearBranch = BRANCHES.indexOf(lunar.getYearZhi());
  const rawMonth = lunar.getMonth();
  return {
    lunarYear: lunar.getYear(),
    lunarMonth: Math.abs(rawMonth),
    lunarDay: lunar.getDay(),
    yearStem: yearStem >= 0 ? yearStem : 0,
    yearBranch: yearBranch >= 0 ? yearBranch : 0,
    isLeapMonth: rawMonth < 0,
    // 农历中文表示
    lunarText: lunar.toString(),  // e.g. "二〇二六年六月十三"
    ganzhiYear: lunar.getYearInGanZhi(),  // e.g. "丙午"
    ganzhiMonth: lunar.getMonthInGanZhi(),
    ganzhiDay: lunar.getDayInGanZhi(),
  };
}

/* ---------- 虚岁计算（以农历年/春节为界）----------
 * 大限年龄区间（iztro 输出）为虚岁口径，当前年龄必须同口径匹配，
 * 禁止用公历年份差（周岁）去定位大限。
 * 虚岁 = 当前农历年 - 出生农历年 + 1（1-2月春节前查询自动落在上一农历年） */
export function calcNominalAge(year, month, day) {
  const birthLunarYear = Solar.fromYmd(year, month, day).getLunar().getYear();
  const nowLunarYear = Solar.fromDate(new Date()).getLunar().getYear();
  return nowLunarYear - birthLunarYear + 1;
}

/* ---------- 星曜分类（与本地一致）---------- */
const SHA_STARS = new Set(['擎羊','陀罗','火星','铃星','地空','地劫',
  '天空','旬空','截路','大耗','天使','天伤']);
const LUCKY_STARS = new Set(['文昌','文曲','左辅','右弼','天魁','天钺',
  '禄存','天马','天官','天福','天才','天寿','三台','八座','恩光',
  '天贵','台辅','龙池','凤阁','红鸾','天喜','孤辰','寡宿']);

/** 亮度映射 庙/旺→bright, 陷/不→dim, 其他→normal */
function mapBrightness(b) {
  if (!b) return 'normal';
  if (b === '庙' || b === '旺') return 'bright';
  if (b === '陷' || b === '不') return 'dim';
  return 'normal';
}

function mapStarType(starName, iztroType) {
  if (SHA_STARS.has(starName)) return 'sha';
  if (LUCKY_STARS.has(starName)) return 'lucky';
  const t = (iztroType ?? '').toLowerCase();
  if (t === '主星' || t === 'major') return 'major';
  if (t === '煞星' || t === 'tough') return 'sha';
  if (t === '吉星' || t === 'soft' || t === '禄存' || t === '天马') return 'lucky';
  return 'minor';
}

/** 五行局名 → 数字 */
function parseWuxingJu(name) {
  if (name.includes('二')) return 2;
  if (name.includes('三')) return 3;
  if (name.includes('四')) return 4;
  if (name.includes('五')) return 5;
  if (name.includes('六')) return 6;
  return 3;
}

/* ---------- 主函数：生成命盘 ---------- */
/**
 * @param {Object} birthInfo
 *   { year, month, day, hour(0-23), minute, gender:'male'|'female', name?, province?, city?, longitude? }
 * @returns {Object} ZiweiChart
 */
export function generateChart(birthInfo) {
  const { year, month, day, hour, gender } = birthInfo;

  // hour 由调用方算好真太阳时时辰索引传入（main.js 用 calcTrueSolarBranch）
  const timeIndex = hour;

  // 调用 iztro 排盘（公历）
  const solarDate = `${year}-${month}-${day}`;
  const iztroGender = gender === 'male' ? '男' : '女';
  const astrolabe = astro.bySolar(solarDate, timeIndex, iztroGender, true, 'zh-CN');

  // 组装十二宫
  const palaces = astrolabe.palaces.map(p => {
    const branch = BRANCHES.indexOf(p.earthlyBranch);
    const stem   = STEMS.indexOf(p.heavenlyStem);

    // 合并所有星：主星 + 次星 + 杂耀
    const allStars = [
      ...(p.majorStars ?? []).map(s => ({
        name: s.name,
        type: 'major',
        brightness: mapBrightness(s.brightness),
        brightnessText: s.brightness ?? '',   // 保留原始 庙/旺/平/陷 文字
        siHua: s.mutagen ?? null,
      })),
      ...(p.minorStars ?? []).map(s => ({
        name: s.name,
        type: mapStarType(s.name, s.type),
        brightness: 'normal',
        brightnessText: '',
        siHua: s.mutagen ?? null,
      })),
      ...(p.adjectiveStars ?? []).map(s => ({
        name: s.name,
        type: 'minor',
        brightness: 'normal',
        brightnessText: '',
        siHua: s.mutagen ?? null,
      })),
    ];

    const range = p.decadal?.range;
    return {
      branch: branch >= 0 ? branch : 0,
      stem: stem >= 0 ? stem : 0,
      name: p.name === '仆役' ? '交友' : p.name,
      stars: allStars,
      daXianAge: range ? [range[0], range[1]] : null,
      isMingGong: p.name === '命宫',
      isShenGong: p.isBodyPalace ?? false,
      isCurrentDaXian: false,
    };
  });

  // 当前年龄（虚岁，与大限区间同口径）& 当前大限
  const currentAge = calcNominalAge(year, month, day);
  palaces.forEach(p => {
    if (p.daXianAge && currentAge >= p.daXianAge[0] && currentAge <= p.daXianAge[1]) {
      p.isCurrentDaXian = true;
    }
  });

  // 借对宫结构化字段
  palaces.forEach(p => {
    p.oppositeBranch = (p.branch + 6) % 12;
    const mainStars = p.stars.filter(s => s.type === 'major');
    p.isEmpty = mainStars.length === 0;
    if (p.isEmpty) {
      const oppPalace = palaces.find(q => q.branch === p.oppositeBranch);
      if (oppPalace) {
        p.borrowedFromBranch = oppPalace.branch;
        p.borrowedFromName = oppPalace.name;
        p.borrowedStars = oppPalace.stars.filter(s => s.type === 'major').map(s => s.name);
      }
    }
  });

  // 关键宫支
  const mingGongBranch = BRANCHES.indexOf(astrolabe.earthlyBranchOfSoulPalace);
  const shenGongBranch = BRANCHES.indexOf(astrolabe.earthlyBranchOfBodyPalace);
  const wuxingJuName = astrolabe.fiveElementsClass;
  const wuxingJu = parseWuxingJu(wuxingJuName);

  // 紫微星位置
  const ziweiPalace = palaces.find(p => p.stars.some(s => s.name === '紫微' && s.type === 'major'));
  const ziweiPos = ziweiPalace?.branch ?? 0;

  // 大限数组（按年龄排序）
  const daXians = palaces
    .filter(p => p.daXianAge)
    .sort((a, b) => a.daXianAge[0] - b.daXianAge[0])
    .map(p => ({
      startAge: p.daXianAge[0],
      endAge: p.daXianAge[1],
      palaceBranch: p.branch,
      palaceName: p.name,
    }));

  const currentDaXianIndex = daXians.findIndex(
    dx => currentAge >= dx.startAge && currentAge <= dx.endAge,
  );

  // 农历信息
  const lunarInfo = getLunarInfo(year, month, day);

  // ── 自化计算（本宫宫干四化 → 落本宫=离心，落对宫=向心）──
  const selfTransforms = [];
  palaces.forEach(p => {
    const overlay = buildSiHuaOverlay(p.stem);      // 本宫宫干四化 {星:化}
    // 离心：四化目标星落本宫
    p.stars.forEach(s => {
      if (overlay[s.name]) {
        selfTransforms.push({ palaceBranch:p.branch, palaceName:p.name, stem:p.stem,
          type:'离心', star:s.name, hua:overlay[s.name] });
      }
    });
    // 向心：四化目标星落对宫
    const opp = palaces.find(q => q.branch === (p.branch + 6) % 12);
    if (opp) {
      opp.stars.forEach(s => {
        if (overlay[s.name]) {
          selfTransforms.push({ palaceBranch:p.branch, palaceName:p.name, stem:p.stem,
            type:'向心', star:s.name, hua:overlay[s.name], targetBranch:opp.branch });
        }
      });
    }
  });

  return {
    birthInfo,
    lunarInfo,
    mingGongBranch: mingGongBranch >= 0 ? mingGongBranch : 0,
    shenGongBranch: shenGongBranch >= 0 ? shenGongBranch : 0,
    wuxingJu,
    wuxingJuName,
    ziweiPos,
    palaces,
    daXians,
    currentAge,
    currentDaXianIndex,
    selfTransforms,
  };
}

/* ---------- 动态星（v1.1.0）：大限运星 / 流年流星 ----------
 * 经 iztro horoscope() 提取。已验证 h.decadal.stars[i] / h.yearly.stars[i]
 * 与本命 chart.palaces[i] 同索引对齐（iztro palaces 数组顺序），
 * h.*.palaceNames[i] 为该本命宫位在大限/流年盘中的宫名。
 * 校验用例：戊干大限 → 运禄巳/运羊午/运陀辰/运马寅；
 *          丁年流年 → 流禄午/流羊未/流陀巳。 */

// v1.1.0 全量白名单：运/流 羊陀禄马昌曲魁钺鸾喜
// （流年年解不纳入——知识库无判定规则，入了反而诱导滥用）
const DAXIAN_STAR_WHITELIST = {
  '运羊': '擎羊', '运陀': '陀罗', '运禄': '禄存', '运马': '天马',
  '运昌': '文昌', '运曲': '文曲', '运魁': '天魁', '运钺': '天钺',
  '运鸾': '红鸾', '运喜': '天喜',
};
const LIUNIAN_STAR_WHITELIST = {
  '流羊': '擎羊', '流陀': '陀罗', '流禄': '禄存', '流马': '天马',
  '流昌': '文昌', '流曲': '文曲', '流魁': '天魁', '流钺': '天钺',
  '流鸾': '红鸾', '流喜': '天喜',
};

/** 由 chart.birthInfo 重建 iztro 命盘实例（generateChart 内部同一调用） */
function rebuildAstrolabe(chart) {
  const bi = chart.birthInfo;
  const solarDate = `${bi.year}-${bi.month}-${bi.day}`;
  const iztroGender = bi.gender === 'male' ? '男' : '女';
  return astro.bySolar(solarDate, bi.hour, iztroGender, true, 'zh-CN');
}

/**
 * 取指定日期的 horoscope，按白名单提取动态星，对齐本命十二宫。
 * @param {Object} chart generateChart 产物
 * @param {string} scope 'decadal' | 'yearly'
 * @param {Date} date 该大限/流年内的任一日期（年中 6-15 即可）
 * @param {Object} expect {stem, branch} 期望的层干支（大限宫干支/流年干支），不符则丢弃（防中点岁算错拿到错层数据）
 * @returns {Array|null} 12 项（本命宫序）：{natalBranch, natalPalaceName, scopePalaceName, stars:[{name,base}]}；horoscope 不可用得 null
 */
function getScopeStars(chart, scope, date, expect) {
  const whitelist = scope === 'decadal' ? DAXIAN_STAR_WHITELIST : LIUNIAN_STAR_WHITELIST;
  try {
    const h = rebuildAstrolabe(chart).horoscope(date);
    const layer = h[scope];
    if (!layer || !Array.isArray(layer.stars) || layer.stars.length !== 12) return null;
    if (expect) {
      if (layer.heavenlyStem !== STEMS[expect.stem] || layer.earthlyBranch !== BRANCHES[expect.branch]) return null;
    }
    return chart.palaces.map((p, i) => ({
      natalBranch: p.branch,
      natalPalaceName: p.name,
      scopePalaceName: layer.palaceNames?.[i] === '仆役' ? '交友' : layer.palaceNames?.[i],
      stars: (layer.stars[i] ?? [])
        .filter(s => whitelist[s.name])
        .map(s => ({ name: s.name, base: whitelist[s.name] })),
    }));
  } catch {
    return null;  // horoscope 失败不阻断主流程（动态星为增量信息）
  }
}

/** 虚岁 → 该岁公历 6 月 15 日（年中取日，大限/流年动态星年内不变） */
function nominalAgeToDate(birthYear, nominalAge) {
  return new Date(birthYear + nominalAge - 1, 5, 15);
}

/* ---------- v1.1.0：按本命地支 0-11 序的查表摘要（agent 免手工重建映射）---------- */
/**
 * @param overlay  Detail 的 overlay[12]（scope 宫名键随层而变）
 * @param scopePalaceKey 'daxianPalaceName' | 'liunianPalaceName'
 * @param sihua    层四化 {transforms:{禄,权,科,忌}}
 * @param dynStars daxianStars / liunianStars（可为 null）
 * @returns 12 项（natalBranch 0-11 定序）：{natalBranch,natalPalaceName,scopePalaceName,scopeSiHua[],dynStars[]}
 */
function buildBranchLookup(overlay, scopePalaceKey, sihua, dynStars) {
  const sihuaByBranch = {};
  for (const [tag, starName] of Object.entries(sihua?.transforms ?? {})) {
    const hit = overlay.find(o => (o.natalStars ?? []).some(s => s.name === starName));
    if (hit) (sihuaByBranch[hit.natalBranch] ??= []).push(tag);
  }
  const dynByBranch = {};
  (dynStars ?? []).forEach(d => { if (d.stars?.length) dynByBranch[d.natalBranch] = d.stars.map(s => s.name); });
  return Array.from({ length: 12 }, (_, b) => {
    const o = overlay.find(x => x.natalBranch === b);
    return {
      natalBranch: b,
      natalPalaceName: o?.natalPalaceName ?? null,
      scopePalaceName: o?.[scopePalaceKey] ?? null,
      scopeSiHua: sihuaByBranch[b] ?? [],
      dynStars: dynByBranch[b] ?? [],
    };
  });
}

/* ---------- 大限完整数据（供 agent 分析，与 chart-render 渲染同源）---------- */
export function getDaXianDetail(chart, dxIndex) {
  const dx = chart.daXians[dxIndex];
  if (!dx) return null;
  const sihua = getDaXianSiHua(chart, dxIndex);
  const PALACE_NAMES = ['命宫','兄弟','夫妻','子女','财帛','疾厄','迁移','交友','官禄','田宅','福德','父母'];
  const overlay = PALACE_NAMES.map((name, i) => {
    const br = (dx.palaceBranch - i + 12) % 12;
    const natal = chart.palaces.find(p => p.branch === br);
    return { daxianPalaceName:name, natalBranch:br, natalPalaceName:natal?.name,
             natalStars: natal?.stars.map(s=>({name:s.name,type:s.type,brightnessText:s.brightnessText,siHua:s.siHua})) };
  });
  // v1.1.0：大限动态星（白名单10颗），取大限中点岁所在年；校验层干支=大限宫干支
  const midAge = Math.floor((dx.startAge + dx.endAge) / 2);
  const dxPalace = chart.palaces.find(p => p.branch === dx.palaceBranch);
  const daxianStars = getScopeStars(chart, 'decadal', nominalAgeToDate(chart.birthInfo.year, midAge),
    { stem: dxPalace?.stem, branch: dx.palaceBranch });
  return { dxIndex, startAge:dx.startAge, endAge:dx.endAge,
           daxianPalaceBranch:dx.palaceBranch, daxianPalaceName:dx.palaceName,
           daxianStem: sihua.stemIndex,
           daxianStemName: sihua.stemName,
           daxianSiHua: sihua, overlay, daxianStars,
           branchLookup: buildBranchLookup(overlay, 'daxianPalaceName', sihua, daxianStars) };
}

/* ---------- 流年完整数据（供 agent 分析，与 chart-render 渲染同源）---------- */
export function getLiuNianDetail(chart, year) {
  const stemIdx = getYearStemIndex(year);
  const branchIdx = getYearBranchIndex(year);
  const sihua = getLiuNianSiHua(year);
  const PALACE_NAMES = ['命宫','兄弟','夫妻','子女','财帛','疾厄','迁移','交友','官禄','田宅','福德','父母'];
  const overlay = PALACE_NAMES.map((name, i) => {
    const br = (branchIdx - i + 12) % 12;
    const natal = chart.palaces.find(p => p.branch === br);
    return { liunianPalaceName:name, natalBranch:br, natalPalaceName:natal?.name,
             natalStars: natal?.stars.map(s=>({name:s.name,type:s.type,brightnessText:s.brightnessText,siHua:s.siHua})) };
  });
  // v1.1.0：流年动态星（白名单10颗）；校验层干支=流年干支
  const liunianStars = getScopeStars(chart, 'yearly', new Date(year, 5, 15),
    { stem: stemIdx, branch: branchIdx });
  return { year, yearStem:stemIdx, yearStemName:STEMS[stemIdx], yearBranch:branchIdx,
           yearBranchName:BRANCHES[branchIdx], ganzhi:STEMS[stemIdx]+BRANCHES[branchIdx],
           liunianPalaceBranch:branchIdx, liunianSiHua: sihua, overlay, liunianStars,
           branchLookup: buildBranchLookup(overlay, 'liunianPalaceName', sihua, liunianStars) };
}
