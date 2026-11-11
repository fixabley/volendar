// 날짜는 'YYYY-MM-DD', 시각은 'HH:MM' 문자열로 다룬다. 모든 값은 한국 시간(KST, UTC+9, 서머타임 없음) 기준이다.

const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

const pad = (n) => String(n).padStart(2, '0');

export function todayKST(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(now);
}

// '2026.11.26', '2026-11-26', '2026. 11. 26.' → '2026-11-26'
export function parseDate(text) {
  const m = String(text ?? '').match(/(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
}

// '20261126' → '2026-11-26'
export function parseCompactDate(text) {
  const m = String(text ?? '').match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// '2026.11.16 ~ 2026.11.27' → { start, end }. 날짜가 하나뿐이면 start === end.
export function parseDateRange(text) {
  const dates = String(text ?? '').match(/\d{4}\s*[.\-/]\s*\d{1,2}\s*[.\-/]\s*\d{1,2}/g) ?? [];
  if (dates.length === 0) return null;
  const start = parseDate(dates[0]);
  const end = parseDate(dates[dates.length - 1]);
  return { start, end: end < start ? start : end };
}

// '9시 0분' / '9시' / '12 : 30' / '09:00' → 'HH:MM'
export function parseTime(text) {
  const s = String(text ?? '');
  let m = s.match(/(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/);
  if (!m) m = s.match(/(\d{1,2})\s*:\s*(\d{1,2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 24 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

// '9시 0분 ~ 13시 0분 (최대 4시간 인정)' / '12 : 30 ~ 16 : 30' → { start, end }
export function parseTimeRange(text) {
  const parts = String(text ?? '').split('~');
  if (parts.length < 2) return null;
  const start = parseTime(parts[0]);
  const end = parseTime(parts[1]);
  return start && end ? { start, end } : null;
}

// 자유 서술 본문에서 첫 시간 범위를 찾는다. 예) '09:00~13:00', '19시~20시 30분', '오후 3시 ~ 오후 6시'
// VMS 공고처럼 시간 칸이 따로 없는 경우의 추정용이라 확실한 형식만 받아들인다.
export function findTimeRange(text) {
  const s = String(text ?? '');
  const clock = String.raw`(오전|오후)?\s*(\d{1,2})\s*(?::\s*(\d{2})|시(?:\s*(\d{1,2})\s*분|\s*반)?)`;
  const re = new RegExp(`${clock}\\s*[~\\-–]\\s*${clock}`, 'g');
  for (const m of s.matchAll(re)) {
    const toHM = (ampm, h, colonMin, korMin, whole) => {
      let hour = Number(h);
      if (ampm === '오후' && hour < 12) hour += 12;
      if (ampm === '오전' && hour === 12) hour = 0;
      const min = Number(colonMin ?? korMin ?? (/반$/.test(whole) ? 30 : 0));
      return hour <= 24 && min <= 59 ? hour * 60 + min : null;
    };
    const [left, right] = m[0].split(/[~\-–]/);
    const start = toHM(m[1], m[2], m[3], m[4], left.trim());
    // 오른쪽에 오전/오후가 없으면 왼쪽 것을 따른다 (예: '오후 3시 ~ 6시')
    let end = toHM(m[5] ?? m[1], m[6], m[7], m[8], right.trim());
    if (start == null || end == null) continue;
    if (end <= start && !m[5] && !m[1] && end + 12 * 60 > start && end < 12 * 60) end += 12 * 60; // '10시~1시' → 13시
    if (end <= start || end - start > 12 * 60) continue;
    const fmt = (v) => `${pad(Math.floor(v / 60))}:${pad(v % 60)}`;
    return { start: fmt(start), end: fmt(end) };
  }
  return null;
}

export function toMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function toUTCDate(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUTCDate(dt) {
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function addDays(date, n) {
  const dt = toUTCDate(date);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromUTCDate(dt);
}

export function addMonths(date, n) {
  const dt = toUTCDate(date);
  const day = dt.getUTCDate();
  dt.setUTCDate(1);
  dt.setUTCMonth(dt.getUTCMonth() + n);
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(day, last));
  return fromUTCDate(dt);
}

export function daysBetween(a, b) {
  return Math.round((toUTCDate(b) - toUTCDate(a)) / 86400000);
}

// 0 = 일요일 … 6 = 토요일
export function weekdayOf(date) {
  return toUTCDate(date).getUTCDay();
}

export function weekdayName(date) {
  return WEEKDAY_NAMES[weekdayOf(date)];
}

export function eachDay(start, end, limit = 400) {
  const days = [];
  for (let d = start; d <= end && days.length < limit; d = addDays(d, 1)) days.push(d);
  return days;
}

// '월,화,수,목,금,토' / '월~금' / '매일' → 요일 번호 Set. 해석할 수 없으면 null.
export function parseWeekdays(text) {
  const s = String(text ?? '').replace(/\s+/g, '');
  if (!s) return null;
  if (/매일|전체|월~일/.test(s)) return new Set([0, 1, 2, 3, 4, 5, 6]);
  const set = new Set();
  for (const m of s.matchAll(/([일월화수목금토])~([일월화수목금토])/g)) {
    // 월(1)부터 일(7→0)까지 이어지는 범위를 처리하기 위해 일요일을 7로 본다.
    const from = WEEKDAY_NAMES.indexOf(m[1]) || 7;
    const to = WEEKDAY_NAMES.indexOf(m[2]) || 7;
    for (let i = Math.min(from, to); i <= Math.max(from, to); i++) set.add(i % 7);
  }
  for (const ch of s.replace(/[일월화수목금토]~[일월화수목금토]/g, '')) {
    const i = WEEKDAY_NAMES.indexOf(ch);
    if (i >= 0) set.add(i);
  }
  return set.size ? set : null;
}

// KST 날짜·시각 → iCalendar UTC 형식 'YYYYMMDDTHHMMSSZ'
export function kstToIcsUtc(date, time) {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d, h - 9, mi));
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}00Z`;
}

export function monthGrid(year, month) {
  // month: 1~12. 일요일 시작 6주 고정 그리드.
  const first = `${year}-${pad(month)}-01`;
  const start = addDays(first, -weekdayOf(first));
  return eachDay(start, addDays(start, 41));
}
