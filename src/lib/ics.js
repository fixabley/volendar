import { addDays, kstToIcsUtc } from './dates.js';

const CRLF = '\r\n';

function escapeText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

// RFC 5545: 한 줄은 75옥텟을 넘지 않게 접는다. 한글은 UTF-8로 3바이트라서 문자 수가 아니라 바이트 수로 센다.
function fold(line) {
  const encoder = new TextEncoder();
  const out = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // 이어지는 줄은 앞에 공백 1바이트가 붙는다
    if (bytes + size > limit) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join(`${CRLF} `);
}

function stamp(now) {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

const ICS_STATUS = { pending: 'TENTATIVE', confirmed: 'CONFIRMED', cancelled: 'CANCELLED' };

// event: { uid, title, date, endDate?, startTime?, endTime?, location?, description?, url?, statusKind? }
// 시각이 있으면 UTC 시각 일정, 없으면 date~endDate 종일 일정(DTEND는 다음 날, 배타적)으로 만든다.
export function buildIcs(events, { calendarName = '봉사 일정', now = new Date() } = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//volendar//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    'X-WR-TIMEZONE:Asia/Seoul',
  ];
  for (const ev of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.uid}@volendar`);
    lines.push(`DTSTAMP:${stamp(now)}`);
    if (ev.startTime && ev.endTime) {
      lines.push(`DTSTART:${kstToIcsUtc(ev.date, ev.startTime)}`);
      // 자정을 넘기는 활동(예: 22:00~02:00)은 종료일을 하루 뒤로 잡는다.
      const endDate = ev.endTime <= ev.startTime ? addDays(ev.date, 1) : ev.date;
      lines.push(`DTEND:${kstToIcsUtc(endDate, ev.endTime)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${ev.date.replace(/-/g, '')}`);
      lines.push(`DTEND;VALUE=DATE:${addDays(ev.endDate ?? ev.date, 1).replace(/-/g, '')}`);
    }
    lines.push(`SUMMARY:${escapeText(ev.title)}`);
    if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
    if (ev.url) lines.push(`URL:${ev.url}`);
    if (ICS_STATUS[ev.statusKind]) lines.push(`STATUS:${ICS_STATUS[ev.statusKind]}`);
    lines.push('TRANSP:OPAQUE');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join(CRLF) + CRLF;
}
