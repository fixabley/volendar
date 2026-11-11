import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMinutes, itemMinutes, summarizeHours } from '../src/lib/hours.js';

const item = (over) => ({ source: '1365', id: 'a', kind: 'applied', date: '2026-11-16', endDate: '2026-11-16', startTime: '09:00', endTime: '13:00', statusKind: 'confirmed', ...over });

test('일정 하나의 봉사시간은 인정 상한과 추정 여부를 반영한다', () => {
  assert.deepEqual(itemMinutes(item()), { minutes: 240, estimated: false });
  assert.deepEqual(itemMinutes(item({ endTime: '18:00', creditCapHours: 4 })), { minutes: 240, estimated: false });
  assert.deepEqual(itemMinutes(item({ startTime: '22:00', endTime: '01:30' })), { minutes: 210, estimated: false });
  assert.deepEqual(itemMinutes(item({ source: 'vms', timeGuessed: true })), { minutes: 240, estimated: true });
  assert.deepEqual(itemMinutes(item({ source: 'vms', startTime: null, endTime: null, guessedHours: 4 })), { minutes: 240, estimated: true });
  assert.equal(itemMinutes(item({ startTime: null, endTime: null })), null);
  assert.equal(formatMinutes(270), '4시간 30분');
  assert.equal(formatMinutes(240), '4시간');
  assert.equal(formatMinutes(30), '30분');
});

test('구간 합계는 기간 안의 일정만 더하고 취소는 뺀다', () => {
  const items = [
    item({ id: '1', date: '2026-11-10', endDate: '2026-11-10' }), // 기간 밖
    item({ id: '2' }), // 승인 4시간
    item({ id: '3', date: '2026-11-20', endDate: '2026-11-20', startTime: '13:30', endTime: '15:30', statusKind: 'pending' }),
    item({ id: '4', statusKind: 'cancelled' }),
    item({ id: '5', source: 'vms', startTime: null, endTime: null, date: '2026-11-18', endDate: '2026-11-18' }), // 시간 모름
    item({ id: '6', source: 'vms', startTime: null, endTime: null, date: '2026-10-01', endDate: '2026-12-31' }), // 기간형
    item({ id: '7', source: 'vms', startTime: '10:00', endTime: '12:00', timeGuessed: true, statusKind: 'unknown', date: '2026-11-30', endDate: '2026-11-30' }),
  ];
  const s = summarizeHours(items, '2026-11-15', '2026-11-30');
  assert.equal(s.minutes, 240 + 120 + 120);
  assert.equal(s.count, 3);
  assert.deepEqual(s.byStatus, { confirmed: 240, pending: 120, other: 120 });
  assert.deepEqual(s.bySource, { 1365: 360, vms: 120 });
  assert.equal(s.estimated, 1);
  assert.equal(s.unknown, 2);
  assert.deepEqual(s.unknownItems.map((i) => i.id), ['5', '6']);
});
