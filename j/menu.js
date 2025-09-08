/**
 * Created by Liming on 2017/3/22.
 */
import { setEncoding, resetEncoding } from './background.js';
import { getENCODINGS } from './encoding.js';
import { getEncoding } from './utils.js';


const rtl = chrome.i18n.getMessage('@@bidi_dir') === 'rtl' ? '\u{200f}' : '';
const printEncodingInfo = info => `${info[1]} ${rtl}(${info[0]})`;

let selectedMenu;

const menuClicked = async (info, tab) => {
  if (info.menuItemId === 'show_popup') {
    // Show popup near cursor position
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (x, y) => {
        // Create popup iframe at cursor position
        const popup = document.createElement('iframe');
        popup.id = 'charset-popup';
        popup.style.position = 'absolute';
        popup.style.left = `${x}px`;
        popup.style.top = `${y}px`;
        popup.style.width = '300px';
        popup.style.height = '400px';
        popup.style.border = '1px solid #ccc';
        popup.style.borderRadius = '4px';
        popup.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
        popup.style.zIndex = '2147483647';
        popup.src = chrome.runtime.getURL('popup.html');
        
        // Remove existing popup if any
        const existingPopup = document.getElementById('charset-popup');
        if (existingPopup) {
          document.body.removeChild(existingPopup);
        }
        
        document.body.appendChild(popup);
        
        // Close popup when clicking outside
        document.addEventListener('click', function closePopup(e) {
          const popup = document.getElementById('charset-popup');
          if (popup && !popup.contains(e.target)) {
            document.body.removeChild(popup);
            document.removeEventListener('click', closePopup);
          }
        });
      },
      args: [info.x, info.y]
    });
    return;
  }
  
  if (info.wasChecked) {
    return;
  }
  if (info.menuItemId === 'default') {
    resetEncoding(tab.id);
  } else {
    const [{ result: contentType = 'text/html' }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.contentType,
    });
    setEncoding(tab.id, contentType, info.menuItemId);
  }
  await chrome.tabs.reload(tab.id, { bypassCache: true });
};

const updateMenu = tabId => {
  const encoding = getEncoding(tabId)?.encoding || 'default';
  if (selectedMenu === encoding) {
    return;
  }
  chrome.contextMenus.update(selectedMenu, { checked: false });
  chrome.contextMenus.update(encoding, { checked: true });
  selectedMenu = encoding;
};

const tabUpdatedEvent = tabId => updateMenu(tabId);
const tabActivatedEvent = activeInfo => updateMenu(activeInfo.tabId);
const windowsFocusedEvent = () => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs.length === 0) {
      return;
    }
    updateMenu(tabs[0].id);
  });
};

export const createMenu = async () => {
  if (!(await chrome.storage.local.get('configMenu')).configMenu) {
    return;
  }

  // 添加显示弹出窗口的菜单项
  chrome.contextMenus.create({
    id: 'show_popup',
    title: chrome.i18n.getMessage('appName'),
    contexts: ['page', 'selection']
  });
  
  // 添加分隔线
  chrome.contextMenus.create({
    id: 'separator_1',
    type: 'separator',
    contexts: ['page', 'selection']
  });
  
  chrome.contextMenus.create({
    type: 'radio',
    id: 'default',
    title: chrome.i18n.getMessage('default'),
    checked: true,
    contexts: ['page', 'selection']
  });
  selectedMenu = 'default';
  for (const encoding of await getENCODINGS()) {
    if (encoding.length === 1) {
      continue;
    }
    chrome.contextMenus.create({
      type: 'radio',
      id: encoding[0],
      title: printEncodingInfo(encoding),
      checked: false,
      contexts: ['page', 'selection']
    });
  }
  chrome.tabs.onUpdated.addListener(tabUpdatedEvent);
  chrome.tabs.onActivated.addListener(tabActivatedEvent);
  chrome.windows.onFocusChanged.addListener(windowsFocusedEvent);
  chrome.contextMenus.onClicked.addListener(menuClicked);
};

export const removeMenu = () => {
  chrome.contextMenus.removeAll();
  chrome.tabs.onUpdated.removeListener(tabUpdatedEvent);
  chrome.tabs.onActivated.removeListener(tabActivatedEvent);
  chrome.windows.onFocusChanged.removeListener(windowsFocusedEvent);
  chrome.contextMenus.onClicked.removeListener(menuClicked);
  selectedMenu = undefined;
};

// 不在这里直接调用createMenu，而是在background.js的onInstalled事件中调用
// createMenu();
