import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appliedContacts } from '../src/lib/contacts.js';
import { buildVcard } from '../src/lib/vcard.js';

const item = (over) => ({
  source: '1365', id: 'a', title: '복지관 배식 보조', date: '2026-12-03', endDate: '2026-12-03', startTime: '10:00', endTime: '14:00',
  status: '승인', statusKind: 'confirmed', org: '가상복지관', place: '가상복지관 식당', url: 'https://example.test/a',
  detailLoaded: true, contact: { phone: '000-000-0000', address: '가상시 가상로 1' }, ...over,
});

test('같은 공고의 여러 날짜는 연락처 하나로 묶고, 취소·연락처 없음은 뺀다', () => {
  const { contacts, missing, pending } = appliedContacts([
    item({ date: '2026-12-10', endDate: '2026-12-10', status: '접수', statusKind: 'pending' }),
    item({}),
    item({ id: 'b', title: '취소한 봉사', statusKind: 'cancelled' }),
    item({ id: 'c', title: '연락처 없는 봉사', contact: {} }),
    item({ id: 'd', title: '아직 불러오는 봉사', contact: undefined, detailLoaded: false }),
    item({ source: 'vms', id: 'v', title: '나들이 동행', contact: { name: '홍길동', phone: '000-0000-0000', email: 'v@example.org' }, startTime: null, endTime: null }),
  ]);
  assert.equal(missing, 1);
  assert.equal(pending, 1);
  assert.deepEqual(contacts.map((c) => c.name), ['복지관 배식 보조', '나들이 동행']);
  assert.equal(contacts[0].note, '1365 봉사 · 승인, 접수\n일정: 12/3(목) 10:00~14:00, 12/10(목) 10:00~14:00\n장소: 가상복지관 식당');
  assert.equal(contacts[1].title, '담당자 홍길동');
});

test('vCard는 봉사 이름을 연락처 이름으로 쓰고 특수문자를 이스케이프한다', () => {
  const vcf = buildVcard([{ name: '배식, 보조; 봉사', org: '가상복지관', phone: '000-000-0000', email: 'v@example.org', address: '가상시 가상로 1', note: '첫 줄\n둘째 줄', url: 'https://example.test/a' }]);
  assert.match(vcf, /^BEGIN:VCARD\r\nVERSION:3\.0\r\nFN:배식\\, 보조\\; 봉사\r\nN:배식\\, 보조\\; 봉사;;;;\r\n/);
  assert.match(vcf, /TEL;TYPE=WORK,VOICE:000-000-0000\r\n/);
  assert.match(vcf, /EMAIL;TYPE=INTERNET,WORK:v@example\.org\r\n/);
  assert.match(vcf, /ADR;TYPE=WORK:;;가상시 가상로 1;;;;\r\n/);
  assert.match(vcf, /NOTE:첫 줄\\n둘째 줄\r\n/);
  assert.ok(vcf.endsWith('END:VCARD\r\n'));
});
