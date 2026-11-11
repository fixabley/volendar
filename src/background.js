// 확장 아이콘을 누르면 달력 탭을 연다. 이미 열려 있으면 그 탭으로 이동한다.
const APP_URL = chrome.runtime.getURL('src/app.html');

chrome.action.onClicked.addListener(async () => {
  const [existing] = await chrome.runtime.getContexts({ contextTypes: ['TAB'], documentUrls: [APP_URL] });
  if (existing && existing.tabId >= 0) {
    const tab = await chrome.tabs.update(existing.tabId, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: APP_URL });
  }
});
