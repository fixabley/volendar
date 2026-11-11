// 봉사 공고의 담당 기관 연락처를 vCard(.vcf)로 만든다. 휴대폰·Google 주소록 호환을 위해 3.0을 쓴다.
import { escapeText, fold } from './ics.js';

const CRLF = '\r\n';

// contact: { name, title, org, phone, email, address, note, url }
// name이 연락처 이름이 된다(봉사활동 이름). 담당자 이름은 직함 칸에 넣는다.
export function buildVcard(contacts) {
  const lines = [];
  for (const c of contacts) {
    lines.push('BEGIN:VCARD', 'VERSION:3.0');
    lines.push(`FN:${escapeText(c.name)}`);
    lines.push(`N:${escapeText(c.name)};;;;`);
    if (c.org) lines.push(`ORG:${escapeText(c.org)}`);
    if (c.title) lines.push(`TITLE:${escapeText(c.title)}`);
    if (c.phone) lines.push(`TEL;TYPE=WORK,VOICE:${c.phone}`);
    if (c.email) lines.push(`EMAIL;TYPE=INTERNET,WORK:${c.email}`);
    if (c.address) lines.push(`ADR;TYPE=WORK:;;${escapeText(c.address)};;;;`);
    if (c.url) lines.push(`URL:${c.url}`);
    if (c.note) lines.push(`NOTE:${escapeText(c.note)}`);
    lines.push('END:VCARD');
  }
  return lines.map(fold).join(CRLF) + CRLF;
}
