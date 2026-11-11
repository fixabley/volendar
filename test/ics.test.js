import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs } from '../src/lib/ics.js';

const now = new Date('2026-11-11T00:00:00Z');

test('시각이 있는 일정은 UTC로, 없는 일정은 종일(배타적 DTEND)로 만든다', () => {
  const ics = buildIcs([
    { uid: '1365-1-20261203-1000', title: '배식, 보조; 테스트', date: '2026-12-03', startTime: '10:00', endTime: '14:00', statusKind: 'pending', url: 'https://example.test/a?b=1' },
    { uid: 'vms-2', title: '기간 활동', date: '2026-10-05', endDate: '2026-12-20', statusKind: 'confirmed' },
  ], { now });
  assert.match(ics, /DTSTART:20261203T010000Z\r\nDTEND:20261203T050000Z/);
  assert.match(ics, /SUMMARY:배식\\, 보조\\; 테스트/);
  assert.match(ics, /STATUS:TENTATIVE/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261005\r\nDTEND;VALUE=DATE:20261221/);
  assert.match(ics, /STATUS:CONFIRMED/);
  assert.match(ics, /UID:1365-1-20261203-1000@volendar/);
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});

test('자정을 넘기는 일정은 종료일을 다음 날로 잡는다', () => {
  const ics = buildIcs([{ uid: 'x', title: '야간', date: '2026-11-26', startTime: '22:00', endTime: '02:00' }], { now });
  assert.match(ics, /DTSTART:20261126T130000Z\r\nDTEND:20261126T170000Z/);
});

test('한글 긴 줄은 75바이트 이하로 접는다', () => {
  const ics = buildIcs([{ uid: 'y', title: '가'.repeat(80), date: '2026-11-26' }], { now });
  const enc = new TextEncoder();
  for (const line of ics.split('\r\n')) assert.ok(enc.encode(line).length <= 75, line);
  const unfolded = ics.replace(/\r\n /g, '');
  assert.match(unfolded, new RegExp(`SUMMARY:${'가'.repeat(80)}`));
});
