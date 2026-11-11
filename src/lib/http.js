// 확장 페이지에서 두 사이트로 보내는 요청. 확장은 host_permissions가 있어 사이트 쿠키(로그인 세션)가 함께 실린다.
// 브라우저 설정 때문에 쿠키가 안 실려 로그아웃 응답이 오면, 열려 있는 그 사이트 탭 안에서 같은 요청을 한 번 더 보낸다.

function createLimiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || queue.length === 0) return;
    active++;
    const { task, resolve, reject } = queue.shift();
    task().then(resolve, reject).finally(() => {
      active--;
      next();
    });
  };
  return (task) => new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    next();
  });
}

function toInit({ method = 'GET', form } = {}) {
  const init = { method, credentials: 'include', headers: {} };
  if (form) {
    init.headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
    init.body = new URLSearchParams(form).toString();
  }
  return init;
}

async function fetchInSiteTab(origin, url, init) {
  if (typeof chrome === 'undefined' || !chrome.scripting) return null;
  const tabs = await chrome.tabs.query({ url: `${origin}/*` });
  const tab = tabs.find((t) => !t.discarded) ?? tabs[0];
  if (!tab) return null;
  const [res] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: async (u, i) => (await fetch(u, i)).text(),
    args: [url, init],
  });
  return res?.result ?? null;
}

export function createHttp({
  fetchImpl = (...args) => fetch(...args),
  parseHtml = (html) => new DOMParser().parseFromString(html, 'text/html'),
  maxConcurrent = 3,
} = {}) {
  const limit = createLimiter(maxConcurrent);

  const text = (url, opts) =>
    limit(async () => {
      const res = await fetchImpl(url, toInit(opts)).catch(() => {
        throw new Error(`${new URL(url).host}에 연결하지 못했습니다`);
      });
      if (!res.ok) throw new Error(`${new URL(url).host} 응답 오류 (${res.status})`);
      return res.text();
    });

  return {
    text,
    async doc(url, opts = {}) {
      const doc = parseHtml(await text(url, opts));
      if (opts.isLoggedOut?.(doc) && opts.origin) {
        const html = await limit(() => fetchInSiteTab(opts.origin, url, toInit(opts))).catch(() => null);
        if (html) return parseHtml(html);
      }
      return doc;
    },
    async json(url, opts) {
      return JSON.parse(await text(url, opts));
    },
  };
}
