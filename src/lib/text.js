// 공고 본문처럼 줄바꿈이 의미 있는 영역의 글자를 읽는다. <br>과 블록 요소는 줄바꿈으로 바꾼다.
const BLOCK = new Set(['P', 'DIV', 'LI', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'TABLE']);

export function multilineText(el, { skip = () => false } = {}) {
  if (!el) return '';
  let out = '';
  const walk = (node) => {
    if (node.nodeType === 3) {
      out += node.textContent;
      return;
    }
    if (node.nodeType !== 1 || skip(node)) return;
    if (node.tagName === 'BR') {
      out += '\n';
      return;
    }
    for (const child of node.childNodes) walk(child);
    if (BLOCK.has(node.tagName)) out += '\n';
  };
  for (const child of el.childNodes) walk(child);
  return out
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
