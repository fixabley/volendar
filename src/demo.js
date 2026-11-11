// 스크린샷·시연용 예시 데이터. app.html?demo 로 열면 사이트에 요청하지 않고 이 데이터만 쓴다.
// 날짜는 오늘 기준으로 만들어서 언제 열어도 이번 달에 일정이 보인다. 기관·장소 이름은 모두 지어낸 것이다.
import { addDays, daysBetween, weekdayOf } from './lib/dates.js';

const compact = (date) => date.replace(/-/g, '');

// 예시 연락처는 실제로 걸리지 않는 번호와 example 도메인만 쓴다
const demoContact = (source) =>
  source === 'vms'
    ? { name: '김봉사', phone: '02-000-0000', email: 'volunteer@example.org' }
    : { phone: '02-000-0000', address: '서울시 새봄구 예시로 1' };
const demoContent = (title) =>
  `${title} 봉사자를 모집합니다.\n\n- 준비물: 편한 복장, 개인 물병\n- 시작 10분 전까지 1층 안내데스크로 와 주세요.\n- 사정이 생기면 미리 연락 부탁드립니다.`;

function applied(o) {
  return {
    kind: 'applied',
    endDate: o.date,
    startTime: null,
    endTime: null,
    url: null,
    detailLoaded: true,
    content: demoContent(o.title),
    contact: demoContact(o.source),
    ...o,
    uid: `${o.source}-demo-${o.id}-${compact(o.date)}`,
  };
}

export function demoApplied(today) {
  const d = (n) => addDays(today, n);
  return {
    1365: [
      applied({ source: '1365', id: 'a1', title: '새봄 어린이도서관 책 정리', date: d(3), startTime: '10:00', endTime: '13:00', status: '승인', statusKind: 'confirmed', place: '새봄 어린이도서관', org: '새봄구 평생교육과' }),
      applied({ source: '1365', id: 'a2', title: '한빛복지관 점심 배식 보조', date: d(5), startTime: '11:00', endTime: '14:00', status: '접수', statusKind: 'pending', place: '한빛종합사회복지관 1층 식당', org: '한빛종합사회복지관' }),
      applied({ source: '1365', id: 'a3', title: '푸른천 플로깅', date: d(8), startTime: '09:00', endTime: '12:00', status: '승인', statusKind: 'confirmed', place: '푸른천 산책로 입구', org: '새봄구 환경과' }),
      applied({ source: '1365', id: 'a4', title: '어르신 스마트폰 교실 도우미', date: d(12), startTime: '13:30', endTime: '16:30', status: '접수', statusKind: 'pending', place: '다온노인복지관 정보화실', org: '다온노인복지관' }),
      applied({ source: '1365', id: 'a5', title: '가을 책 축제 안내 부스', date: d(15), startTime: '10:00', endTime: '16:00', creditCapHours: 4, status: '승인', statusKind: 'confirmed', place: '새봄광장', org: '새봄구 문화체육과' }),
      applied({ source: '1365', id: 'a6', title: '청소년 학습 멘토링', date: d(19), startTime: '18:00', endTime: '20:00', status: '접수', statusKind: 'pending', place: '한빛청소년센터', org: '한빛청소년센터' }),
      applied({ source: '1365', id: 'a7', title: '유기동물 보호소 산책 봉사', date: d(-6), startTime: '10:00', endTime: '12:00', status: '승인', statusKind: 'confirmed', place: '다온 동물보호센터', org: '다온 동물보호센터' }),
    ],
    vms: [
      applied({ source: 'vms', id: 'v1', title: '장애인복지관 가을 나들이 동행', date: d(10), startTime: '09:30', endTime: '12:30', timeGuessed: true, status: '참석가능', statusKind: 'confirmed', place: '푸른장애인복지관', area: '서울', tags: ['대면'] }),
      applied({ source: 'vms', id: 'v2', title: '어린이 영어 동화 녹음 봉사', date: d(-20), endDate: d(40), status: '대기', statusKind: 'pending', area: '서울', tags: ['비대면'] }),
      applied({ source: 'vms', id: 'v3', title: '김장 나눔 행사 보조', date: d(21), endDate: d(22), status: '대기', statusKind: 'pending', place: '한빛종합사회복지관 마당', area: '서울', tags: ['대면'] }),
    ],
  };
}

// 내 캘린더 예시: 화·목 저녁 수업, 월요일 오전 회의, 한 번짜리 약속
export function demoCalendarIcs(today) {
  const monday = addDays(today, -((weekdayOf(today) + 6) % 7));
  const tuesday = addDays(monday, 1);
  const event = (uid, title, lines) => ['BEGIN:VEVENT', `UID:${uid}@demo`, `SUMMARY:${title}`, ...lines, 'END:VEVENT'];
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    ...event('class', '영어 회화 수업', [`DTSTART;TZID=Asia/Seoul:${compact(tuesday)}T190000`, `DTEND;TZID=Asia/Seoul:${compact(tuesday)}T210000`, 'RRULE:FREQ=WEEKLY;BYDAY=TU,TH;COUNT=20']),
    ...event('meeting', '팀 회의', [`DTSTART;TZID=Asia/Seoul:${compact(monday)}T100000`, 'DURATION:PT1H', 'RRULE:FREQ=WEEKLY;COUNT=10']),
    ...event('lunch', '친구 약속', [`DTSTART;TZID=Asia/Seoul:${compact(addDays(today, 6))}T120000`, `DTEND;TZID=Asia/Seoul:${compact(addDays(today, 6))}T150000`]),
    'END:VCALENDAR',
  ].join('\r\n');
}

