// 항목(신청내역·모집공고)을 달력에 놓을 날짜별 일정(occurrence)으로 펼치고, 빈 시간 필터를 적용한다.
import { daysBetween, eachDay, toMinutes, weekdayOf } from './dates.js';

// 시간이 없는 공고가 이보다 길면 날마다 찍지 않고 '기간형' 목록으로 보낸다.
export const LONG_RANGE_DAYS = 7;

export const isTimed = (item) => Boolean(item.startTime && item.endTime);

export function isLongRange(item) {
  return !isTimed(item) && daysBetween(item.date, item.endDate ?? item.date) + 1 > LONG_RANGE_DAYS;
}

// item → [{ item, date, startTime, endTime }]
export function expand(item) {
  if (isLongRange(item)) return [];
  const days = eachDay(item.date, item.endDate ?? item.date);
  // 신청 가능 날짜를 확인했으면 그 날짜만, 아니면 활동요일로 거른다
  const picked = item.availableDates
    ? days.filter((d) => item.availableDates.has(d))
    : item.weekdays ? days.filter((d) => item.weekdays.has(weekdayOf(d))) : days;
  return picked.map((date) => ({ item, date, startTime: item.startTime, endTime: item.endTime }));
}

// 가능 시간대: { days: { 0..6: { on, start, end } } } — 요일별로 하나의 창
export function fitsAvailability(occ, availability) {
  const win = availability?.days?.[weekdayOf(occ.date)];
  if (!win?.on) return false;
  return toMinutes(occ.startTime) >= toMinutes(win.start) && toMinutes(occ.endTime) <= toMinutes(win.end);
}

function overlaps(a, b, bufferMin) {
  if (a.date !== b.date) return false;
  return toMinutes(a.startTime) < toMinutes(b.endTime) + bufferMin && toMinutes(b.startTime) < toMinutes(a.endTime) + bufferMin;
}

// 같은 공고·같은 날짜를 이미 신청했는지
const sameSlot = (opening, applied) =>
  opening.item.source === applied.item.source && opening.item.id === applied.item.id && opening.date === applied.date;

// 모집 일정 하나에 붙일 표시와 숨김 여부를 정한다.
// opts: { busy: 바쁜 시간 occurrence[], applied: 내 신청 occurrence[] (없으면 busy), hideConflicts, hideApplied,
//         useAvailability, availability, bufferMin, showUntimed }
export function classifyOpening(occ, opts) {
  const tags = [];
  const timed = Boolean(occ.startTime && occ.endTime);
  const activeBusy = (opts.busy ?? []).filter((b) => b.item.statusKind !== 'cancelled');
  const mine = (opts.applied ?? activeBusy).filter((b) => b.item.statusKind !== 'cancelled');
  if (mine.some((b) => sameSlot(occ, b))) {
    tags.push('applied');
    if (opts.hideApplied) return { tags, hidden: true };
  }
  if (!timed) {
    tags.push('untimed');
    return { tags, hidden: !opts.showUntimed };
  }
  const conflict = activeBusy.some(
    (b) => !sameSlot(occ, b) && b.startTime && b.endTime && overlaps(occ, b, opts.bufferMin ?? 0),
  );
  if (conflict) tags.push('conflict');
  const fits = !opts.useAvailability || fitsAvailability(occ, opts.availability);
  if (!fits) tags.push('outside');
  const hidden = (conflict && opts.hideConflicts) || !fits;
  return { tags, hidden };
}

export const defaultAvailability = () => ({
  days: {
    0: { on: true, start: '09:00', end: '18:00' },
    1: { on: true, start: '18:00', end: '22:00' },
    2: { on: true, start: '18:00', end: '22:00' },
    3: { on: true, start: '18:00', end: '22:00' },
    4: { on: true, start: '18:00', end: '22:00' },
    5: { on: true, start: '18:00', end: '22:00' },
    6: { on: true, start: '09:00', end: '18:00' },
  },
});
