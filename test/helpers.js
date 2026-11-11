import { readFileSync } from 'node:fs';
import { DOMParser } from 'linkedom';

export const parseHtml = (html) => new DOMParser().parseFromString(html, 'text/html');
export const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
export const fixtureDoc = (name) => parseHtml(fixture(name));

// 실제 네트워크 대신 URL·요청 본문을 보고 픽스처를 돌려주는 가짜 http
export function fakeHttp(route) {
  const calls = [];
  return {
    calls,
    async doc(url, opts = {}) {
      calls.push({ url, ...opts });
      return parseHtml(route(url, opts));
    },
    async json(url, opts = {}) {
      calls.push({ url, ...opts });
      return JSON.parse(route(url, opts));
    },
  };
}