const ACTIVITIES = [
  ['도서관 서가 정리', '교육', '도서관'],
  ['복지관 배식 보조', '생활편의', '종합사회복지관'],
  ['공원 환경정화', '환경·생태계보호', '근린공원'],
  ['어르신 스마트폰 교실 보조', '교육', '노인복지관'],
  ['지역아동센터 학습 지도', '교육', '지역아동센터'],
  ['축제 안내 부스 운영', '문화·체육·예술·관광', '광장'],
  ['헌 옷 나눔 분류', '생활편의', '나눔가게'],
  ['동물보호센터 봉사', '기타', '동물보호센터'],
  ['장애인 체육대회 보조', '문화·체육·예술·관광', '체육관'],
  ['연탄 나눔', '주거환경', '주민센터'],
  ['하천 플로깅', '환경·생태계보호', '하천 산책로'],
  ['박물관 전시 안내', '문화·체육·예술·관광', '향토박물관'],
];
const SLOTS = [['09:00', '12:00'], ['10:00', '13:00'], ['13:00', '16:00'], ['14:00', '17:00'], ['18:00', '20:00'], ['19:00', '21:00'], ['10:00', '14:00']];
const NAMES = ['새봄', '한빛', '푸른', '다온'];
const DISTRICTS = ['중구', '서구', '동구', '남구'];

// 같은 조건이면 같은 결과가 나오도록 고정 시드를 쓴다
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

// filters: { from, to, sources, keyword, province }
export function demoOpenings(today, filters) {
  const span = Math.max(0, daysBetween(filters.from, filters.to));
  const rnd = seeded(7);
  const province = filters.province || '서울';
  const items = [];
  for (let i = 0; i < 60; i++) {
    const [activity, field, placeType] = ACTIVITIES[i % ACTIVITIES.length];
    const source = i % 3 === 2 ? 'vms' : '1365';
    const name = NAMES[i % NAMES.length];
    const start = addDays(filters.from, Math.floor(rnd() * (span + 1)));
    const [startTime, endTime] = SLOTS[Math.floor(rnd() * SLOTS.length)];
    const kind = rnd();
    const base = {
      uid: `${source}-open-demo-${i}`,
      source,
      kind: 'opening',
      id: `o${i}`,
      title: `${name} ${activity}`,
      status: '모집중',
      statusKind: 'open',
      area: `${province} ${DISTRICTS[i % DISTRICTS.length]}`,
      org: `${name}${placeType}`,
      place: `${name}${placeType}`,
      tags: source === '1365' ? ['시간인증', '오프라인', field] : ['대면'],
      url: null,
      detailLoaded: true,
      content: demoContent(`${name} ${activity}`),
      contact: demoContact(source),
      date: start,
      endDate: start,
      startTime: null,
      endTime: null,
    };
    if (source === '1365') {
      Object.assign(base, { startTime, endTime, creditHours: '최대 4시간' });
      if (kind > 0.7) {
        // 2주짜리 정기 공고: 토요일만 또는 월·수·금
        base.endDate = addDays(start, 13);
        base.weekdays = kind > 0.85 ? new Set([6]) : new Set([1, 3, 5]);
        base.weekdaysText = kind > 0.85 ? '토' : '월,수,금';
      }
    } else if (kind < 0.5) {
      Object.assign(base, { startTime, endTime, timeGuessed: true, cycle: '비정기 [ 1일 ]', count: '2 / 6명' });
    } else if (kind < 0.75) {
      Object.assign(base, { endDate: addDays(start, 2), cycle: '비정기 [ 상담 후 결정 ]', count: '1 / 4명' });
    } else {
      Object.assign(base, { endDate: addDays(start, 45), cycle: '정기 [ 매주 주1회 ]', count: '3 / 10명' });
    }
    items.push(base);
  }
  // 이미 신청한 공고도 하나 섞어서 '✓ 신청함' 표시가 보이게 한다
  const mine = demoApplied(today)[1365][0];
  if (mine.date >= filters.from && mine.date <= filters.to) {
    items.push({ ...mine, uid: '1365-open-demo-mine', kind: 'opening', status: '모집중', statusKind: 'open', tags: ['시간인증', '오프라인', '교육'], area: `${province} 중구` });
  }
  return items.filter(
    (it) => filters.sources.includes(it.source) && (!filters.keyword || it.title.includes(filters.keyword)),
  );
}

export const demoSubAreas = () => DISTRICTS.map((name) => ({ name, c1365: name, cVms: [name] }));
