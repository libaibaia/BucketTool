// popup 弹窗脚本
// 检测历史存储在 chrome.storage.local，格式为 [{id, url, type, vendor, time, request, response}]

const historyList = document.getElementById('history-list');
const noHistory = document.getElementById('no-history');
const clearBtn = document.getElementById('clear-history');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalClose = document.getElementById('modal-close');

// 示例数据
const demoHistory = [
    // {
    //     id: 1,
    //     url: "https://oss-example-bucket.oss-cn-beijing.aliyuncs.com/secret.txt",
    //     type: "未授权读取",
    //     vendor: "阿里云",
    //     time: 1718000000000,
    //     request: `GET /secret.txt HTTP/1.1\nHost: oss-example-bucket.oss-cn-beijing.aliyuncs.com\nUser-Agent: Mozilla/5.0 ...`,
    //     response: `HTTP/1.1 200 OK\nContent-Type: text/plain\n\nsecret=flag{example}`
    // },
    // {
    //     id: 2,
    //     url: "https://mybucket-1250000000.cos.ap-shanghai.myqcloud.com/test.jpg",
    //     type: "ACL过宽",
    //     vendor: "腾讯云",
    //     time: 1718003600000,
    //     request: `GET /test.jpg HTTP/1.1\nHost: mybucket-1250000000.cos.ap-shanghai.myqcloud.com\nUser-Agent: Mozilla/5.0 ...`,
    //     response: `HTTP/1.1 200 OK\nContent-Type: image/jpeg\n\xff\xd8\xff...`
    // },
    // {
    //     id: 3,
    //     url: "https://obs-bucket.obs.cn-north-4.myhuaweicloud.com/config.json",
    //     type: "未授权写入",
    //     vendor: "华为云",
    //     time: 1718007200000,
    //     request: `PUT /config.json HTTP/1.1\nHost: obs-bucket.obs.cn-north-4.myhuaweicloud.com\nContent-Type: application/json\n\n{"test":true}`,
    //     response: `HTTP/1.1 204 No Content\n\n`
    // }
];

// 加载历史
function loadHistory() {
    chrome.storage.local.get(['bucketVulHistory'], (result) => {
        let history = result.bucketVulHistory || [];
        if (!history.length) {
            // 没有历史时自动写入示例数据
            chrome.storage.local.set({ bucketVulHistory: demoHistory }, () => {
                renderHistory(demoHistory);
            });
        } else {
            renderHistory(history);
        }
    });
}

// 渲染历史
function renderHistory(history) {
    currentHistory = history; // 渲染时同步缓存
    historyList.innerHTML = '';
    if (!history.length) {
        noHistory.style.display = 'block';
        // 没有漏洞时移除红点
        if (chrome && chrome.action && chrome.action.setBadgeText) {
            chrome.action.setBadgeText({ text: '' });
        }
        return;
    }
    noHistory.style.display = 'none';
    // 有漏洞时不再设置红点，由检测逻辑控制
    history.forEach((item, idx) => {
        const li = document.createElement('li');
        li.className = 'history-item';
        li.innerHTML = `
      <span class="seq">${idx + 1}</span>
      <span class="host" title="${escapeHtml(getHost(item))}">${escapeHtml(getHost(item))}</span>
      <span class="type">${escapeHtml(item.type || '未知类型')}</span>
      <span class="vendor">${escapeHtml(item.vendor || '未知厂商')}</span>
      <span class="time">${formatTime(item.time)}</span>
      <span class="source-tag" style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;margin-left:6px;${item.source === '主动' ? 'background:#eaf6ff;color:#2d7be5;' : 'background:#fbeee6;color:#c0392b;'}">${item.source || '未知'}</span>
      <button class="reqresp-btn" data-idx="${idx}">展示细节</button>
      <button class="delete-btn" title="删除" data-id="${item.id}">✕</button>
    `;
        historyList.appendChild(li);
    });
}

function updateReqRespScroll() {
    const expanded = document.querySelectorAll('.reqresp-row');
    const list = document.getElementById('history-list');
    if (expanded.length >= 3) {
        list.classList.add('show-scroll');
    } else {
        list.classList.remove('show-scroll');
    }
}

