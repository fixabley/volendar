import * as s1365 from './sources/site1365.js';
import * as vms from './sources/vms.js';
import { createHttp } from './lib/http.js';
import { buildIcs } from './lib/ics.js';
import { addDays, addMonths, monthGrid, todayKST, weekdayName } from './lib/dates.js';
import { classifyOpening, defaultAvailability, expand, isLongRange } from './lib/schedule.js';
import { formatMinutes, itemMinutes, summarizeHours } from './lib/hours.js';
import { PROVINCES, mergeSubAreas } from './lib/regions.js';
import { busyBlocks, parseIcs } from './lib/icsParse.js';
import { appliedContacts } from './lib/contacts.js';
import { buildVcard } from './lib/vcard.js';
import { demoApplied, demoCalendarIcs, demoOpenings, demoSubAreas } from './demo.js';

const SOURCES = { 1365: s1365, vms };
const LABEL = { 1365: '1365', vms: 'VMS', ext: '내 캘린더' };
const STATUS_LABEL = { pending: '접수·대기', confirmed: '승인', cancelled: '취소·반려', unknown: '기타', open: '모집' };
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const MAX_CHIPS = 4;

const http = createHttp();
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

// replaceChildren은 false·undefined를 글자로 넣어 버리므로 걸러서 넣는다
function fill(el, ...children) {
  el.replaceChildren(...children.flat().filter((c) => c != null && c !== false && c !== ''));
}

const today = todayKST();
// app.html?demo 로 열면 사이트에 요청하지 않고 예시 데이터만 쓴다 (스크린샷·시연용)
const DEMO = new URLSearchParams(location.search).has('demo');

const DEFAULT_SETTINGS = {
  appliedSources: ['1365', 'vms'],
  appliedStatuses: ['pending', 'confirmed', 'unknown'],
  includeLong: true,
  showExternalInApplied: true,
  search: {
    sources: ['1365', 'vms'], province: '', keyword: '', openOnly: true,
    field1365: '', week: '0', online1365: '', adult: false, youth: false,
    actTypeVms: '', faceVms: '', termVms: '', maxPages1365: 5, maxPagesVms: 2,
  },
  freeTime: { hideConflicts: true, bufferMin: 0, useAvailability: false, availability: defaultAvailability(), showUntimed: true, allDayBusy: false, busyStatuses: ['confirmed', 'pending', 'unknown'], hideApplied: false },
  calendars: [], // 외부 캘린더 ICS 주소 [{ url }]
};

const state = {
  mode: 'applied',
  month: today.slice(0, 7),
  applied: { 1365: { status: 'idle', items: [] }, vms: { status: 'idle', items: [] } },
  openings: { status: 'idle', items: [], summary: {} },
  subAreas: [],
  // 외부 캘린더: 주소별 일정(메모리에만)과 파일에서 불러온 일정(제목 없이 저장)
  external: { byUrl: {}, file: null, blocks: [], unsupported: 0 },
  selected: null, // { type: 'item', occ } | { type: 'day', date }
  settings: structuredClone(DEFAULT_SETTINGS),
};

// ---------- 설정 저장 (필터만 저장하고 조회 결과는 저장하지 않는다) ----------

const storage = globalThis.chrome?.storage?.local;

async function loadSettings() {
  if (DEMO) return; // 예시 화면은 저장된 설정과 섞지 않는다
  try {
    const { settings, calendarFile } = (await storage?.get(['settings', 'calendarFile'])) ?? {};
    state.external.file = calendarFile ?? null;
    if (!settings) return;
    state.settings = {
      ...DEFAULT_SETTINGS,
      ...settings,
      search: { ...DEFAULT_SETTINGS.search, ...settings.search },
      freeTime: { ...DEFAULT_SETTINGS.freeTime, ...settings.freeTime },
    };
  } catch {
    // 저장소를 못 쓰면 기본값으로 동작한다
  }
}

const saveSettings = () => (DEMO ? undefined : storage?.set({ settings: state.settings }).catch(() => {}));

// ---------- 상세 페이지 (장소·활동요일·추정 시간) ----------

const details = new Map();

function getDetail(item) {
  if (DEMO) return Promise.resolve(null);
  const key = `${item.source}:${item.id}`;
  if (!details.has(key)) details.set(key, SOURCES[item.source].fetchDetail(http, item.id).catch(() => null));
  return details.get(key);
}

// VMS는 하루짜리 공고만 본문 시간을 그 날의 시간으로 쓴다. 여러 날이면 어느 날의 시간인지 알 수 없다.
function applyDetail(item, d) {
  if (!d) {
    item.detailFailed = true;
    return;
  }
  item.detailLoaded = true;
  item.place ||= d.place;
  item.org ||= d.org;
  item.content ||= d.content;
  // 비어 있는 칸은 빼고 둔다
  item.contact ??= Object.fromEntries(Object.entries(d.contact ?? {}).filter(([, v]) => v));
  if (item.source === '1365') {
    item.creditCapHours = d.creditCapHours;
    if (item.kind === 'opening' && item.endDate > item.date) {
      item.weekdays = d.weekdays;
      item.weekdaysText = d.weekdaysText;
    }
  }
  if (item.source === 'vms') {
    item.cycle = d.cycle;
    item.field = d.field;
    if (!item.startTime && item.date === item.endDate) {
      if (d.guessedTime) {
        item.startTime = d.guessedTime.start;
        item.endTime = d.guessedTime.end;
        item.timeGuessed = true;
      }
      item.guessedHours = d.guessedHours;
    }
  }
}

function enrich(items, needsDetail) {
  for (const item of items.filter(needsDetail)) {
    item.detailPending = true;
    getDetail(item).then((d) => {
      item.detailPending = false;
      applyDetail(item, d);
      scheduleRender();
    });
  }
}

// ---------- 신청내역 ----------

async function loadApplied() {
  if (DEMO) {
    for (const [key, items] of Object.entries(demoApplied(today))) state.applied[key] = { status: 'ok', items };
    render();
    return;
  }
  for (const key of Object.keys(SOURCES)) state.applied[key] = { status: 'loading', items: [] };
  render();
  await Promise.all(
    Object.entries(SOURCES).map(async ([key, src]) => {
      try {
        const res = await src.fetchApplied(http);
        state.applied[key] = { status: res.needLogin ? 'needLogin' : 'ok', items: res.items };
        // 신청내역은 몇 건 안 되므로 장소를 채우려고 상세를 모두 가져온다
        enrich(res.items, (it) => it.statusKind !== 'cancelled');
      } catch (e) {
        state.applied[key] = { status: 'error', items: [], error: e.message };
      }
      render();
    }),
  );
}

const allApplied = () => Object.values(state.applied).flatMap((a) => a.items);

function filteredApplied() {
  const s = state.settings;
  const kw = $('#appliedKeyword').value.trim();
  return allApplied().filter(
    (it) => s.appliedSources.includes(it.source) && s.appliedStatuses.includes(it.statusKind) && (!kw || it.title.includes(kw)),
  );
}

