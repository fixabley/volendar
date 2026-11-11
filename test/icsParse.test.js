import { test } from 'node:test';
import assert from 'node:assert/strict';
import { busyBlocks, parseIcs } from '../src/lib/icsParse.js';
import { buildIcs } from '../src/lib/ics.js';
import { fixture } from './helpers.js';

const range = { from: '2026-11-01', to: '2026-12-31' };
const blocksOf = (opts = {}) => busyBlocks(parseIcs(fixture('external.ics')), { ...range, ...opts }).blocks;
const fmt = (b) => `${b.date} ${b.startTime}-${b.endTime} ${b.title}`;

test('시간대·UTC·알림을 처리하고 한 번짜리 일정을 KST로 바꾼다', () => {
  const list = blocksOf().map(fmt);
  assert.ok(list.includes('2026-11-16 10:00-11:30 치과, 정기검진'));
  assert.ok(list.includes('2026-11-17 14:00-15:00 UTC 회의'));
});

test('주간 반복은 EXDATE와 RECURRENCE-ID 변경을 반영한다', () => {
  const english = blocksOf().filter((b) => b.title.startsWith('영어 학원')).map(fmt);
  assert.deepEqual(english, [
    '2026-11-02 19:00-21:00 영어 학원',
    '2026-11-04 19:00-21:00 영어 학원',
    '2026-11-09 19:00-21:00 영어 학원',
    '2026-11-11 19:00-21:00 영어 학원',
    '2026-11-16 19:00-21:00 영어 학원',
    // 11-18은 EXDATE, 11-23은 11-24로 옮겨짐
    '2026-11-25 19:00-21:00 영어 학원',
    '2026-11-30 19:00-21:00 영어 학원',
    '2026-11-24 20:00-21:00 영어 학원 (보강)',
  ]);
});

test('바쁨이 아닌 일정은 빼고, 종일 일정은 옵션일 때만 넣는다', () => {
  const titles = blocksOf().map((b) => b.title);
  for (const t of ['한가함', '취소된 약속', '[1365] 내보낸 봉사', '여행']) assert.ok(!titles.includes(t), t);
  const withAllDay = blocksOf({ includeAllDay: true }).filter((b) => b.title === '여행').map(fmt);
  assert.deepEqual(withAllDay, ['2026-11-20 00:00-24:00 여행', '2026-11-21 00:00-24:00 여행']);
});

test('자정을 넘기는 일정은 날짜별로 나누고 Windows 시간대 이름도 읽는다', () => {
  const night = blocksOf().filter((b) => b.title === '야간 근무').map(fmt);
  assert.deepEqual(night, ['2026-11-25 23:00-24:00 야간 근무', '2026-11-26 00:00-01:30 야간 근무']);
});

test('월간 n번째 요일 반복과 다른 시간대(서머타임 포함)를 계산한다', () => {
  const monthly = blocksOf({ to: '2027-03-31' }).filter((b) => b.title === '뉴욕 월간 회의').map(fmt);
  // 둘째 화요일 09:00 뉴욕(EST, UTC-5) = 같은 날 23:00 KST, COUNT=3
  assert.deepEqual(monthly, [
    '2026-11-10 23:00-24:00 뉴욕 월간 회의',
    '2026-12-08 23:00-24:00 뉴욕 월간 회의',
    '2027-01-12 23:00-24:00 뉴욕 월간 회의',
  ]);
});

test('이 확장이 만든 ICS를 다시 읽되, 신청내역과 겹치지 않게 바쁜 시간에서는 뺀다', () => {
  const ics = buildIcs([{ uid: 'x', title: '긴 제목, 쉼표; '.repeat(10), date: '2026-11-20', startTime: '09:00', endTime: '12:00' }]);
  const [ev] = parseIcs(ics);
  assert.equal(ev.title, '긴 제목, 쉼표; '.repeat(10)); // 접힌 줄과 이스케이프 복원
  assert.equal(ev.uid, 'x@volendar');
  assert.deepEqual(busyBlocks([ev], range).blocks, []);
  const other = { ...ev, uid: 'x@elsewhere' };
  assert.deepEqual(busyBlocks([other], range).blocks.map((b) => `${b.date} ${b.startTime}-${b.endTime}`), ['2026-11-20 09:00-12:00']);
});

test('Google처럼 한가함으로 표시된 종일 일정도 옵션을 켜면 넣고, 뺀 이유를 센다', () => {
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'BEGIN:VEVENT', 'UID:g1@google.com', 'DTSTART;VALUE=DATE:20261120', 'DTEND;VALUE=DATE:20261121', 'TRANSP:TRANSPARENT', 'SUMMARY:종일 약속', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:g2@google.com', 'DTSTART:20261119T010000Z', 'DTEND:20261119T020000Z', 'TRANSP:TRANSPARENT', 'SUMMARY:한가함 표시', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:g3@google.com', 'DTSTART:20250101T010000Z', 'DTEND:20250101T020000Z', 'SUMMARY:지난 일정', 'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const events = parseIcs(ics);
  const off = busyBlocks(events, range);
  assert.deepEqual(off.blocks, []);
  assert.deepEqual(off.skipped, { allDay: 1, free: 1, cancelled: 0, own: 0, outside: 1 });
  const on = busyBlocks(events, { ...range, includeAllDay: true });
  assert.deepEqual(on.blocks.map(fmt), ['2026-11-20 00:00-24:00 종일 약속']);
});

test('showAll이면 바쁜 시간이 아닌 일정도 busy:false로 함께 돌려준다', () => {
  const all = blocksOf({ showAll: true });
  const travel = all.filter((b) => b.title === '여행');
  assert.deepEqual(travel.map((b) => [b.date, b.busy, b.allDay]), [['2026-11-20', false, true], ['2026-11-21', false, true]]);
  const free = all.find((b) => b.title === '한가함');
  assert.deepEqual([free.busy, free.allDay], [false, false]);
  assert.ok(all.filter((b) => b.busy).length === blocksOf().length);
  assert.ok(!all.some((b) => b.title === '취소된 약속' || b.title === '[1365] 내보낸 봉사'));
});
