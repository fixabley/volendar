import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyOpening, defaultAvailability, expand, isLongRange } from '../src/lib/schedule.js';
import { mergeSubAreas } from '../src/lib/regions.js';

const opening = (over) => ({ source: '1365', id: 'p1', kind: 'opening', date: '2026-11-16', endDate: '2026-11-16', startTime: '09:00', endTime: '13:00', weekdays: null, ...over });
const applied = (over) => ({ source: '1365', id: 'a1', kind: 'applied', date: '2026-11-16', endDate: '2026-11-16', startTime: '10:00', endTime: '12:00', statusKind: 'pending', ...over });

test('여러 날 공고는 활동요일에 맞는 날만 펼친다', () => {
  const occ = expand(opening({ endDate: '2026-11-22', weekdays: new Set([1, 3]) }));
  assert.deepEqual(occ.map((o) => o.date), ['2026-11-16', '2026-11-18']);
});

test('시간 없는 긴 공고는 달력에 찍지 않는다', () => {
  const long = opening({ startTime: null, endTime: null, endDate: '2026-12-31' });
  assert.equal(isLongRange(long), true);
  assert.deepEqual(expand(long), []);
  assert.equal(expand(opening({ startTime: null, endTime: null, endDate: '2026-11-18' })).length, 3);
});

test('내 신청과 겹치면 표시하고, 숨기기를 켜면 숨긴다', () => {
  const busy = expand(applied());
  const [occ] = expand(opening());
  assert.deepEqual(classifyOpening(occ, { busy }), { tags: ['conflict'], hidden: false });
  assert.equal(classifyOpening(occ, { busy, hideConflicts: true }).hidden, true);
  const cancelled = expand(applied({ statusKind: 'cancelled' }));
  assert.deepEqual(classifyOpening(occ, { busy: cancelled, hideConflicts: true }), { tags: [], hidden: false });
});

test('여유 시간을 두면 붙어 있는 일정도 겹침으로 본다', () => {
  const busy = expand(applied({ startTime: '13:00', endTime: '15:00' }));
  const [occ] = expand(opening());
  assert.deepEqual(classifyOpening(occ, { busy }).tags, []);
  assert.deepEqual(classifyOpening(occ, { busy, bufferMin: 30 }).tags, ['conflict']);
});

test('이미 신청한 같은 날짜 공고는 겹침이 아니라 신청함으로 표시한다', () => {
  const busy = expand(applied({ id: 'p1', startTime: '09:00', endTime: '13:00' }));
  const [occ] = expand(opening());
  assert.deepEqual(classifyOpening(occ, { busy, hideConflicts: true }), { tags: ['applied'], hidden: false });
});

test('가능 시간대 밖이거나 시간이 없으면 구분한다', () => {
  const availability = defaultAvailability(); // 월요일 18~22시
  const [occ] = expand(opening()); // 2026-11-16 월요일 09~13시
  assert.deepEqual(classifyOpening(occ, { useAvailability: true, availability }), { tags: ['outside'], hidden: true });
  const [evening] = expand(opening({ startTime: '19:00', endTime: '21:00' }));
  assert.equal(classifyOpening(evening, { useAvailability: true, availability }).hidden, false);
  const [untimed] = expand(opening({ startTime: null, endTime: null }));
  assert.deepEqual(classifyOpening(untimed, { useAvailability: true, availability, showUntimed: false }), { tags: ['untimed'], hidden: true });
});

test('시군구 이름을 두 사이트 사이에서 맞춘다', () => {
  const merged = mergeSubAreas(
    [{ code: '3660000', name: '서구' }, { code: '3670000', name: '유성구' }],
    [{ code: '3017000000', name: '대전광역시 서구' }, { code: '3099000000', name: '대전광역시 신설구' }],
  );
  assert.deepEqual(merged, [
    { name: '서구', c1365: '3660000', cVms: ['3017000000'] },
    { name: '신설구', c1365: null, cVms: ['3099000000'] },
    { name: '유성구', c1365: '3670000', cVms: [] },
  ]);
});

test('1365의 시 하나에 VMS의 구 여러 개를 묶는다', () => {
  const merged = mergeSubAreas(
    [{ code: '3940000', name: '고양시' }, { code: '3950000', name: '과천시' }],
    [
      { code: '4128100000', name: '경기도 고양시 덕양구' },
      { code: '4128500000', name: '경기도 고양시 일산동구' },
      { code: '4129000000', name: '경기도 과천시' },
    ],
  );
  assert.deepEqual(merged, [
    { name: '고양시', c1365: '3940000', cVms: ['4128100000', '4128500000'] },
    { name: '과천시', c1365: '3950000', cVms: ['4129000000'] },
  ]);
});
