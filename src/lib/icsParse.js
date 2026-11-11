// 외부 캘린더(.ics)에서 '바쁜 시간'만 뽑아 KST 날짜별 구간으로 만든다.
// 반복 일정(RRULE)은 흔한 형태(DAILY/WEEKLY/MONTHLY/YEARLY + INTERVAL·COUNT·UNTIL·BYDAY·BYMONTHDAY)만 펼친다.
import { addDays, addMonths, daysBetween, weekdayOf } from './dates.js';

const pad = (n) => String(n).padStart(2, '0');
const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const KST_MS = 9 * 3600000;

// Outlook이 쓰는 Windows 시간대 이름 일부
const WINDOWS_TZ = {
  'Korea Standard Time': 'Asia/Seoul',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'China Standard Time': 'Asia/Shanghai',
  'UTC': 'UTC',
  'GMT Standard Time': 'Europe/London',
  'Pacific Standard Time': 'America/Los_Angeles',
  'Eastern Standard Time': 'America/New_York',
};

function unfold(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

function parseLine(line) {
  let i = 0;
  let quoted = false;
  for (; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ':' && !quoted) break;
  }
  const [name, ...rawParams] = line.slice(0, i).split(';');
  const params = {};
  for (const p of rawParams) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value: line.slice(i + 1) };
}

const unescapeText = (v) => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

function resolveTz(tzid) {
  if (!tzid) return null;
  const tz = WINDOWS_TZ[tzid] ?? tzid.replace(/^\/.*?\/(?=[A-Z])/, ''); // '/mozilla.org/.../Asia/Seoul' 같은 접두어 제거
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'Asia/Seoul'; // 모르는 시간대는 한국 시간으로 본다
  }
}

function tzOffsetMs(utcMs, tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]),
  );
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - utcMs;
}

// 시간대 tz의 벽시계 시각 → UTC epoch ms
function zonedToUtc(date, time, tz) {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi, s] = time.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi, s || 0);
  if (tz === 'UTC') return guess;
  const first = guess - tzOffsetMs(guess, tz);
  return guess - tzOffsetMs(first, tz);
}

// DTSTART 값 → { allDay, date, time, tz }  (tz: 'UTC' | IANA 이름, 없으면 한국 시간으로 본다)
function parseDateValue(value, params) {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (params.VALUE === 'DATE' || !m[4]) return { allDay: true, date };
  return { allDay: false, date, time: `${m[4]}:${m[5]}:${m[6]}`, tz: m[7] ? 'UTC' : resolveTz(params.TZID) ?? 'Asia/Seoul' };
}

function parseDuration(v) {
  const m = v?.match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const ms = ((+m[2] || 0) * 7 * 86400 + (+m[3] || 0) * 86400 + (+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0)) * 1000;
  return m[1] === '-' ? -ms : ms;
}

function parseRrule(v) {
  const r = Object.fromEntries(v.split(';').map((p) => p.split('=')));
  return {
    freq: r.FREQ,
    interval: Number(r.INTERVAL) || 1,
    count: r.COUNT ? Number(r.COUNT) : null,
    until: r.UNTIL ? parseDateValue(r.UNTIL, {}) : null,
    byDay: r.BYDAY ? r.BYDAY.split(',').map((d) => ({ n: d.length > 2 ? Number(d.slice(0, -2)) : 0, day: DAY_CODES.indexOf(d.slice(-2)) })) : null,
    byMonthDay: r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number) : null,
    unsupported: ['BYSETPOS', 'BYHOUR', 'BYMINUTE', 'BYWEEKNO', 'BYYEARDAY'].some((k) => k in r),
  };
}

export function parseIcs(text) {
  const events = [];
  let cur = null;
  let nested = 0;
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') {
      cur = { exdates: [] };
      continue;
    }
    if (!cur) continue;
    if (line === 'END:VEVENT') {
      if (cur.start) events.push(cur);
      cur = null;
      continue;
    }
    if (line.startsWith('BEGIN:')) nested++;
    if (line.startsWith('END:')) nested--;
    if (nested > 0 || line.startsWith('END:')) continue; // VALARM 등은 건너뛴다
    const { name, params, value } = parseLine(line);
    if (name === 'UID') cur.uid = value;
    else if (name === 'SUMMARY') cur.title = unescapeText(value);
    else if (name === 'DTSTART') cur.start = parseDateValue(value, params);
    else if (name === 'DTEND') cur.end = parseDateValue(value, params);
    else if (name === 'DURATION') cur.duration = parseDuration(value);
    else if (name === 'RRULE') cur.rrule = parseRrule(value);
    else if (name === 'EXDATE') cur.exdates.push(...value.split(',').map((v) => parseDateValue(v, params)).filter(Boolean));
    else if (name === 'RECURRENCE-ID') cur.recurrenceId = parseDateValue(value, params);
    else if (name === 'STATUS') cur.status = value.toUpperCase();
    else if (name === 'TRANSP') cur.transp = value.toUpperCase();
  }
  return events;
}

const instantKey = (dv) => (dv.allDay ? dv.date : String(zonedToUtc(dv.date, dv.time, dv.tz)));

