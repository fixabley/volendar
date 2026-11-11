// VMS 사회복지자원봉사인증관리 (www.vms.or.kr)
// 신청결과는 로그인 세션(Any-ID 통합인증)이 필요하고, 모집 검색과 상세는 공개 페이지다.
// VMS 공고에는 시간 칸이 없어서, 짧은 공고만 상세 본문에서 시간을 추정한다.
import { findTimeRange, parseDateRange } from '../lib/dates.js';
import { multilineText } from '../lib/text.js';

export const ORIGIN = 'https://www.vms.or.kr';
export const LOGIN_URL = `${ORIGIN}/login.do`;
const APPLIED_URL = `${ORIGIN}/mypage/recruit.do`;
const SEARCH_URL = `${ORIGIN}/partspace/recruit.do`;
const AREA_URL = `${ORIGIN}/partspace/selectAreaListAjax.do`;

export const detailUrl = (seq) => `${ORIGIN}/partspace/recruitView.do?seq=${seq}`;

export const ACT_TYPES = [
  ['01', '시설봉사'], ['02', '재가봉사'], ['03', '전문봉사'], ['04', '지역사회봉사'],
  ['05', '금·물품봉사'], ['06', '해외봉사'], ['07', '헌혈'], ['99', '기타봉사'],
];

const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const ownText = (el) =>
  [...(el?.childNodes ?? [])].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();

// 참석가능여부 → 공통 상태 분류
export function statusKindOf(status) {
  if (/불가|취소|반려|거절/.test(status)) return 'cancelled';
  if (/가능|승인|확정|완료/.test(status)) return 'confirmed';
  if (/대기|접수|신청/.test(status)) return 'pending';
  return 'unknown';
}

// 로그인 세션이 없으면 '로그인이 필요합니다' 알림 후 /login.do로 보내는 스크립트만 온다.
export function isAppliedPageLoggedOut(doc) {
  return !doc.querySelector('#searchForm, ul.card-list');
}

function parseCard(li) {
  const href = li.querySelector('a')?.getAttribute('href') ?? '';
  const seq = (href.match(/seq=(\d+)/) ?? [])[1];
  if (!seq) return null;
  const blocks = {};
  for (const box of li.querySelectorAll('.m-left')) blocks[text(box.querySelector('h5'))] = ownText(box);
  const range = parseDateRange(blocks['봉사기간']);
  if (!range) return null;
  const titleEl = li.querySelector('h3.title');
  const chips = [...li.querySelectorAll('.chips .chip')].map(text);
  const count = text(li.querySelector('.count')); // '<신청> / <모집>명'
  return {
    seq,
    title: ownText(titleEl) || text(titleEl),
    date: range.start,
    endDate: range.end,
    attendance: blocks['참석가능여부'] ?? '',
    area: chips[0] ?? '',
    tags: chips.slice(1),
    org: text(li.querySelector('.org')),
    count: count.replace(/\s+/g, ' '),
    recruitState: text(li.querySelector('.state')),
  };
}

export function parseAppliedPage(doc) {
  return [...doc.querySelectorAll('ul.card-list > li.card')]
    .map(parseCard)
    .filter(Boolean)
    .map((c) => ({
      uid: `vms-${c.seq}`,
      source: 'vms',
      kind: 'applied',
      id: c.seq,
      title: c.title,
      date: c.date,
      endDate: c.endDate,
      startTime: null,
      endTime: null,
      status: c.attendance || '신청',
      statusKind: statusKindOf(c.attendance || '대기'),
      area: c.area,
      tags: c.tags,
      recruitState: c.recruitState,
      url: detailUrl(c.seq),
    }));
}

export function parseSearchPage(doc) {
  const total = Number(text(doc.querySelector('.common-total .txt-navy')).replace(/,/g, '') || 0);
  const items = [...doc.querySelectorAll('ul.card-list > li.card')]
    .map(parseCard)
    .filter(Boolean)
    .map((c) => ({
      uid: `vms-open-${c.seq}`,
      source: 'vms',
      kind: 'opening',
      id: c.seq,
      title: c.title,
      date: c.date,
      endDate: c.endDate,
      startTime: null,
      endTime: null,
      status: c.recruitState,
      statusKind: 'open',
      area: c.area,
      tags: c.tags,
      org: c.org,
      count: c.count,
      url: detailUrl(c.seq),
    }));
  return { total, items };
}

