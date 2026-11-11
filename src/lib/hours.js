// 신청 일정 기준 봉사시간 계산. 실제 인정 시간(실적)과는 다를 수 있다.
import { toMinutes } from './dates.js';
import { expand, isLongRange } from './schedule.js';

export function durationMinutes(start, end) {
  const d = toMinutes(end) - toMinutes(start);
  return d > 0 ? d : d + 24 * 60; // 자정을 넘기는 활동
}

// → { minutes, estimated } | null (시간을 알 수 없음)
// 1365는 '최대 N시간 인정' 상한이 있으면 그만큼만 센다. VMS는 본문이나 활동주기에서 추정한 값뿐이다.
export function itemMinutes(item) {
  if (item.startTime && item.endTime) {
    let minutes = durationMinutes(item.startTime, item.endTime);
    if (item.creditCapHours) minutes = Math.min(minutes, item.creditCapHours * 60);
    return { minutes, estimated: Boolean(item.timeGuessed) };
  }
  if (item.guessedHours) return { minutes: Math.round(item.guessedHours * 60), estimated: true };
  return null;
}

export function formatMinutes(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}시간 ${m}분`;
  return h ? `${h}시간` : `${m}분`;
}

// from~to(포함) 사이 봉사시간 합계. 시간을 모르는 일정은 건수만 센다.
export function summarizeHours(items, from, to) {
  const sum = {
    minutes: 0, count: 0, estimated: 0, unknown: 0,
    unknownItems: [], // 시간을 몰라 합계에서 뺀 일정 (화면에 제목을 보여주려고)
    byStatus: { confirmed: 0, pending: 0, other: 0 },
    bySource: { 1365: 0, vms: 0 },
  };
  const skip = (item) => {
    sum.unknown++;
    if (!sum.unknownItems.includes(item)) sum.unknownItems.push(item);
  };
  for (const item of items) {
    if (item.statusKind === 'cancelled') continue;
    if (isLongRange(item)) {
      if (item.date <= to && item.endDate >= from) skip(item);
      continue;
    }
    const value = itemMinutes(item);
    for (const occ of expand(item)) {
      if (occ.date < from || occ.date > to) continue;
      if (!value) {
        skip(item);
        continue;
      }
      sum.minutes += value.minutes;
      sum.count++;
      if (value.estimated) sum.estimated++;
      const status = item.statusKind in sum.byStatus ? item.statusKind : 'other';
      sum.byStatus[status] += value.minutes;
      sum.bySource[item.source] += value.minutes;
    }
  }
  return sum;
}