// 반복 규칙에 따라 시작 날짜(벽시계 기준)를 만든다
function* recurrenceDates(startDate, rule, windowEnd) {
  const untilDate = rule.until?.date;
  const stop = (d) => d > windowEnd || (untilDate && d > untilDate);
  const startDow = weekdayOf(startDate);
  if (rule.freq === 'DAILY') {
    for (let d = startDate; !stop(d); d = addDays(d, rule.interval)) yield d;
  } else if (rule.freq === 'WEEKLY') {
    const days = (rule.byDay?.map((b) => b.day) ?? [startDow]).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    const monday = addDays(startDate, -((startDow + 6) % 7));
    for (let week = monday; !stop(week); week = addDays(week, 7 * rule.interval)) {
      for (const day of days) {
        const d = addDays(week, (day + 6) % 7);
        if (d < startDate) continue;
        if (stop(d)) return;
        yield d;
      }
    }
  } else if (rule.freq === 'MONTHLY' || rule.freq === 'YEARLY') {
    const step = rule.freq === 'MONTHLY' ? rule.interval : rule.interval * 12;
    const firstOfStart = `${startDate.slice(0, 7)}-01`;
    for (let k = 0; ; k++) {
      const first = addMonths(firstOfStart, k * step);
      if (stop(first)) return;
      const last = addDays(addMonths(first, 1), -1);
      const lastDay = Number(last.slice(8));
      let dates;
      if (rule.byDay && rule.freq === 'MONTHLY') {
        dates = rule.byDay.flatMap(({ n, day }) => {
          const all = [];
          for (let d = first; d <= last; d = addDays(d, 1)) if (weekdayOf(d) === day) all.push(d);
          return n === 0 ? all : [all[n > 0 ? n - 1 : all.length + n]].filter(Boolean);
        });
      } else {
        const monthDays = rule.byMonthDay ?? [Number(startDate.slice(8))];
        dates = monthDays
          .map((md) => (md < 0 ? lastDay + md + 1 : md))
          .filter((md) => md >= 1 && md <= lastDay)
          .map((md) => `${first.slice(0, 8)}${pad(md)}`);
        if (rule.freq === 'YEARLY' && first.slice(5, 7) !== startDate.slice(5, 7)) dates = [];
      }
      for (const d of dates.sort()) {
        if (d < startDate) continue;
        if (stop(d)) return;
        yield d;
      }
    }
  }
}

function toKstParts(ms) {
  const k = new Date(ms + KST_MS);
  return { date: `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}`, time: `${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}` };
}

// UTC 구간을 KST 날짜별 구간으로 쪼갠다 (자정을 넘기면 다음 날 00:00부터 이어짐)
function splitByKstDay(startMs, endMs, title) {
  const blocks = [];
  const s = toKstParts(startMs);
  const e = toKstParts(endMs);
  if (endMs <= startMs) return blocks;
  for (let d = s.date; d <= e.date; d = addDays(d, 1)) {
    const startTime = d === s.date ? s.time : '00:00';
    const endTime = d === e.date ? e.time : '24:00';
    if (startTime !== endTime) blocks.push({ date: d, startTime, endTime, title });
  }
  return blocks;
}

// 바쁜 시간 구간 목록. options: { from, to, includeAllDay }
export function busyBlocks(events, { from, to, includeAllDay = false }) {
  const blocks = [];
  let unsupported = 0;
  const overridden = new Set(events.filter((e) => e.recurrenceId).map((e) => `${e.uid}|${instantKey(e.recurrenceId)}`));
  for (const ev of events) {
    if (ev.status === 'CANCELLED' || ev.transp === 'TRANSPARENT') continue;
    if (ev.uid?.endsWith('@volendar')) continue; // 이 확장이 내보낸 봉사 일정은 신청내역으로 이미 비교한다
    if (ev.start.allDay && !includeAllDay) continue;
    const excluded = new Set(ev.exdates.map(instantKey));
    let starts = [ev.start.date];
    if (ev.rrule && !ev.recurrenceId) {
      if (ev.rrule.unsupported || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(ev.rrule.freq)) unsupported++;
      else {
        starts = [];
        for (const d of recurrenceDates(ev.start.date, ev.rrule, to)) {
          starts.push(d);
          if (ev.rrule.count && starts.length >= ev.rrule.count) break;
        }
      }
    }
    for (const date of starts) {
      const inst = { ...ev.start, date };
      const key = instantKey(inst);
      if (excluded.has(key) || (!ev.recurrenceId && overridden.has(`${ev.uid}|${key}`))) continue;
      if (ev.start.allDay) {
        const span = ev.end?.allDay ? Math.max(1, daysBetween(ev.start.date, ev.end.date)) : 1;
        for (let i = 0; i < span; i++) blocks.push({ date: addDays(date, i), startTime: '00:00', endTime: '24:00', title: ev.title ?? '' });
        continue;
      }
      const startMs = zonedToUtc(date, ev.start.time, ev.start.tz);
      let endMs;
      if (ev.end && !ev.end.allDay) endMs = startMs + (zonedToUtc(ev.end.date, ev.end.time, ev.end.tz) - zonedToUtc(ev.start.date, ev.start.time, ev.start.tz));
      else endMs = startMs + (ev.duration ?? 0);
      blocks.push(...splitByKstDay(startMs, endMs, ev.title ?? ''));
    }
  }
  return { blocks: blocks.filter((b) => b.date >= from && b.date <= to), unsupported };
}