// ---------- 모집 검색 ----------

function readSearchForm() {
  const s = state.settings.search;
  s.sources = $$('input[name=searchSource]:checked').map((i) => i.value);
  s.province = $('#province').value;
  s.keyword = $('#keyword').value.trim();
  s.openOnly = $('#openOnly').checked;
  for (const id of ['field1365', 'week', 'online1365', 'actTypeVms', 'faceVms', 'termVms']) s[id] = $(`#${id}`).value;
  s.adult = $('#adult').checked;
  s.youth = $('#youth').checked;
  s.maxPages1365 = clampInt($('#maxPages1365').value, 1, 30, 5);
  s.maxPagesVms = clampInt($('#maxPagesVms').value, 1, 10, 2);
  saveSettings();
  return { ...s, from: $('#from').value, to: $('#to').value, subArea: $('#subArea').value };
}

function clampInt(v, min, max, fallback) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

// 같은 조건의 검색 결과는 잠시 다시 쓴다. 조건을 바꿀 때마다 바로 검색하므로 사이트에 같은 요청을 반복하지 않으려는 것
const SEARCH_CACHE_MS = 10 * 60 * 1000;
const searchCache = new Map();

async function runSearch() {
  const f = readSearchForm();
  if (!f.from || !f.to || f.from > f.to) {
    showNotice('봉사 기간을 다시 확인해 주세요.');
    return;
  }
  if (f.sources.length === 0) {
    showNotice('검색할 사이트를 하나 이상 골라 주세요.');
    return;
  }
  const province = PROVINCES.find((p) => p.name === f.province);
  const sub = state.subAreas.find((a) => a.name === f.subArea);
  const filters = {
    ...f,
    area1365: province?.c1365, subArea1365: sub?.c1365,
    areaVms: province?.cVms, subAreaVms: sub?.cVms,
  };
  const summary = {};
  // 지난 날짜는 신청할 수 없으니 오늘부터만 보여준다.
  // 검색이 겹치면 앞선 검색의 늦은 응답이 화면을 덮지 않도록, 이번 검색의 객체에만 결과를 넣는다
  const openings = { status: 'loading', items: [], summary, range: { from: f.from < today ? today : f.from, to: f.to } };
  state.openings = openings;
  const isCurrent = () => state.openings === openings;
  if (state.month < f.from.slice(0, 7) || state.month > f.to.slice(0, 7)) state.month = f.from.slice(0, 7);
  $('#searchBtn').disabled = true;
  render();

  if (DEMO) {
    openings.items = demoOpenings(today, f);
    for (const key of f.sources) {
      const n = openings.items.filter((it) => it.source === key).length;
      summary[key] = { loaded: n, total: n };
    }
    openings.status = 'ok';
    $('#searchBtn').disabled = false;
    render();
    return;
  }

  await Promise.all(
    f.sources.map(async (key) => {
      if (sub && (key === '1365' ? !sub.c1365 : sub.cVms.length === 0)) {
        summary[key] = { skipped: `${LABEL[key]}에는 '${sub.name}' 지역이 없어 검색하지 않았습니다.` };
        return;
      }
      const maxPages = key === '1365' ? f.maxPages1365 : f.maxPagesVms;
      const cacheKey = `${key}|${maxPages}|${JSON.stringify(key === '1365' ? s1365.searchForm(filters, 1) : vms.searchParams(filters))}`;
      const cached = searchCache.get(cacheKey);
      summary[key] = { loading: true, loaded: 0, total: 0 };
      try {
        const res = cached && Date.now() - cached.at < SEARCH_CACHE_MS
          ? cached.res
          : await SOURCES[key].searchOpenings(http, filters, {
            maxPages,
            onProgress: (p) => {
              Object.assign(summary[key], p);
              if (isCurrent()) scheduleRender();
            },
          });
        if (res !== cached?.res) {
          searchCache.set(cacheKey, { at: Date.now(), res });
          enrich(res.items, (it) => (key === '1365' ? it.endDate > it.date : it.date === it.endDate));
        }
        summary[key] = { loaded: res.items.length, total: res.total, truncated: res.truncated };
        openings.items.push(...res.items);
      } catch (e) {
        summary[key] = { error: e.message };
      }
      if (isCurrent()) scheduleRender();
    }),
  );
  openings.status = 'ok';
  if (!isCurrent()) return;
  $('#searchBtn').disabled = false;
  render();
}

async function loadSubAreas() {
  const province = PROVINCES.find((p) => p.name === $('#province').value);
  const select = $('#subArea');
  select.replaceChildren(h('option', { value: '' }, '전체'));
  select.disabled = true;
  state.subAreas = [];
  if (!province) return;
  if (DEMO) {
    state.subAreas = demoSubAreas();
    select.append(...state.subAreas.map((s) => h('option', { value: s.name }, s.name)));
    select.disabled = false;
    return;
  }
  const [a, b] = await Promise.all([
    s1365.fetchSubAreas(http, province.c1365).catch(() => []),
    vms.fetchSubAreas(http, province.cVms).catch(() => []),
  ]);
  state.subAreas = mergeSubAreas(a, b);
  select.append(...state.subAreas.map((s) => h('option', { value: s.name }, s.name)));
  select.disabled = false;
}

// ---------- 달력에 놓을 일정 계산 ----------

function gridRange() {
  const [y, m] = state.month.split('-').map(Number);
  const days = monthGrid(y, m);
  return { days, first: days[0], last: days[days.length - 1] };
}

const inRange = (occ, first, last) => occ.date >= first && occ.date <= last;
const overlapsRange = (item, first, last) => item.date <= last && (item.endDate ?? item.date) >= first;

// 검색 기간보다 먼저 시작한 공고도 있어서, 펼친 날짜를 검색 기간(오늘 이후)으로 자른다
function openingOccurrences() {
  const { items, range } = state.openings;
  return range ? items.flatMap(expand).filter((o) => inRange(o, range.from, range.to)) : [];
}

const EXTERNAL_ITEM = { source: 'ext', id: 'ext', kind: 'external', statusKind: 'confirmed' };

const externalOcc = (b) => ({
  item: { ...EXTERNAL_ITEM, title: b.title || '바쁨', busy: b.busy !== false, allDay: b.allDay },
  date: b.date,
  startTime: b.allDay ? null : b.startTime,
  endTime: b.allDay ? null : b.endTime,
});

// 빈 시간 필터에 쓰는 바쁜 시간
function externalBusy() {
  return state.external.blocks.map((b) => ({ ...externalOcc(b), startTime: b.startTime, endTime: b.endTime }));
}

// 달력에 보여줄 불러온 일정 전부 (종일·한가함 포함)
function externalShown() {
  return (state.external.all ?? []).map(externalOcc);
}

