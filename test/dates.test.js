import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, addMonths, findTimeRange, kstToIcsUtc, monthGrid, parseDate, parseDateRange, parseTime,
  parseTimeRange, parseWeekdays, todayKST, weekdayOf,
} from '../src/lib/dates.js';

test('날짜 형식을 YYYY-MM-DD로 맞춘다', () => {
  assert.equal(parseDate('2026.11.26'), '2026-11-26');
  assert.equal(parseDate('2026-1-5'), '2026-01-05');
  assert.equal(parseDate('2026. 11. 26.'), '2026-11-26');
  assert.equal(parseDate('없음'), null);
  assert.deepEqual(parseDateRange(' 2026.11.16 ~ 2026.11.27 '), { start: '2026-11-16', end: '2026-11-27' });
  assert.deepEqual(parseDateRange('2026-12-15'), { start: '2026-12-15', end: '2026-12-15' });
});

test('1365의 세 가지 시각 표기를 읽는다', () => {
  assert.equal(parseTime('9시 0분'), '09:00');
  assert.equal(parseTime('13시 30분'), '13:30');
  assert.equal(parseTime(' 12 : 30 '), '12:30');
  assert.deepEqual(parseTimeRange('9시 0분 ~ 13시 0분 (최대 4시간 인정)'), { start: '09:00', end: '13:00' });
  assert.deepEqual(parseTimeRange(' 12 : 30 ~ 16 : 30 '), { start: '12:30', end: '16:30' });
  assert.equal(parseTimeRange(''), null);
});

test('자유 서술 본문에서 시간 범위를 추정한다', () => {
  assert.deepEqual(findTimeRange('일시 : 2026.12.15(화) 09:00~13:00, 회관'), { start: '09:00', end: '13:00' });
  assert.deepEqual(findTimeRange('26년 11월 12일(목) 19:00~20:30 - 장소'), { start: '19:00', end: '20:30' });
  assert.deepEqual(findTimeRange('평일 오후 3시 ~ 오후 6시'), { start: '15:00', end: '18:00' });
  assert.deepEqual(findTimeRange('오후 2시 ~ 5시 30분'), { start: '14:00', end: '17:30' });
  assert.deepEqual(findTimeRange('10시~1시'), { start: '10:00', end: '13:00' });
  assert.equal(findTimeRange('매주 주1회'), null);
  assert.equal(findTimeRange('1일(4시간)'), null);
  assert.equal(findTimeRange('2026-11-26 ~ 2026-12-01'), null);
});

test('활동요일 표기를 요일 번호로 바꾼다', () => {
  assert.deepEqual([...parseWeekdays('월,화,수,목,금,토')].sort(), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual([...parseWeekdays('월~금')].sort(), [1, 2, 3, 4, 5]);
  assert.deepEqual([...parseWeekdays('토~일')].sort(), [0, 6]);
  assert.deepEqual([...parseWeekdays('매일')].sort(), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(parseWeekdays(''), null);
});

test('KST를 UTC로 바꾸고 날짜 계산이 월말을 넘긴다', () => {
  assert.equal(kstToIcsUtc('2026-11-26', '09:00'), '20261126T000000Z');
  assert.equal(kstToIcsUtc('2026-11-26', '08:30'), '20261125T233000Z');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(weekdayOf('2026-11-11'), 3); // 수요일
  assert.equal(todayKST(new Date('2026-11-10T15:30:00Z')), '2026-11-11');
  const grid = monthGrid(2026, 11);
  assert.equal(grid.length, 42);
  assert.equal(grid[0], '2026-11-01'); // 2026-11-01은 일요일
});
