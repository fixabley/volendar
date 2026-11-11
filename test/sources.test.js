import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as s1365 from '../src/sources/site1365.js';
import * as vms from '../src/sources/vms.js';
import { fakeHttp, fixture, fixtureDoc } from './helpers.js';

test('1365 신청내역을 읽고 같은 공고의 다른 날짜를 구분한다', () => {
  const items = s1365.parseAppliedPage(fixtureDoc('1365-applied.html'));
  assert.equal(items.length, 3);
  assert.deepEqual(
    items.map((i) => [i.uid, i.date, i.startTime, i.endTime, i.status, i.statusKind]),
    [
      ['1365-1000001-20261203-1000', '2026-12-03', '10:00', '14:00', '접수', 'pending'],
      ['1365-1000002-20261209-1430', '2026-12-09', '14:30', '16:30', '승인', 'confirmed'],
      ['1365-1000003-20261120-0000', '2026-11-20', null, null, '취소', 'cancelled'],
    ],
  );
  assert.equal(items[0].title, '도서관 서가 정리 (오전)');
  assert.equal(items[0].url, 'https://www.1365.go.kr/vols/P9210/partcptn/timeCptn.do?type=show&progrmRegistNo=1000001');
});

test('로그아웃 응답을 0건과 구분한다', () => {
  assert.equal(s1365.isAppliedPageLoggedOut(fixtureDoc('1365-logged-out.html')), true);
  assert.equal(s1365.isAppliedPageLoggedOut(fixtureDoc('1365-applied.html')), false);
  assert.equal(vms.isAppliedPageLoggedOut(fixtureDoc('vms-logged-out.html')), true);
  assert.equal(vms.isAppliedPageLoggedOut(fixtureDoc('vms-applied.html')), false);
});

test('1365 신청내역 조회는 새 항목이 없으면 멈추고, 로그아웃이면 needLogin을 돌려준다', async () => {
  const http = fakeHttp(() => fixture('1365-applied.html'));
  const res = await s1365.fetchApplied(http);
  assert.equal(res.needLogin, false);
  assert.equal(res.items.length, 3);
  assert.equal(http.calls.length, 2); // 2페이지가 같은 목록이면 멈춤
  assert.equal(http.calls[0].form.currentPageNo, '1');
  assert.equal(http.calls[0].origin, s1365.ORIGIN);

  const out = await s1365.fetchApplied(fakeHttp(() => fixture('1365-logged-out.html')));
  assert.deepEqual(out, { needLogin: true, items: [] });
});

test('1365 모집 검색 결과는 PC용 칸만 읽는다', () => {
  const { total, items } = s1365.parseSearchPage(fixtureDoc('1365-search.html'));
  assert.equal(total, 12);
  assert.equal(items.length, 2);
  assert.deepEqual(
    [items[0].id, items[0].date, items[0].endDate, items[0].startTime, items[0].endTime, items[0].area, items[0].org],
    ['2000001', '2026-11-14', '2026-11-14', '12:30', '16:30', '대전광역시 중구', '가상문화원'],
  );
  assert.deepEqual(items[0].tags, ['시간인증', '오프라인', '사무행정']);
  assert.equal(items[1].endDate, '2026-12-12');
});

test('1365 검색 요청에는 성인·청소년 값이 항상 들어간다', () => {
  const both = s1365.searchForm({ from: '2026-11-11', to: '2026-12-11' }, 1);
  assert.equal(both.adultPosblAt, 'Y');
  assert.equal(both.yngbgsPosblAt, 'Y');
  const adult = s1365.searchForm({ from: '2026-11-11', to: '2026-12-11', adult: true }, 2);
  assert.deepEqual([adult.adultPosblAt, adult.yngbgsPosblAt, adult.cPage], ['Y', '', '2']);
});

test('1365 상세는 숨은 actWkdy가 아니라 화면의 활동요일을 쓴다', () => {
  const d = s1365.parseDetailPage(fixtureDoc('1365-detail.html'));
  assert.deepEqual([...d.weekdays].sort(), [1, 2, 3, 4, 5, 6]);
  assert.equal(d.place, '가상학습관 3층');
  assert.equal(d.org, '가상구청 교육정책과');
  assert.deepEqual(d.time, { start: '10:00', end: '14:00' });
  assert.equal(d.creditCapHours, 4);
});

test('VMS 신청결과를 읽는다', () => {
  const items = vms.parseAppliedPage(fixtureDoc('vms-applied.html'));
  assert.deepEqual(
    items.map((i) => [i.uid, i.title, i.date, i.endDate, i.status, i.statusKind, i.area]),
    [
      ['vms-300001', '전화 말벗 봉사', '2026-10-05', '2026-12-20', '대기', 'pending', '부산'],
      ['vms-300002', '문화예술회관 행사 안내', '2026-12-15', '2026-12-15', '참석가능', 'confirmed', '경기'],
    ],
  );
  assert.equal(items[0].url, 'https://www.vms.or.kr/partspace/recruitView.do?seq=300001');
});

test('VMS 신청결과 조회는 빈 페이지에서 멈추고 로그아웃을 알린다', async () => {
  const empty = '<form id="searchForm"></form><ul class="card-list"></ul>';
  const http = fakeHttp((url) => (new URL(url).searchParams.get('page') === '1' ? fixture('vms-applied.html') : empty));
  const res = await vms.fetchApplied(http);
  assert.equal(res.items.length, 2);
  assert.equal(http.calls.length, 1); // 전체 2건을 다 받았으니 멈춤
  const out = await vms.fetchApplied(fakeHttp(() => fixture('vms-logged-out.html')));
  assert.equal(out.needLogin, true);
});

test('VMS 모집 검색과 상세 본문의 시간 추정', () => {
  const { total, items } = vms.parseSearchPage(fixtureDoc('vms-search.html'));
  assert.equal(total, 1234);
  assert.deepEqual([items[0].id, items[0].title, items[0].date, items[0].endDate, items[0].org, items[0].count], ['525027', '노인일자리 접수창구 안내', '2026-11-26', '2026-12-01', '가상노인인력개발센터', '0 / 10명']);
  const d = vms.parseDetailPage(fixtureDoc('vms-detail.html'));
  assert.equal(d.place, '가상문화예술회관');
  assert.equal(d.cycle, '비정기 [ 1일(4시간) ]');
  assert.deepEqual(d.guessedTime, { start: '09:00', end: '13:00' });
  assert.equal(d.guessedHours, 4);
});

test('VMS 검색 파라미터에서 빈 값은 빠진다', async () => {
  const http = fakeHttp(() => fixture('vms-search.html'));
  await vms.searchOpenings(http, { from: '2026-11-11', to: '2026-12-11', openOnly: true, areaVms: '0106' });
  const u = new URL(http.calls[0].url);
  assert.equal(u.searchParams.get('status'), '1');
  assert.equal(u.searchParams.get('area'), '0106');
  assert.equal(u.searchParams.get('pageSize'), '50');
  assert.equal(u.searchParams.has('acttype'), false);
});