// 내 신청은 고른 상태(예: 승인만)만 바쁜 시간으로 보고, '신청함' 표시는 상태와 관계없이 붙인다
function freeTimeOptions() {
  const ft = state.settings.freeTime;
  const applied = allApplied().flatMap(expand);
  const busy = [...applied.filter((o) => ft.busyStatuses.includes(o.item.statusKind)), ...externalBusy()];
  return { ...ft, bufferMin: Number(ft.bufferMin) || 0, applied, busy };
}

// ---------- 외부 캘린더 (ICS) ----------

const toHttps = (url) => url.trim().replace(/^webcal:\/\//i, 'https://');

// Google의 '공개 주소'는 캘린더를 공개한 경우에만 열린다. 대부분 비공개라 '비공개 주소'를 넣어야 한다.
const isGooglePublicUrl = (url) => /calendar\.google\.com$/.test(new URL(url).hostname) && /\/public\/basic\.ics$/.test(new URL(url).pathname);

function calendarHttpError(url, status) {
  if (isGooglePublicUrl(url) && (status === 404 || status === 403)) {
    return "공개 주소라서 열리지 않습니다. 캘린더가 비공개이면 'iCal 형식의 비공개 주소'를 넣어야 합니다";
  }
  if (status === 404) return '주소를 찾을 수 없습니다(404). 주소를 다시 복사해 주세요';
  if (status === 401 || status === 403) return '접근이 거부되었습니다. 비공개 주소가 바뀌었거나 관리자가 막았을 수 있습니다';
  return `캘린더 서버 응답 오류(${status})`;
}

// manifest의 optional_host_permissions와 같은 목록. 그 밖의 캘린더는 .ics 파일로 불러온다
const CALENDAR_HOSTS = [/^calendar\.google\.com$/, /(^|\.)icloud\.com$/, /^outlook\.(live|office365|office)\.com$/];

// 캘린더마다 따로 계산해서, 불러왔는데 바쁜 시간이 0개면 왜 그런지 보여줄 수 있게 한다
function recomputeExternal() {
  const opts = { from: today, to: addDays(today, 400), includeAllDay: state.settings.freeTime.allDayBusy, showAll: true };
  const sources = [...Object.values(state.external.byUrl), state.external.file].filter((c) => c?.events);
  state.external.all = []; // 달력에 보여줄 불러온 일정 전부
  state.external.blocks = []; // 그중 빈 시간 필터에 쓰는 바쁜 시간
  state.external.unsupported = 0;
  for (const c of sources) {
    const r = busyBlocks(c.events, opts);
    const busy = r.blocks.filter((b) => b.busy);
    c.busy = busy.length;
    c.skipped = r.skipped;
    state.external.all.push(...r.blocks);
    state.external.blocks.push(...busy);
    state.external.unsupported += r.unsupported;
  }
}

// '일정 120개 · 앞으로 바쁜 시간 0개 (종일 30, 한가함 2, 지난 일정 88)'
function calendarSummary(c) {
  const s = c.skipped ?? {};
  const why = [
    s.allDay && `종일 ${s.allDay}개`,
    s.free && `'한가함' ${s.free}개`,
    s.outside && `지난·먼 일정 ${s.outside}개`,
    s.cancelled && `취소 ${s.cancelled}개`,
  ].filter(Boolean);
  return `일정 ${c.events.length}개 · 앞으로 바쁜 시간 ${c.busy ?? 0}개${c.busy ? '' : why.length ? ` (빠진 일정: ${why.join(', ')})` : ''}`;
}

async function fetchCalendar(url) {
  const entry = { status: 'loading' };
  state.external.byUrl[url] = entry;
  renderCalendars();
  try {
    const res = await fetch(url, { credentials: 'omit', cache: 'no-store' });
    if (!res.ok) throw new Error(calendarHttpError(url, res.status));
    const text = await res.text();
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error('ICS 형식이 아닙니다');
    Object.assign(entry, { status: 'ok', events: parseIcs(text) });
  } catch (e) {
    Object.assign(entry, { status: 'error', error: /Failed to fetch|NetworkError/.test(e.message) ? '연결하지 못했습니다 (주소나 권한을 확인하세요)' : e.message });
  }
  recomputeExternal();
  renderCalendars();
  render();
}

function loadCalendars() {
  if (DEMO) {
    state.external.file = { name: '내 캘린더(예시).ics', importedAt: today, events: parseIcs(demoCalendarIcs(today)) };
    recomputeExternal();
    renderCalendars();
    render();
    return;
  }
  for (const { url } of state.settings.calendars) fetchCalendar(url);
}

// 권한 요청은 사용자 클릭 직후(다른 await 전)에 해야 한다
function addCalendar(raw) {
  let url;
  try {
    url = new URL(toHttps(raw));
    if (url.protocol !== 'https:') throw new Error();
  } catch {
    $('#calStatus').textContent = 'https:// 또는 webcal:// 로 시작하는 주소를 넣어 주세요.';
    return;
  }
  if (isGooglePublicUrl(url.href)) {
    $('#calStatus').textContent = "Google '공개 주소'입니다. 캘린더가 비공개이면 열리지 않으니, Google 캘린더 설정 화면 아래쪽의 'iCal 형식의 비공개 주소'(…/private-…/basic.ics)를 넣어 주세요.";
    return;
  }
  if (!CALENDAR_HOSTS.some((re) => re.test(url.hostname))) {
    $('#calStatus').textContent = `${url.hostname} 주소는 지원하지 않습니다. Google·iCloud·Outlook 주소만 등록할 수 있고, 다른 캘린더는 .ics 파일로 내보내서 불러와 주세요.`;
    return;
  }
  const request = globalThis.chrome?.permissions
    ? chrome.permissions.request({ origins: [`${url.origin}/*`] })
    : Promise.resolve(true);
  request.catch((e) => {
    $('#calStatus').textContent = `권한을 요청하지 못했습니다: ${e.message}. 확장을 새로고침한 뒤 다시 시도해 주세요.`;
    return null;
  }).then((granted) => {
    if (granted === null) return;
    if (!granted) {
      $('#calStatus').textContent = `${url.host}에 접근하는 권한을 허용해야 불러올 수 있습니다.`;
      return;
    }
    if (!state.settings.calendars.some((c) => c.url === url.href)) state.settings.calendars.push({ url: url.href });
    saveSettings();
    $('#calUrl').value = '';
    fetchCalendar(url.href);
  });
}

function removeCalendar(url) {
  state.settings.calendars = state.settings.calendars.filter((c) => c.url !== url);
  delete state.external.byUrl[url];
  saveSettings();
  recomputeExternal();
  renderCalendars();
  render();
}

async function importCalendarFile(file) {
  const events = parseIcs(await file.text());
  state.external.file = { name: file.name, importedAt: today, events };
  // 지금 화면에서는 제목을 보여주되, 저장할 때는 제목을 빼고 시간 계산에 필요한 값만 남긴다
  const stored = { ...state.external.file, events: events.map(({ title, ...rest }) => rest) };
  await storage?.set({ calendarFile: stored }).catch(() => {});
  recomputeExternal();
  renderCalendars();
  render();
}

async function clearCalendarFile() {
  state.external.file = null;
  await storage?.remove('calendarFile').catch(() => {});
  recomputeExternal();
  renderCalendars();
  render();
}

// 주소는 비밀 링크라 앞뒤만 보여준다
function maskUrl(url) {
  const u = new URL(url);
  const last = u.pathname.split('/').filter(Boolean).pop() ?? '';
  return `${u.host}/…/${last.length > 16 ? `${last.slice(0, 6)}…` : last}`;
}

function renderCalendars() {
  $('#calList').replaceChildren(
    ...state.settings.calendars.map(({ url }) => {
      const c = state.external.byUrl[url];
      const status = !c ? '' : c.status === 'loading' ? '불러오는 중…' : c.status === 'error' ? `오류: ${c.error}` : calendarSummary(c);
      return h('li', {},
        h('span', { class: `name${c?.status === 'error' ? ' warn' : ''}`, title: status }, h('b', {}, maskUrl(url)), h('br'), status),
        h('button', { type: 'button', class: 'btn small', onclick: () => removeCalendar(url) }, '삭제'));
    }),
  );
  const f = state.external.file;
  $('#calFileInfo').replaceChildren(
    f ? `${f.name} (${f.importedAt}) · ${calendarSummary(f)}` : '',
    f ? h('button', { type: 'button', class: 'btn small', onclick: clearCalendarFile }, '지우기') : '',
  );
  const n = state.external.blocks.length;
  const notes = [];
  if (state.external.all?.length) notes.push(`불러온 일정은 달력에 회색으로 보입니다. 그중 바쁜 시간 ${n}개를 빈 시간 필터에 쓰고, 점선 칸(종일·한가함)은 쓰지 않습니다.`);
  const all = [...Object.values(state.external.byUrl), f].filter((c) => c?.events);
  if (!n && all.some((c) => c.skipped?.allDay) && !state.settings.freeTime.allDayBusy) {
    notes.push("종일 일정을 반영하려면 '종일 일정도 바쁜 시간으로 보기'를 켜세요.");
  }
  if (state.external.unsupported) notes.push(`반복 규칙이 복잡한 일정 ${state.external.unsupported}개는 첫 회만 반영했습니다.`);
  $('#calStatus').textContent = notes.join(' ');
  if (n || state.settings.calendars.length || f) $('#extBox').open = true;
}

function computeView() {
  const { days, first, last } = gridRange();
  if (state.mode === 'applied') {
    const items = filteredApplied();
    const mine = state.settings.showExternalInApplied ? externalShown().filter((o) => inRange(o, first, last)) : [];
    return {
      days,
      chips: [
        ...items.flatMap(expand).filter((o) => inRange(o, first, last)).map((occ) => ({ occ, variant: 'applied' })),
        ...mine.map((occ) => ({ occ, variant: 'busy' })),
      ],
      long: items.filter((it) => isLongRange(it) && overlapsRange(it, first, last)).map((item) => ({ item, variant: 'applied' })),
    };
  }
  const ft = state.settings.freeTime;
  const opts = freeTimeOptions();
  const { busy } = opts;
  const hidden = { applied: 0, conflict: 0, outside: 0, untimed: 0 };
  const chips = [];
  for (const occ of openingOccurrences()) {
    if (!inRange(occ, first, last)) continue;
    const { tags, hidden: isHidden } = classifyOpening(occ, opts);
    if (isHidden) {
      const reason = opts.hideApplied && tags.includes('applied') ? 'applied' : ['conflict', 'outside', 'untimed'].find((t) => tags.includes(t));
      if (reason) hidden[reason]++;
      continue;
    }
    chips.push({ occ: { ...occ, tags }, variant: 'opening' });
  }
  // 내 신청(바쁜 시간으로 고른 상태)과 불러온 내 캘린더 일정 전부를 회색으로 깐다
  for (const occ of [...busy.filter((o) => o.item.source !== 'ext'), ...externalShown()]) {
    if (occ.item.statusKind !== 'cancelled' && inRange(occ, first, last)) chips.push({ occ, variant: 'busy' });
  }
  const long = ft.showUntimed
    ? state.openings.items.filter((it) => isLongRange(it) && overlapsRange(it, first, last)).map((item) => ({ item, variant: 'opening' }))
    : [];
  if (!ft.showUntimed) hidden.untimed += state.openings.items.filter((it) => isLongRange(it) && overlapsRange(it, first, last)).length;
  return { days, chips, long, hidden };
}

// ---------- 그리기 ----------

let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

function render() {
  const view = computeView();
  renderSessions();
  renderLegend();
  renderNotice(view);
  renderCalendar(view);
  renderLongList(view);
  renderDetail(view);
  if (state.mode === 'applied') renderHours();
}

function monthBounds(month) {
  const first = `${month}-01`;
  return { from: first, to: addDays(addMonths(first, 1), -1) };
}

function renderHours() {
  const from = $('#hoursFrom').value;
  const to = $('#hoursTo').value;
  const box = $('#hoursResult');
  if (!from || !to || from > to) {
    box.replaceChildren(h('span', { class: 'row' }, '기간을 다시 확인해 주세요.'));
    return;
  }
  const loading = Object.values(state.applied).some((a) => a.status === 'loading')
    || allApplied().some((it) => it.detailPending);
  const s = summarizeHours(filteredApplied(), from, to);
  const parts = (pairs) => pairs.filter(([, m]) => m > 0).map(([k, m]) => `${k} ${formatMinutes(m)}`).join(' · ');
  fill(box,
    h('div', { class: 'total' }, s.minutes ? formatMinutes(s.minutes) : '0시간', h('small', {}, `${s.count}건`)),
    s.minutes > 0 && h('div', { class: 'row' },
      s.byStatus.confirmed > 0 && h('span', { class: 'ok' }, `승인 ${formatMinutes(s.byStatus.confirmed)}`),
      s.byStatus.confirmed > 0 && (s.byStatus.pending || s.byStatus.other) ? ' · ' : '',
      parts([['접수·대기', s.byStatus.pending], ['기타', s.byStatus.other]])),
    s.minutes > 0 && h('div', { class: 'row' }, parts([['1365', s.bySource[1365]], ['VMS', s.bySource.vms]])),
    s.estimated > 0 && h('div', { class: 'row' }, `추정 시간이 들어간 일정 ${s.estimated}건`),
    s.unknown > 0 && h('div', { class: 'row' }, `시작·종료 시각이 없어 합계에서 뺀 일정 ${s.unknown}건`),
    s.unknownItems.map((it) =>
      h('button', { type: 'button', class: 'chip applied untimed s' + it.source + ' st-' + it.statusKind, onclick: () => select({ type: 'item', occ: { item: it, date: it.date, startTime: null, endTime: null }, variant: 'applied' }) },
        h('span', { class: 't' }, `${it.date.slice(5).replace('-', '.')}~${it.endDate.slice(5).replace('-', '.')}`), it.title)),
    loading && h('div', { class: 'row' }, '불러오는 중이라 값이 바뀔 수 있습니다…'),
  );
}

function setHoursRange(kind) {
  const range =
    kind === 'month' ? monthBounds(state.month)
      : kind === 'upcoming' ? { from: today, to: addDays(today, 365) }
        : { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
  $('#hoursFrom').value = range.from;
  $('#hoursTo').value = range.to;
  renderHours();
}

function renderSessions() {
  $('#sessions').replaceChildren(
    DEMO ? h('span', { class: 'session' }, '예시 데이터') : '',
    ...Object.entries(state.applied).map(([key, a]) => {
      const label = LABEL[key];
      if (a.status === 'ok') return h('span', { class: 'session ok' }, h('span', { class: 'dot' }), `${label} 신청 ${a.items.length}건`);
      if (a.status === 'loading') return h('span', { class: 'session' }, h('span', { class: 'dot' }), `${label} 불러오는 중…`);
      if (a.status === 'needLogin')
        return h('span', { class: 'session warn' }, h('span', { class: 'dot' }), `${label} 로그인 필요 · `,
          h('a', { href: SOURCES[key].LOGIN_URL, target: '_blank', rel: 'noopener' }, '로그인'));
      if (a.status === 'error') return h('span', { class: 'session warn', title: a.error }, h('span', { class: 'dot' }), `${label} 조회 실패`);
      return h('span', { class: 'session' }, h('span', { class: 'dot' }), label);
    }),
  );
}

function renderLegend() {
  const item = (color, text, style = '') => h('span', {}, h('i', { style: `background:${color};${style}` }), text);
  const base = [item('var(--c1365)', '1365'), item('var(--cvms)', 'VMS')];
  fill($('#legend'),
    ...(state.mode === 'applied'
      ? [
        item('var(--ok-soft)', '승인·참석가능', 'border:1px solid var(--ok)'),
        item('var(--pending-soft)', '접수·대기', 'border:1px solid var(--line)'),
        h('span', {}, '왼쪽 띠:'), ...base,
        state.settings.showExternalInApplied && state.external.blocks.length > 0 && item('var(--busy)', '내 캘린더'),
        h('span', {}, '점선: 시간 미정'), h('span', {}, '?: 추정 시간'),
      ]
      : [...base, item('var(--busy)', '내 일정(신청·캘린더)'), h('span', {}, '✓ 신청함'), item('transparent', '겹침', 'border:2px solid var(--danger)'), h('span', {}, '점선: 시간 미정')]),
  );
}

function showNotice(text) {
  const el = $('#notice');
  el.textContent = text;
  el.hidden = !text;
}

function renderNotice(view) {
  const parts = [];
  if (state.mode === 'applied') {
    const need = Object.entries(state.applied).filter(([, a]) => a.status === 'needLogin').map(([k]) => LABEL[k]);
    if (need.length) parts.push(`${need.join(', ')}에 로그인한 뒤 '다시 불러오기'를 눌러 주세요. 1365는 30분 동안 아무것도 하지 않으면 로그아웃됩니다.`);
    const errors = Object.entries(state.applied).filter(([, a]) => a.status === 'error').map(([k, a]) => `${LABEL[k]}: ${a.error}`);
    parts.push(...errors);
  } else {
    const { status, summary } = state.openings;
    if (status === 'idle') parts.push('왼쪽에서 조건을 고르고 검색하세요. 내 신청 일정과 겹치는 시간을 비교하려면 신청내역이 먼저 불러와져 있어야 합니다.');
    for (const [key, s] of Object.entries(summary)) {
      if (s.skipped) parts.push(s.skipped);
      else if (s.error) parts.push(`${LABEL[key]} 검색 실패: ${s.error}`);
      else if (s.loading) parts.push(`${LABEL[key]} 불러오는 중… ${s.loaded}/${s.total || '?'}건`);
      else parts.push(`${LABEL[key]} ${s.loaded}/${s.total}건${s.truncated ? " (앞쪽 일부만 가져옴, '가져올 양'에서 늘릴 수 있음)" : ''}`);
    }
    const h0 = view.hidden;
    const hiddenTotal = h0 ? h0.applied + h0.conflict + h0.outside + h0.untimed : 0;
    if (hiddenTotal) {
      const why = [h0.applied && `이미 신청 ${h0.applied}`, h0.conflict && `겹침 ${h0.conflict}`, h0.outside && `시간대 밖 ${h0.outside}`, h0.untimed && `시간 미정 ${h0.untimed}`].filter(Boolean);
      parts.push(`이 달에서 숨긴 일정 ${hiddenTotal}건 (${why.join(', ')})`);
    }
    const pending = state.openings.items.filter((it) => it.detailPending).length;
    if (pending) parts.push(`요일·시간 확인 중 ${pending}건`);
  }
  showNotice(parts.join(' · '));
}

function sortKey({ occ }) {
  return `${occ.startTime ?? '99:99'}${occ.item.title}`;
}

function chip({ occ, variant }) {
  const it = occ.item;
  const cls = ['chip', `s${it.source}`, variant, `st-${it.statusKind}`];
  if (it.statusKind === 'cancelled') cls.push('cancelled');
  if (!occ.startTime) cls.push('untimed');
  if (it.timeGuessed) cls.push('guessed');
  if (it.source === 'ext' && !it.busy) cls.push('free');
  if (occ.tags?.includes('conflict')) cls.push('conflict');
  if (occ.tags?.includes('applied')) cls.push('mine');
  const time = occ.startTime ? `${occ.startTime}${it.timeGuessed ? '?' : ''}` : '';
  const hours = itemMinutes(it);
  const tip = [
    it.title,
    occ.startTime ? `${occ.startTime}~${occ.endTime}${it.timeGuessed ? ' (추정)' : ''}` : '시간 미정',
    hours && `${formatMinutes(hours.minutes)}${hours.estimated ? ' (추정)' : ''}`,
    it.status,
    LABEL[it.source],
  ].filter(Boolean).join(' · ');
  return h('button', { type: 'button', class: cls.join(' '), title: tip, onclick: () => select({ type: 'item', occ, variant }) },
    time && h('span', { class: 't' }, time), it.title);
}

function renderCalendar(view) {
  const [, month] = state.month.split('-').map(Number);
  $('#monthTitle').textContent = `${state.month.slice(0, 4)}년 ${month}월`;
  const byDate = Map.groupBy(view.chips, (c) => c.occ.date);
  const head = ['일', '월', '화', '수', '목', '금', '토'].map((d, i) =>
    h('div', { class: `dow${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}`, role: 'columnheader' }, d));
  const cells = view.days.map((date, i) => {
    const list = (byDate.get(date) ?? []).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    const cls = ['day'];
    if (date.slice(0, 7) !== state.month) cls.push('other');
    if (date === today) cls.push('today');
    if (i % 7 === 0) cls.push('sun');
    if (i % 7 === 6) cls.push('sat');
    const shown = list.length > MAX_CHIPS ? list.slice(0, MAX_CHIPS - 1) : list;
    return h('div', { class: cls.join(' '), role: 'gridcell' },
      h('span', { class: 'num' }, Number(date.slice(8))),
      shown.map(chip),
      list.length > shown.length && h('button', { type: 'button', class: 'more', onclick: () => select({ type: 'day', date }) }, `+${list.length - shown.length}건 더 보기`));
  });
  $('#calendar').replaceChildren(...head, ...cells);
}

function renderLongList(view) {
  const box = $('#longList');
  box.hidden = view.long.length === 0;
  if (box.hidden) return;
  $('#longTitle').textContent = `기간형 · 시간 미정 일정 ${view.long.length}건 (7일 넘게 이어지는 공고는 날마다 표시하지 않습니다)`;
  $('#longItems').replaceChildren(
    ...view.long
      .sort((a, b) => a.item.date.localeCompare(b.item.date))
      .map(({ item, variant }) => {
        const occ = { item, date: item.date, startTime: null, endTime: null };
        const el = chip({ occ, variant });
        el.prepend(h('span', { class: 't' }, `${item.date.slice(5).replace('-', '.')}~${item.endDate.slice(5).replace('-', '.')}`));
        return h('li', {}, el);
      }),
  );
}

function select(sel) {
  state.selected = sel;
  if (sel.type === 'item') {
    const item = sel.occ.item;
    if (!item.detailLoaded && !item.detailFailed) {
      getDetail(item).then((d) => {
        applyDetail(item, d);
        scheduleRender();
      });
    }
  }
  render();
}

function fmtDate(date) {
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일 (${weekdayName(date)})`;
}

function renderDetail(view) {
  const panel = $('#detail');
  const sel = state.selected;
  panel.hidden = !sel;
  if (!sel) return;
  const body = $('#detailBody');
  if (sel.type === 'day') {
    const list = view.chips.filter((c) => c.occ.date === sel.date).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    body.replaceChildren(h('h3', {}, fmtDate(sel.date)), h('ul', { class: 'day-list' }, list.map((c) => h('li', {}, chip(c)))));
    return;
  }
  const { occ } = sel;
  const it = occ.item;
  const rows = [];
  const add = (k, v) => v && rows.push(h('dt', {}, k), h('dd', {}, v));
  add('날짜', isLongRange(it) ? `${fmtDate(it.date)} ~ ${fmtDate(it.endDate)}` : fmtDate(occ.date));
  add('시간', occ.startTime ? `${occ.startTime} ~ ${occ.endTime}${it.timeGuessed ? ' (공고 본문에서 추정)' : ''}` : '정해진 시간 없음');
  const hours = itemMinutes(it);
  add('봉사시간', hours
    ? `${formatMinutes(hours.minutes)}${hours.estimated ? ' (추정)' : ''}${it.creditCapHours ? ` · 최대 ${it.creditCapHours}시간 인정` : ''}`
    : it.creditHours);
  if (it.endDate > it.date && !isLongRange(it)) add('봉사기간', `${it.date} ~ ${it.endDate}`);
  add('활동요일', it.weekdaysText || (it.kind === 'opening' && it.source === '1365' && it.endDate > it.date ? (it.detailPending ? '확인 중…' : '확인 못 함 (모든 날짜에 표시)') : ''));
  add('활동주기', it.cycle);
  const loading = !it.detailLoaded && !it.detailFailed && it.source !== 'ext';
  add('장소', it.place || (loading ? '불러오는 중…' : ''));
  add('기관', it.org);
  const c = it.contact ?? {};
  add('담당자', c.name);
  add('연락처', (c.phone || c.email) && h('span', {},
    c.phone && h('a', { href: `tel:${c.phone.replace(/[^\d+]/g, '')}` }, c.phone),
    c.phone && c.email && ' · ',
    c.email && h('a', { href: `mailto:${c.email}` }, c.email)));
  add('기관 주소', c.address);
  if (it.source === 'ext') {
    add('빈 시간 필터', it.busy ? '바쁜 시간으로 반영'
      : it.allDay ? "반영 안 함 (종일 일정 · '종일 일정도 바쁜 시간으로 보기'로 켤 수 있음)" : "반영 안 함 ('한가함'으로 표시된 일정)");
  }
  add('지역', it.area);
  add('모집기간', it.recruitPeriod);
  add('인정시간', it.creditHours);
  add('신청/모집', it.count);
  add('분야', it.field || it.tags?.join(', '));
  add('신청일', it.appliedOn);
  const badges = [
    h('span', { class: `badge s${it.source}` }, LABEL[it.source]),
    it.status && h('span', { class: 'badge' }, it.status),
    occ.tags?.includes('applied') && h('span', { class: 'badge' }, '신청함'),
    occ.tags?.includes('conflict') && h('span', { class: 'badge warn' }, '내 일정과 겹침'),
    sel.variant === 'busy' && it.source !== 'ext' && h('span', { class: 'badge' }, '내 신청 일정'),
  ];
  fill(body,
    h('div', {}, badges),
    h('h3', {}, it.title),
    h('dl', {}, rows),
    it.source === '1365' && it.kind === 'opening' && applyDatesBox(it),
    it.content && h('details', { class: 'content', open: true },
      h('summary', {}, '활동 내용'),
      h('div', { class: 'content-text' }, it.content)),
    (it.contact?.phone || it.contact?.email) && it.source !== 'ext' && h('button', {
      type: 'button',
      class: 'btn small save-contact',
      onclick: () => exportContacts([{ ...it, statusKind: it.statusKind === 'cancelled' ? 'pending' : it.statusKind }], `${it.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)}.vcf`),
    }, '연락처 저장 (.vcf)'),
    it.url && h('a', { class: 'link', href: it.url, target: '_blank', rel: 'noopener' },
      it.kind === 'opening' ? `${LABEL[it.source]}에서 보고 신청하기 ↗` : `${LABEL[it.source]}에서 보기 ↗`),
  );
}

// ---------- 1365 신청 가능 날짜 (사용자가 누를 때만 조회) ----------

function demoApplyDates(item) {
  const days = expand({ ...item, availableDates: null }).map((o, i) => ({
    date: o.date, open: i % 3 !== 1, label: i % 3 !== 1 ? '모집중' : '모집완료', count: i % 3 !== 1 ? '0/2명' : '2/2명', hours: [],
  }));
  return { needLogin: false, days, months: [...new Set(days.map((d) => d.date.slice(0, 7)))] };
}

const shortDate = (date) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}(${weekdayName(date)})`;

async function loadApplyDates(item) {
  item.applyDates = { status: 'loading' };
  render();
  try {
    const res = DEMO
      ? demoApplyDates(item)
      : await s1365.fetchApplyDates(http, item.id);
    if (res.needLogin) {
      item.applyDates = { status: 'needLogin' };
    } else {
      item.applyDates = { status: 'ok', days: res.days };
      // 확인한 달은 신청 가능한 날짜만 남기고, 확인하지 못한 달(maxMonths 넘김)은 활동요일 기준으로 그대로 둔다
      const months = new Set(res.months);
      const unchecked = expand({ ...item, availableDates: null }).map((o) => o.date).filter((d) => !months.has(d.slice(0, 7)));
      item.availableDates = new Set([...res.days.filter((d) => d.open).map((d) => d.date), ...unchecked]);
    }
  } catch (e) {
    item.applyDates = { status: 'error', error: e.message };
  }
  render();
}

function applyDatesBox(it) {
  const a = it.applyDates;
  if (!a) {
    return h('div', { class: 'apply-dates' },
      h('button', { type: 'button', class: 'btn small', onclick: () => loadApplyDates(it) }, '신청 가능 날짜 불러오기'),
      h('p', { class: 'hint' }, '1365 신청서 화면을 열어 날짜별 모집 상태만 읽습니다. 신청은 하지 않습니다. 1365에 로그인되어 있어야 합니다.'));
  }
  if (a.status === 'loading') return h('div', { class: 'apply-dates hint' }, '신청 가능 날짜를 확인하는 중…');
  if (a.status === 'needLogin') {
    return h('div', { class: 'apply-dates' },
      h('p', { class: 'hint' }, '1365에 로그인해야 확인할 수 있습니다. '),
      h('a', { href: s1365.LOGIN_URL, target: '_blank', rel: 'noopener' }, '1365 로그인'),
      ' ',
      h('button', { type: 'button', class: 'btn small', onclick: () => loadApplyDates(it) }, '다시 확인'));
  }
  if (a.status === 'error') {
    return h('div', { class: 'apply-dates' }, h('p', { class: 'hint' }, `확인하지 못했습니다: ${a.error}`),
      h('button', { type: 'button', class: 'btn small', onclick: () => loadApplyDates(it) }, '다시 확인'));
  }
  const open = a.days.filter((d) => d.open);
  const closed = a.days.length - open.length;
  return h('div', { class: 'apply-dates' },
    h('div', {},
      h('strong', {}, open.length ? `신청 가능 ${open.length}일` : '신청 가능한 날짜가 없습니다'),
      closed > 0 && h('span', { class: 'hint' }, ` · 마감 ${closed}일`)),
    open.length > 0 && h('ul', { class: 'date-list' }, open.map((d) => h('li', {}, `${shortDate(d.date)} ${d.count}`))),
    h('p', { class: 'hint' }, '달력에는 신청 가능한 날짜만 남겼습니다.'));
}

// ---------- ICS ----------

function download(filename, content, type = 'text/calendar') {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  h('a', { href: url, download: filename }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function describe(it, extra = []) {
  const hours = itemMinutes(it);
  return [
    `${LABEL[it.source]} · ${it.status || STATUS_LABEL[it.statusKind] || ''}`,
    hours && `봉사시간 ${formatMinutes(hours.minutes)}${hours.estimated ? ' (추정)' : ''}`,
    it.timeGuessed && '시간은 공고 본문에서 추정한 값입니다.',
    it.org && `기관: ${it.org}`,
    it.place && `장소: ${it.place}`,
    it.contact?.name && `담당자: ${it.contact.name}`,
    (it.contact?.phone || it.contact?.email) && `연락처: ${[it.contact.phone, it.contact.email].filter(Boolean).join(' · ')}`,
    ...extra,
    it.url,
    it.content && `\n[활동 내용]\n${it.content.length > 1500 ? `${it.content.slice(0, 1500)}…` : it.content}`,
  ].filter(Boolean).join('\n');
}

function exportContacts(items, filename) {
  const { contacts, missing, pending } = appliedContacts(items);
  const notes = [];
  if (pending) notes.push(`상세를 아직 불러오는 중인 ${pending}곳`);
  if (missing) notes.push(`연락처가 없는 ${missing}곳`);
  if (contacts.length === 0) {
    showNotice(`내보낼 연락처가 없습니다.${notes.length ? ` (${notes.join(', ')})` : ''}`);
    return;
  }
  download(filename, buildVcard(contacts), 'text/vcard');
  showNotice(`연락처 ${contacts.length}곳을 저장했습니다.${notes.length ? ` ${notes.join(', ')}은 뺐습니다.` : ''}`);
}

function exportApplied() {
  const items = filteredApplied().filter((it) => state.settings.includeLong || !isLongRange(it));
  if (items.length === 0) {
    showNotice('내보낼 신청 일정이 없습니다. 필터와 로그인 상태를 확인해 주세요.');
    return;
  }
  const events = items.map((it) => ({
    uid: it.uid,
    title: `[${LABEL[it.source]}] ${it.title}`,
    date: it.date,
    endDate: it.endDate,
    startTime: it.startTime,
    endTime: it.endTime,
    location: it.place,
    description: describe(it),
    url: it.url,
    statusKind: it.statusKind,
  }));
  download(`봉사-신청일정-${today}.ics`, buildIcs(events, { calendarName: '봉사 신청 일정' }));
}

function exportOpenings() {
  // 보이는 달만이 아니라 검색 결과 전체에서 지금 필터를 통과한 일정을 내보낸다
  const opts = freeTimeOptions();
  const visible = openingOccurrences().filter((occ) => !classifyOpening(occ, opts).hidden);
  if (visible.length === 0) {
    showNotice('내보낼 모집 일정이 없습니다. 먼저 검색해 주세요.');
    return;
  }
  const events = visible.map((occ) => ({
    uid: `${occ.item.uid}-${occ.date.replace(/-/g, '')}`,
    title: `[모집·${LABEL[occ.item.source]}] ${occ.item.title}`,
    date: occ.date,
    startTime: occ.startTime,
    endTime: occ.endTime,
    location: occ.item.place,
    description: describe(occ.item),
    url: occ.item.url,
  }));
  download(`봉사-모집일정-${today}.ics`, buildIcs(events, { calendarName: '봉사 모집 일정' }));
}

// ---------- 화면 초기화 ----------

// 30분 단위 '00:00' ~ '24:00'
const HALF_HOURS = Array.from({ length: 49 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

function timeSelect(value, label, onPick) {
  const select = h('select', { 'aria-label': label, onchange: (e) => onPick(e.target.value) },
    HALF_HOURS.map((t) => h('option', { value: t }, t)));
  select.value = value;
  return select;
}

function renderAvailability() {
  const box = $('#availability');
  const days = state.settings.freeTime.availability.days;
  box.hidden = !state.settings.freeTime.useAvailability;
  box.replaceChildren(
    ...WEEK_ORDER.flatMap((d) => {
      const win = days[d];
      const name = '일월화수목금토'[d];
      const update = () => {
        saveSettings();
        render();
      };
      return [
        h('input', { type: 'checkbox', checked: win.on, 'aria-label': `${name}요일 사용`, onchange: (e) => { win.on = e.target.checked; update(); } }),
        h('span', {}, name),
        timeSelect(win.start, `${name}요일 시작`, (v) => { win.start = v; update(); }),
        h('span', { class: 'tilde' }, '~'),
        timeSelect(win.end, `${name}요일 끝`, (v) => { win.end = v; update(); }),
      ];
    }),
  );
}

function setMode(mode) {
  state.mode = mode;
  state.selected = null;
  for (const tab of $$('.tabs button')) tab.setAttribute('aria-selected', String(tab.dataset.mode === mode));
  for (const panel of $$('[data-panel]')) panel.hidden = panel.dataset.panel !== mode;
  render();
}

function fillForm() {
  const s = state.settings;
  for (const el of $$('input[name=appliedSource]')) el.checked = s.appliedSources.includes(el.value);
  for (const el of $$('input[name=appliedStatus]')) el.checked = s.appliedStatuses.includes(el.value);
  $('#includeLong').checked = s.includeLong;
  $('#showExternalInApplied').checked = s.showExternalInApplied;
  const month = monthBounds(state.month);
  $('#hoursFrom').value = month.from;
  $('#hoursTo').value = month.to;

  $('#province').append(...PROVINCES.map((p) => h('option', { value: p.name }, p.name)));
  $('#field1365').append(...s1365.FIELDS.map(([v, t]) => h('option', { value: v }, t)));
  $('#actTypeVms').append(...vms.ACT_TYPES.map(([v, t]) => h('option', { value: v }, t)));
  const q = s.search;
  for (const el of $$('input[name=searchSource]')) el.checked = q.sources.includes(el.value);
  $('#province').value = q.province;
  $('#keyword').value = q.keyword;
  $('#openOnly').checked = q.openOnly;
  for (const id of ['field1365', 'week', 'online1365', 'actTypeVms', 'faceVms', 'termVms', 'maxPages1365', 'maxPagesVms']) $(`#${id}`).value = q[id];
  $('#adult').checked = q.adult;
  $('#youth').checked = q.youth;
  $('#from').value = today;
  $('#to').value = addDays(today, 30);

  const ft = s.freeTime;
  $('#hideConflicts').checked = ft.hideConflicts;
  $('#bufferMin').value = String(ft.bufferMin);
  $('#useAvailability').checked = ft.useAvailability;
  $('#showUntimed').checked = ft.showUntimed;
  $('#allDayBusy').checked = ft.allDayBusy;
  $('#hideApplied').checked = ft.hideApplied;
  for (const el of $$('input[name=busyStatus]')) el.checked = ft.busyStatuses.includes(el.value);
  renderAvailability();
}

function bind() {
  for (const tab of $$('.tabs button')) tab.addEventListener('click', () => setMode(tab.dataset.mode));
  $('#prevMonth').addEventListener('click', () => { state.month = addMonths(`${state.month}-01`, -1).slice(0, 7); render(); });
  $('#nextMonth').addEventListener('click', () => { state.month = addMonths(`${state.month}-01`, 1).slice(0, 7); render(); });
  $('#todayBtn').addEventListener('click', () => { state.month = today.slice(0, 7); render(); });
  $('#closeDetail').addEventListener('click', () => { state.selected = null; render(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.selected) { state.selected = null; render(); }
  });

  $('#reloadApplied').addEventListener('click', loadApplied);
  const onAppliedFilter = () => {
    const s = state.settings;
    s.appliedSources = $$('input[name=appliedSource]:checked').map((i) => i.value);
    s.appliedStatuses = $$('input[name=appliedStatus]:checked').map((i) => i.value);
    s.includeLong = $('#includeLong').checked;
    s.showExternalInApplied = $('#showExternalInApplied').checked;
    saveSettings();
    render();
  };
  for (const el of $$('input[name=appliedSource], input[name=appliedStatus], #includeLong, #showExternalInApplied')) el.addEventListener('change', onAppliedFilter);
  $('#appliedKeyword').addEventListener('input', () => render());
  $('#exportApplied').addEventListener('click', exportApplied);
  $('#exportContacts').addEventListener('click', () => exportContacts(filteredApplied(), `봉사-연락처-${today}.vcf`));
  for (const id of ['hoursFrom', 'hoursTo']) $(`#${id}`).addEventListener('change', renderHours);
  for (const btn of $$('.quick [data-range]')) btn.addEventListener('click', () => setHoursRange(btn.dataset.range));

  // 검색 조건을 바꾸면 잠시 뒤 자동으로 다시 검색한다 (글자 입력은 조금 더 기다린다)
  let searchTimer;
  const scheduleSearch = (delay) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, delay);
  };
  $('#searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(searchTimer);
    runSearch();
  });
  $('#searchForm').addEventListener('change', (e) => {
    if (e.target.id !== 'keyword') scheduleSearch(600);
  });
  $('#keyword').addEventListener('input', () => scheduleSearch(800));
  $('#province').addEventListener('change', loadSubAreas);
  $('#exportOpenings').addEventListener('click', exportOpenings);

  const onFreeTime = () => {
    const ft = state.settings.freeTime;
    ft.hideConflicts = $('#hideConflicts').checked;
    ft.bufferMin = Number($('#bufferMin').value);
    ft.useAvailability = $('#useAvailability').checked;
    ft.showUntimed = $('#showUntimed').checked;
    ft.hideApplied = $('#hideApplied').checked;
    ft.busyStatuses = $$('input[name=busyStatus]:checked').map((i) => i.value);
    saveSettings();
    renderAvailability();
    render();
  };
  for (const el of $$('#hideConflicts, #bufferMin, #useAvailability, #showUntimed, #hideApplied, input[name=busyStatus]')) el.addEventListener('change', onFreeTime);

  $('#calForm').addEventListener('submit', (e) => {
    e.preventDefault();
    addCalendar($('#calUrl').value);
  });
  $('#calFile').addEventListener('change', (e) => {
    const [file] = e.target.files;
    if (file) importCalendarFile(file);
    e.target.value = '';
  });
  $('#allDayBusy').addEventListener('change', (e) => {
    state.settings.freeTime.allDayBusy = e.target.checked;
    saveSettings();
    recomputeExternal();
    renderCalendars();
    render();
  });
}

await loadSettings();
fillForm();
bind();
if (state.settings.search.province) loadSubAreas();
recomputeExternal();
renderCalendars();
render();
loadApplied();
loadCalendars();
