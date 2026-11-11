import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as s1365 from '../src/sources/site1365.js';
import { expand } from '../src/lib/schedule.js';
import { fakeHttp, fixture, fixtureDoc } from './helpers.js';

const detailHtml = `<form name="frm" method="post">
  <input type="hidden" name="progrmRegistNo" value="2000002">
  <input type="hidden" name="progrmBgnde" value="20261201">
  <input type="hidden" name="progrmEndde" value="20270115">
  <input type="hidden" name="actBeginTm" value="10">
  <input type="hidden" name="titleNm" value="">
</form>`;
const january = fixture('1365-apply.html')
  .replace('<p>2026.12</p>', '<p>2027.01</p>')
  .replaceAll('202612', '202701')
  .replace('value="12"', 'value="01"');

test('신청서 화면에서 날짜별 모집 상태를 읽는다 (모집일이 아닌 날은 뺀다)', () => {
  const cal = s1365.parseApplyCalendar(fixtureDoc('1365-apply.html'));
  assert.equal(cal.month, '2026-12');
  assert.deepEqual(cal.days.map((d) => [d.date, d.open, d.label, d.count, d.hours.join()]), [
    ['2026-12-02', true, '모집중', '0/2명', '10'],
    ['2026-12-03', false, '모집완료', '2/2명', '10'],
    ['2026-12-05', true, '모집중', '1/2명', '10'],
  ]);
  assert.equal(s1365.isApplyPageLoggedOut(fixtureDoc('1365-apply.html')), false);
  assert.equal(s1365.isApplyPageLoggedOut(fixtureDoc('1365-logged-out.html')), true);
});

test('사이트의 다음 달 보기처럼 연·월을 바꿔 다음 달을 가져온다', async () => {
  const http = fakeHttp((url) => (url.includes('type=show') ? detailHtml : url.includes('gu=next') ? january : fixture('1365-apply.html')));
  const res = await s1365.fetchApplyDates(http, '2000002');
  assert.equal(res.needLogin, false);
  assert.deepEqual(res.months, ['2026-12', '2027-01']);
  assert.equal(res.days.length, 6);
  const [, first, next] = http.calls;
  assert.equal(first.method, 'POST');
  assert.ok(first.url.endsWith('timeCptn.do?type=save'));
  assert.equal(Object.fromEntries(first.form).titleNm, '신청하기');
  assert.ok(next.url.endsWith('type=save&gu=next'));
  const f = Object.fromEntries(next.form);
  assert.deepEqual([f.currYear, f.currMonth, f._portalCsrfToken], ['2027', '01', 'token-abc']);
  assert.ok(!next.form.some(([k]) => k === 'rec' || k.startsWith('sel')));
  // 실제 신청 요청은 보내지 않는다
  assert.ok(http.calls.every((c) => !c.url.includes('Request.do')));
});

test('기대한 달이 오지 않으면 더 넘기지 않고, 로그아웃이면 알린다', async () => {
  const same = fakeHttp((url) => (url.includes('type=show') ? detailHtml : fixture('1365-apply.html')));
  const res = await s1365.fetchApplyDates(same, '2000002');
  assert.deepEqual(res.months, ['2026-12']);
  assert.equal(res.days.length, 3);
  const out = await s1365.fetchApplyDates(fakeHttp((url) => (url.includes('type=show') ? detailHtml : fixture('1365-logged-out.html'))), '2000002');
  assert.deepEqual(out, { needLogin: true, days: [], months: [] });
});

test('확인한 신청 가능 날짜가 있으면 그 날짜만 펼친다', () => {
  const item = { source: '1365', id: 'x', date: '2026-12-01', endDate: '2026-12-12', startTime: '10:00', endTime: '14:00', weekdays: new Set([1, 2, 3, 4, 5, 6]) };
  assert.equal(expand(item).length, 11);
  assert.deepEqual(expand({ ...item, availableDates: new Set(['2026-12-02', '2026-12-05', '2027-01-01']) }).map((o) => o.date), ['2026-12-02', '2026-12-05']);
});