// 修改展开/收起逻辑，插入/移除时都调用 updateReqRespScroll
historyList.addEventListener('click', (e) => {
    if (e.target.classList.contains('delete-btn')) {
        const id = e.target.getAttribute('data-id');
        chrome.storage.local.get(['bucketVulHistory'], (result) => {
            let history = result.bucketVulHistory || [];
            history = history.filter(item => String(item.id) !== String(id));
            chrome.storage.local.set({ bucketVulHistory: history }, loadHistory);
        });
    }
    if (e.target.classList.contains('reqresp-btn')) {
        const idx = e.target.getAttribute('data-idx');
        const item = currentHistory[idx];
        let next = e.target.parentElement.nextElementSibling;
        if (next && next.classList.contains('reqresp-row')) {
            next.remove();
            updateReqRespScroll();
            return;
        }
        const row = document.createElement('li');
        row.className = 'reqresp-row';
        row.innerHTML = `
          <div class="reqresp-flex">
            <div class="reqresp-block">
              <div class="reqresp-title-row"><span class="reqresp-title">请求</span><button class="copy-btn" data-type="request" data-idx="${idx}">复制</button></div>
              <pre class="reqresp-pre">${escapeHtml(item.request || '(无内容)')}</pre>
            </div>
            <div class="reqresp-block">
              <div class="reqresp-title-row"><span class="reqresp-title">响应</span><button class="copy-btn" data-type="response" data-idx="${idx}">复制</button></div>
              <pre class="reqresp-pre">${escapeHtml(item.response || '(无内容)')}</pre>
            </div>
          </div>
        `;
        e.target.parentElement.after(row);
        updateReqRespScroll();
    }
    if (e.target.classList.contains('copy-btn')) {
        const idx = e.target.getAttribute('data-idx');
        const type = e.target.getAttribute('data-type');
        const item = currentHistory[idx];
        const text = type === 'request' ? item.request : item.response;
        navigator.clipboard.writeText(text || '').then(() => {
            e.target.textContent = '已复制!';
            setTimeout(() => { e.target.textContent = '复制'; }, 1200);
        });
    }
    // 每次点击后都检查滚动条
    updateReqRespScroll();
});

function getHistoryByIdxAsync(idx, field, cb) {
    chrome.storage.local.get(['bucketVulHistory'], (result) => {
        let history = result.bucketVulHistory;
        // 如果没有数据，优先用 demoHistory
        if (!history || !history.length) history = demoHistory;
        const val = history[idx] && history[idx][field] ? history[idx][field] : '(无内容)';
        cb(val);
    });
}

function getHost(item) {
    try {
        const host = new URL(item.url).host;
        // 去掉云厂商后缀
        return host
            .replace(/\.oss(-[a-z0-9-]+)?\.aliyuncs\.com$/, '')
            .replace(/\.cos(-[a-z0-9-]+)?\.myqcloud\.com$/, '')
            .replace(/\.obs\.[a-z0-9-]+\.myhuaweicloud\.com$/, '');
    } catch {
        return item.url || '';
    }
}

// 弹窗相关
function showModal(title, body) {
    modalTitle.textContent = title;
    modalBody.textContent = body;
    modal.style.display = 'flex';
    // 添加复制按钮
    addCopyButton();
}

function addCopyButton() {
    let oldBtn = document.getElementById('copy-btn');
    if (oldBtn) oldBtn.remove();
    const btn = document.createElement('button');
    btn.id = 'copy-btn';
    btn.textContent = '复制';
    btn.style = 'position:absolute;right:60px;top:10px;padding:2px 10px;font-size:13px;cursor:pointer;';
    btn.onclick = function () {
        navigator.clipboard.writeText(modalBody.textContent).then(() => {
            btn.textContent = '已复制!';
            setTimeout(() => { btn.textContent = '复制'; }, 1200);
        });
    };
    modal.querySelector('.modal-content').appendChild(btn);
}
modalClose.onclick = function () {
    modal.style.display = 'none';
};
window.onclick = function (event) {
    if (event.target === modal) {
        modal.style.display = 'none';
    }
};

// 清空全部
clearBtn.addEventListener('click', () => {
    if (confirm('确定要清空所有检测历史吗？')) {
        chrome.storage.local.set({ bucketVulHistory: [] }, loadHistory);
    }
});

// 工具函数
function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleString();
}
function escapeHtml(str) {
    return String(str).replace(/[&<>"']|'/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[s]));
}
function ellipsisUrl(url) {
    if (!url) return '';
    const max = 22;
    if (url.length <= max) return escapeHtml(url);
    return escapeHtml(url.slice(0, max - 3)) + '...';
}

// 初始化
function clearBadge() {
    if (chrome && chrome.action && chrome.action.setBadgeText) {
        chrome.action.setBadgeText({ text: '' });
    }
}

window.addEventListener('DOMContentLoaded', () => {
    // 直接清除 badge，兼容所有场景
    if (chrome && chrome.action && chrome.action.setBadgeText) {
        chrome.action.setBadgeText({ text: '' });
    }
    loadHistory();
    // 仍保留向 background 发送 clear-badge 消息，兼容 service worker
    if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'clear-badge' });
    }
}); 