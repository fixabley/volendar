// 1365 자원봉사포털 (www.1365.go.kr)
// 신청내역은 로그인 세션이 필요하고, 모집 검색과 상세는 공개 페이지다.
import { addDays, parseCompactDate, parseDate, parseDateRange, parseTime, parseTimeRange, parseWeekdays, todayKST } from '../lib/dates.js';

export const ORIGIN = 'https://www.1365.go.kr';
export const LOGIN_URL = `${ORIGIN}/vols/P9910/mber/volsLogin.do`;
const APPLIED_URL = `${ORIGIN}/vols/1472178171182/mypage/reqstDtls.do`;
const SEARCH_URL = `${ORIGIN}/vols/P9210/partcptn/timeCptn.do`;
const AREA_URL = `${ORIGIN}/vols/P9210/mber/volsMberJson.do`;

export const detailUrl = (progrmRegistNo) => `${SEARCH_URL}?type=show&progrmRegistNo=${progrmRegistNo}`;

export const FIELDS = [
  ['0100', '생활편의'], ['0200', '주거환경'], ['0300', '상담·멘토링'], ['0400', '교육'], ['0500', '보건·의료'],
  ['0600', '농어촌 봉사'], ['0700', '문화·체육·예술·관광'], ['0800', '환경·생태계보호'], ['0900', '사무행정'],
  ['1000', '지역안전·보호'], ['1100', '인권·공익'], ['1200', '재난·재해'], ['1300', '국제협력·해외봉사'],
  ['1500', '기타'], ['1700', '자원봉사 기본교육'],
];

const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

// 신청상태 → 공통 상태 분류
export function statusKindOf(status) {
  if (/취소|반려/.test(status)) return 'cancelled';
  if (/승인|확정|완료/.test(status)) return 'confirmed';
  if (/접수|대기/.test(status)) return 'pending';
  return 'unknown';
}

function dlMap(root) {
  const map = {};
  for (const dl of root?.querySelectorAll('dl') ?? []) {
    const key = text(dl.querySelector('dt'));
    if (key && !(key in map)) map[key] = text(dl.querySelector('dd'));
  }
  return map;
}

// 로그인 세션이 없으면 1365는 200 응답에 '로그인 정보가 없습니다' 알림 스크립트만 돌려준다.
export function isAppliedPageLoggedOut(doc) {
  return !doc.querySelector('form[name=frm] select[name=schApply]');
}

export function parseAppliedPage(doc) {
  const items = [];
  for (const li of doc.querySelectorAll('ul.list_wrap.ul_top > li')) {
    const link = li.querySelector('dt a');
    if (!link) continue;
    // javascript:detailView('1234567','2','20261203','10','A01', …)
    const args = [...(link.getAttribute('href') ?? '').matchAll(/'([^']*)'/g)].map((m) => m[1]);
    const fields = dlMap(li.querySelector('dd.board_data'));
    const tags = [...li.querySelectorAll('.tag_g span')].map(text);
    const status = tags.find((t) => /접수|승인|취소|반려|대기|완료/.test(t)) ?? '';
    const id = args[0];
    const date = parseDate(fields['봉사일자']) ?? parseCompactDate(args[2]);
    if (!id || !date) continue;
    const startTime = parseTime(fields['시작시간']);
    const endTime = parseTime(fields['종료시간']);
    items.push({
      uid: `1365-${id}-${date.replace(/-/g, '')}-${(startTime ?? '0000').replace(':', '')}`,
      source: '1365',
      kind: 'applied',
      id,
      title: text(link),
      date,
      endDate: date,
      startTime,
      endTime: startTime ? endTime : null,
      status,
      statusKind: statusKindOf(status),
      certType: tags.find((t) => /인증/.test(t)) ?? '',
      appliedOn: parseDate(fields['신청일자']),
      url: detailUrl(id),
    });
  }
  return items;
}

export function parseSearchPage(doc) {
  const total = Number((doc.body?.textContent.match(/전체\s*([\d,]+)\s*건/) ?? [])[1]?.replace(/,/g, '') ?? 0);
  const items = [];
  for (const input of doc.querySelectorAll('input[id^="progrmRegistNo_"]')) {
    const li = input.closest('li');
    const id = input.getAttribute('value');
    if (!li || !id) continue;
    const pairs = {};
    for (const p of li.querySelectorAll('.txts_pc_ver p')) {
      const key = text(p);
      if (key && !(key in pairs)) pairs[key] = text(p.nextElementSibling);
    }
    const range = parseDateRange(pairs['봉사기간']);
    if (!range) continue;
    const time = parseTimeRange(pairs['봉사시간']);
    const tags = [...li.querySelectorAll('.tagWrap .ing ul li')].map(text);
    const [area, org] = [...li.querySelectorAll('.vols-location span')].map(text);
    items.push({
      uid: `1365-open-${id}`,
      source: '1365',
      kind: 'opening',
      id,
      title: text(li.querySelector('.tit_board_list')),
      date: range.start,
      endDate: range.end,
      startTime: time?.start ?? null,
      endTime: time?.end ?? null,
      weekdays: null, // 여러 날짜에 걸친 공고는 상세 페이지의 활동요일로 채운다
      status: text(li.querySelector('.close_dDay .end')),
      statusKind: 'open',
      recruitPeriod: pairs['모집기간'] ?? '',
      creditHours: pairs['인정시간'] ?? '',
      target: pairs['신청대상'] ?? '',
      tags,
      area: area ?? '',
      org: org ?? '',
      url: detailUrl(id),
    });
  }
  return { total, items };
}

