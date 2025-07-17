// 浏览器扩展后台脚本基础模板
// 后续可在此添加事件监听、消息通信等逻辑 
import { detectVendor, detectBucketVul } from '../lib/index.js';

// 漏洞类型常量
const TYPE = {
    TRAVERSABLE: '存储桶可遍历',
    UPLOAD: 'put文件上传',
    ACL_READ: 'ACL可读',
    ACL_WRITE: 'ACL可写',
    POLICY_WRITE: 'policy可写',
};

function getHostFromUrl(url) {
    try {
        // 只返回完整 host，不做后缀归一化，保证不同 bucket 独立
        return new URL(url).host;
    } catch {
        return url;
    }
}

// 被动检测
chrome.webRequest.onCompleted.addListener(
    async (details) => {
        const url = details.url;
        // 跳过扩展自身和非 http/https 请求
        if (!url.startsWith('http://') && !url.startsWith('https://')) return;
        if (details.tabId < 0) return;
        chrome.storage.local.get(['bucketVulHistory', 'flagAcl', 'flagPolicy'], async (res) => {
            let history = res.bucketVulHistory || [];
            const aclFlag = res.flagAcl ?? true;
            const policyFlag = res.flagPolicy ?? true;
            // 只检测未检测过的类型
            const vendor = detectVendor(url);
            const detectedTypes = new Set(
                history
                    .filter(item => getHostFromUrl(item.url) === getHostFromUrl(url) && item.vendor === vendor)
                    .map(item => item.type)
            );
            const resultArr = await detectBucketVul(url, { checkAcl: aclFlag, checkPolicy: policyFlag });
            let newVulFound = false;
            for (const result of resultArr) {
                if (detectedTypes.has(result.type)) continue;
                const newItem = {
                    id: Date.now() + Math.random(),
                    url,
                    type: result.type,
                    vendor: result.vendor,
                    time: Date.now(),
                    request: result.request || '',
                    response: result.response || '',
                    source: '被动'
                };
                history.unshift(newItem);
                newVulFound = true;
            }
            chrome.storage.local.set({ bucketVulHistory: history }, () => {
                if (newVulFound && chrome && chrome.action && chrome.action.setBadgeText) {
                    chrome.action.setBadgeText({ text: '●' });
                    chrome.action.setBadgeBackgroundColor && chrome.action.setBadgeBackgroundColor({ color: '#e74c3c' });
                }
            });
        });
    },
    { urls: ["<all_urls>"] }
);

// 注册右键菜单
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "bucketvul-detect",
        title: "用 BucketTool 检测",
        contexts: ["link", "selection", "page"]
    });
});

// 主动检测日志窗口管理
let logWindowId = null;
function openLogWindow() {
    return new Promise((resolve) => {
        if (logWindowId !== null) {
            // 如果窗口已打开，直接返回
            resolve(logWindowId);
            return;
        }
        chrome.windows.create({
            url: chrome.runtime.getURL('popup/log.html'),
            type: 'popup',
            width: 600,
            height: 500
        }, win => {
            logWindowId = win.id;
            resolve(win.id);
        });
    });
}
function sendLog(msg, result) {
    if (logWindowId) {
        chrome.windows.get(logWindowId, { populate: true }, win => {
            if (win && win.tabs && win.tabs.length > 0) {
                for (const tab of win.tabs) {
                    try {
                        chrome.tabs.sendMessage(tab.id, { type: 'bucketvul-log', msg, result });
                    } catch (e) {
                        // 忽略没有接收端的报错
                    }
                }
            }
        });
    }
}

// 监听日志窗口关闭，重置 logWindowId
chrome.windows.onRemoved.addListener(function (windowId) {
    if (windowId === logWindowId) {
        logWindowId = null;
    }
});

// 右键菜单点击事件只打开日志窗口
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    await openLogWindow();
    sendLog('请在日志窗口中点击“开始检测”发起检测');
});

// 新增：接收 log.html 发来的手动检测请求
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message && message.type === 'manual-detect') {
        let targetUrl = message.vulUrl;
        if (!targetUrl) {
            sendLog('未输入URL，检测取消');
            return;
        }
        await openLogWindow();
        sendLog({ event: 'start', url: targetUrl });
        chrome.storage.local.get(['flagAcl', 'flagPolicy', 'bucketVulHistory'], async (res) => {
            const aclFlag = res.flagAcl ?? true;
            const policyFlag = res.flagPolicy ?? true;
            sendLog({ event: 'params', acl: aclFlag, policy: policyFlag });
            try {
                const vendors = message.vendors && message.vendors.length ? message.vendors : ['aliyun', 'tencent', 'huawei'];
                let history = res.bucketVulHistory || [];
                for (const v of vendors) {
                    let vendorName =
                        v === 'aliyun' ? '阿里云' :
                            v === 'tencent' ? '腾讯云' :
                                v === 'huawei' ? '华为云' :
                                    (v === 'aws' || v === 'amazon' || v === 'amazons3' || v === 'amazonaws' || v === 'AmazonS3') ? 'AmazonS3' : v;
                    sendLog({ event: 'vendor-start', vendor: vendorName });
                    const resultArr = await detectBucketVul(targetUrl, { checkAcl: aclFlag, checkPolicy: policyFlag, vendors: [v] });
                    let foundAny = false;
                    for (const result of resultArr) {
                        let statusCode = undefined;
                        let path = '';
                        if (result.url) {
                            try { path = new URL(result.url).pathname + new URL(result.url).search; } catch { path = result.url; }
                        }
                        if (result.response) {
                            const m = result.response.match(/^HTTP\/1\.1 (\d{3})/);
                            if (m) statusCode = m[1];
                        }
                        sendLog({
                            event: 'detect',
                            vendor: result.vendor,
                            type: result.type,
                            path,
                            statusCode,
                            found: result.found,
                            detail: result.detail || '',
                            request: result.request,
                            response: result.response,
                            source: '主动'
                        });
                        if (result.found) {
                            foundAny = true;
                            // 写入历史
                            const exists = history.some(item =>
                                getHostFromUrl(item.url) === getHostFromUrl(targetUrl) &&
                                item.type === result.type &&
                                item.vendor === result.vendor
                            );
                            if (!exists) {
                                const newItem = {
                                    id: Date.now() + Math.random(),
                                    url: targetUrl,
                                    type: result.type,
                                    vendor: result.vendor,
                                    time: Date.now(),
                                    request: result.request || '',
                                    response: result.response || '',
                                    source: '主动'
                                };
                                history.unshift(newItem);
                            }
                        }
                    }
                    if (!foundAny) {
                        sendLog({ event: 'vendor-result', vendor: vendorName, found: false });
                    }
                }
                chrome.storage.local.set({ bucketVulHistory: history }, () => {
                    if (history.length !== (res.bucketVulHistory || []).length && chrome && chrome.action && chrome.action.setBadgeText) {
                        chrome.action.setBadgeText({ text: '●' });
                        chrome.action.setBadgeBackgroundColor && chrome.action.setBadgeBackgroundColor({ color: '#e74c3c' });
                    }
                });
                sendLog({ event: 'finish' });
            } catch (e) {
                sendLog({ event: 'error', error: e + '' });
            }
        });
    }
    if (message && message.type === 'clear-badge') {
        if (chrome && chrome.action && chrome.action.setBadgeText) {
            chrome.action.setBadgeText({ text: '' });
        }
    }
}); 