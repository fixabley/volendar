// 시·도 코드는 두 사이트가 서로 다르다. 1365는 행정기관 코드, VMS는 자체 코드.
// 광주와 전남은 '전남광주'로 통합되어 두 사이트 모두 하나의 코드만 쓴다.
export const PROVINCES = [
  { name: '서울', c1365: '6110000', cVms: '0101' },
  { name: '부산', c1365: '6260000', cVms: '0102' },
  { name: '대구', c1365: '6270000', cVms: '0103' },
  { name: '인천', c1365: '6280000', cVms: '0104' },
  { name: '대전', c1365: '6300000', cVms: '0106' },
  { name: '울산', c1365: '6310000', cVms: '0107' },
  { name: '세종', c1365: '5690000', cVms: '0117' },
  { name: '경기', c1365: '6410000', cVms: '0108' },
  { name: '강원', c1365: '6420000', cVms: '0109' },
  { name: '충북', c1365: '6430000', cVms: '0110' },
  { name: '충남', c1365: '6440000', cVms: '0111' },
  { name: '전북', c1365: '6450000', cVms: '0112' },
  { name: '전남광주', c1365: '6460000', cVms: '0118' },
  { name: '경북', c1365: '6470000', cVms: '0114' },
  { name: '경남', c1365: '6480000', cVms: '0115' },
  { name: '제주', c1365: '6500000', cVms: '0116' },
];

// 1365는 '서구'·'고양시'처럼 시·군·구 이름만, VMS는 '대전광역시 서구'·'경기도 고양시 덕양구'처럼
// 시·도를 붙이고 큰 시는 구 단위로 나눈다. 그래서 VMS 이름에서 시·도를 떼고,
// 1365 이름과 같거나 그 아래 구이면 같은 항목으로 묶는다. 한 항목에 VMS 코드가 여러 개일 수 있다.
export function mergeSubAreas(list1365, listVms) {
  const merged = new Map();
  for (const a of list1365) merged.set(a.name, { name: a.name, c1365: a.code, cVms: [] });
  for (const v of listVms) {
    const short = v.name.split(' ').slice(1).join(' ') || v.name;
    const hit = merged.get(short) ?? [...merged.values()].find((m) => m.c1365 && short.startsWith(`${m.name} `));
    if (hit) hit.cVms.push(v.code);
    else merged.set(short, { name: short, c1365: null, cVms: [v.code] });
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}