export function parseDetailPage(doc) {
  const fields = dlMap(doc.querySelector('.board_data_show'));
  return {
    weekdays: parseWeekdays(fields['활동요일']),
    weekdaysText: fields['활동요일'] ?? '',
    place: fields['봉사장소'] ?? '',
    // 모집기관 칸에는 '상세정보' 버튼 글자가 같이 들어 있어 이름 span만 읽는다
    org: text(doc.querySelector('.board_data_show dd.f-box .text-l')) || (fields['모집기관'] ?? ''),
    period: parseDateRange(fields['봉사기간']),
    time: parseTimeRange(fields['봉사시간']),
    // '9시 0분 ~ 13시 0분 (최대 4시간 인정)'
    creditCapHours: Number((fields['봉사시간']?.match(/최대\s*(\d+(?:\.\d+)?)\s*시간/) ?? [])[1]) || null,
  };
}

const appliedForm = (page, from, to) => ({
  currentPageNo: String(page),
  schActSe: '',
  schApply: '',
  schTermFrom: from,
  schTermTo: to,
  srcReqstSj: '',
});

// 신청내역의 기간 검색은 '신청일자' 기준이다. 봉사일 기준 필터는 받아 온 뒤에 적용한다.
export async function fetchApplied(http, { lookbackDays = 365, maxPages = 20 } = {}) {
  const today = todayKST();
  const from = addDays(today, -lookbackDays);
  const items = [];
  const seen = new Set();
  for (let page = 1; page <= maxPages; page++) {
    const doc = await http.doc(APPLIED_URL, {
      method: 'POST',
      form: appliedForm(page, from, today),
      origin: ORIGIN,
      isLoggedOut: isAppliedPageLoggedOut,
    });
    if (isAppliedPageLoggedOut(doc)) {
      if (page === 1) return { needLogin: true, items: [] };
      break;
    }
    const pageItems = parseAppliedPage(doc).filter((it) => !seen.has(it.uid));
    if (pageItems.length === 0) break;
    // 페이지 번호를 넘겨도 같은 목록이 오면(마지막 페이지 이후) 새 항목이 없으므로 위에서 멈춘다.
    pageItems.forEach((it) => seen.add(it.uid));
    items.push(...pageItems);
  }
  return { needLogin: false, items };
}

export function searchForm(filters, page) {
  return {
    cPage: String(page),
    searchFlag: 'search',
    flag: 'A01',
    // 두 값이 빠지면 결과가 0건이 된다. 대상 필터를 둘 다 끄면 둘 다 보낸다.
    adultPosblAt: filters.adult || !filters.youth ? 'Y' : '',
    yngbgsPosblAt: filters.youth || !filters.adult ? 'Y' : '',
    searchProgrmBgnde: filters.from,
    searchProgrmEndde: filters.to,
    searchWeek: filters.week ?? '0',
    searchHopeArea1: filters.area1365 ?? '',
    searchHopeArea2: filters.subArea1365 ?? '',
    searchHopeSrvc1: filters.field1365 ?? '',
    searchSrvcTarget: '',
    searchSrvcStts: filters.openOnly ? '0' : '3',
    searchActOnline: filters.online1365 ?? '',
    searchKeyword: filters.keyword ?? '',
    searchNanmmbyNm: '',
  };
}

export async function searchOpenings(http, filters, { maxPages = 5, onProgress } = {}) {
  const items = [];
  let total = 0;
  for (let page = 1; page <= maxPages; page++) {
    const doc = await http.doc(SEARCH_URL, { method: 'POST', form: searchForm(filters, page) });
    const result = parseSearchPage(doc);
    total = result.total;
    items.push(...result.items);
    onProgress?.({ source: '1365', loaded: items.length, total });
    if (result.items.length === 0 || items.length >= total) break;
  }
  return { items, total, truncated: items.length < total };
}

export async function fetchDetail(http, id) {
  return parseDetailPage(await http.doc(detailUrl(id)));
}

export async function fetchSubAreas(http, upper) {
  const json = await http.json(AREA_URL, { method: 'POST', form: { type: 'hopeAreaListUnity', upper, engnSe: '4' } });
  return (json?.list ?? []).map((a) => ({ code: a.code, name: a.codeNm }));
}
