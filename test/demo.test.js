import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoApplied, demoCalendarIcs, demoOpenings } from '../src/demo.js';
import { busyBlocks, parseIcs } from '../src/lib/icsParse.js';
import { classifyOpening, expand } from '../src/lib/schedule.js';
import { summarizeHours } from '../src/lib/hours.js';
import { addDays } from '../src/lib/dates.js';

const today = '2026-11-11';
const filters = { from: today, to: addDays(today, 30), sources: ['1365', 'vms'], keyword: '' };

test('예시 신청 일정은 상태별로 섞여 있고 실제 사이트 링크가 없다', () => {
  const all = Object.values(demoApplied(today)).flat();
  assert.ok(all.some((i) => i.statusKind === 'confirmed') && all.some((i) => i.statusKind === 'pending'));
  assert.ok(all.every((i) => i.url === null && /^\d{4}-\d{2}-\d{2}$/.test(i.date)));
  assert.equal(new Set(all.map((i) => i.uid)).size, all.length);
  const s = summarizeHours(all, today, addDays(today, 30));
  assert.ok(s.minutes > 0 && s.byStatus.confirmed > 0 && s.unknown > 0);
});

test('예시 모집 공고는 같은 조건이면 같고, 사이트·키워드 필터를 따른다', () => {
  const a = demoOpenings(today, filters);
  assert.deepEqual(a.map((i) => i.uid), demoOpenings(today, filters).map((i) => i.uid));
  assert.ok(a.some((i) => i.source === '1365') && a.some((i) => i.source === 'vms'));
  assert.ok(demoOpenings(today, { ...filters, sources: ['vms'] }).every((i) => i.source === 'vms'));
  assert.ok(demoOpenings(today, { ...filters, keyword: '플로깅' }).every((i) => i.title.includes('플로깅')));
  assert.ok(a.every((i) => i.date >= filters.from && i.date <= filters.to));
});

test('예시 데이터로 빈 시간 필터의 표시가 모두 나온다', () => {
  const busy = [
    ...Object.values(demoApplied(today)).flat().flatMap(expand),
    ...busyBlocks(parseIcs(demoCalendarIcs(today)), { from: today, to: addDays(today, 60) }).blocks
      .map((b) => ({ item: { source: 'ext', id: 'ext', statusKind: 'confirmed' }, ...b })),
  ];
  const tags = new Set(demoOpenings(today, filters).flatMap(expand).flatMap((o) => classifyOpening(o, { busy, showUntimed: true }).tags));
  for (const t of ['applied', 'conflict', 'untimed']) assert.ok(tags.has(t), t);
});
