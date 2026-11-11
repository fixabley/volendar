// 신청한 봉사의 담당 기관 연락처를 공고별로 묶는다. 연락처 이름은 봉사활동 이름이다.
import { weekdayName } from './dates.js';

const LABEL = { 1365: '1365', vms: 'VMS' };
const short = (date) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}(${weekdayName(date)})`;

function scheduleText(item) {
  const time = item.startTime ? ` ${item.startTime}~${item.endTime}` : '';
  return item.endDate && item.endDate !== item.date ? `${short(item.date)}~${short(item.endDate)}${time}` : `${short(item.date)}${time}`;
}

// → { contacts: buildVcard 입력[], missing: 연락처 없는 공고 수, pending: 아직 상세를 못 불러온 공고 수 }
export function appliedContacts(items) {
  const groups = new Map();
  for (const it of items) {
    if (it.statusKind === 'cancelled') continue;
    const key = `${it.source}:${it.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  const contacts = [];
  let missing = 0;
  let pending = 0;
  for (const list of groups.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    const it = list[0];
    const c = it.contact ?? {};
    if (!c.phone && !c.email) {
      if (!it.detailLoaded && !it.detailFailed) pending++;
      else missing++;
      continue;
    }
    contacts.push({
      name: it.title,
      org: it.org,
      title: c.name ? `담당자 ${c.name}` : '',
      phone: c.phone,
      email: c.email,
      address: c.address || it.place,
      url: it.url,
      note: [
        `${LABEL[it.source]} 봉사 · ${[...new Set(list.map((x) => x.status).filter(Boolean))].join(', ')}`,
        `일정: ${list.map(scheduleText).join(', ')}`,
        it.place && `장소: ${it.place}`,
      ].filter(Boolean).join('\n'),
    });
  }
  return { contacts, missing, pending };
}