export function parseDetailPage(doc) {
  const fields = {};
  for (const th of doc.querySelectorAll('table.eval-kv th')) fields[text(th)] = text(th.nextElementSibling);
  const body = text(doc.querySelector('.board-content'));
  // 담당자 : 이름 | 이메일 : … | 연락처 : …
  const contact = {};
  const keys = { 담당자: 'name', 이메일: 'email', 연락처: 'phone' };
  for (const li of doc.querySelectorAll('.contact-banner li')) {
    const key = keys[text(li.querySelector('b'))];
    if (key) contact[key] = text(li).replace(/^[^:]*:\s*/, '');
  }
  return {
    content: multilineText(doc.querySelector('.board-content'), { skip: (el) => el.classList?.contains('note-warn') }),
    contact,
    cycle: fields['활동주기'] ?? '',
    place: fields['봉사장소']?.replace(/\s*지도보기\s*$/, '') ?? '',
    org: fields['봉사활동처'] ?? '',
    region: fields['봉사지역'] ?? '',
    field: fields['활동분야'] ?? '',
    // 시간은 공고 작성자가 본문에 자유롭게 적는 값이라 '추정'으로만 쓴다
    guessedTime: findTimeRange(fields['활동주기']) ?? findTimeRange(body),
    // '비정기 [ 1일(4시간) ]'처럼 활동주기에 적힌 시간 수
    guessedHours: Number((fields['활동주기']?.match(/(\d+(?:\.\d+)?)\s*시간/) ?? [])[1]) || null,
  };
}

async function collect(http, url, params, parse, { maxPages, isLoggedOut, onProgress }) {
  const items = [];
  const seen = new Set();
  let total = 0;
  for (let page = 1; page <= maxPages; page++) {
    const u = new URL(url);
    for (const [k, v] of Object.entries({ ...params, page: String(page) })) if (v !== '' && v != null) u.searchParams.set(k, v);
    const doc = await http.doc(u.href, isLoggedOut ? { origin: ORIGIN, isLoggedOut } : {});
    if (isLoggedOut?.(doc)) return { needLogin: page === 1, items, total };
    const result = parse(doc);
    total = result.total ?? 0;
    const fresh = result.items.filter((it) => !seen.has(it.uid));
    if (fresh.length === 0) break;
    fresh.forEach((it) => seen.add(it.uid));
    items.push(...fresh);
    onProgress?.({ source: 'vms', loaded: items.length, total });
    if (total && items.length >= total) break;
  }
  return { needLogin: false, items, total };
}

export async function fetchApplied(http, { maxPages = 20 } = {}) {
  const totalOf = (doc) => Number((text(doc.querySelector('.list-topBar .total')).match(/\d[\d,]*/) ?? ['0'])[0].replace(/,/g, ''));
  const result = await collect(
    http,
    APPLIED_URL,
    { orderType: 'seq', pageSize: '50' },
    (doc) => ({ total: totalOf(doc), items: parseAppliedPage(doc) }),
    { maxPages, isLoggedOut: isAppliedPageLoggedOut },
  );
  return { needLogin: result.needLogin, items: result.items };
}

export function searchParams(filters) {
  return {
    sttdte: filters.from,
    enddte: filters.to,
    status: filters.openOnly ? '1' : '',
    area: filters.areaVms ?? '',
    areagugun: filters.subAreaVms ?? '',
    acttype: filters.actTypeVms ?? '',
    volacttype: filters.faceVms ?? '',
    termgbn: filters.termVms ?? '',
    searchType: 'title',
    searchValue: filters.keyword ?? '',
    pageSize: '50',
  };
}

// 시·군·구 하나가 VMS에서는 여러 구 코드일 수 있어(예: 고양시 → 덕양구·일산동구·일산서구) 코드마다 검색해서 합친다.
export async function searchOpenings(http, filters, { maxPages = 2, onProgress } = {}) {
  const codes = [filters.subAreaVms ?? ''].flat();
  const items = [];
  const seen = new Set();
  let total = 0;
  for (const code of codes) {
    const result = await collect(http, SEARCH_URL, searchParams({ ...filters, subAreaVms: code }), parseSearchPage, {
      maxPages,
      onProgress: (p) => onProgress?.({ ...p, loaded: items.length + p.loaded, total: total + p.total }),
    });
    total += result.total;
    for (const it of result.items) {
      if (!seen.has(it.uid)) {
        seen.add(it.uid);
        items.push(it);
      }
    }
  }
  return { items, total, truncated: items.length < total };
}

export async function fetchDetail(http, seq) {
  return parseDetailPage(await http.doc(detailUrl(seq)));
}

export async function fetchSubAreas(http, areadiv) {
  const json = await http.json(AREA_URL, { method: 'POST', form: { areadiv } });
  return (json?.list ?? []).map((a) => ({ code: a.legalcode, name: a.legalname }));
}
