const logDiv = document.getElementById('log');
console.log('log.js loaded');
// 新增：获取选中的厂商
function getSelectedVendors() {
    const checkboxes = document.querySelectorAll('.vendor-checkbox');
    const selected = [];
    checkboxes.forEach(cb => { if (cb.checked) selected.push(cb.value); });
    return selected;
}

// 新增：点击开始检测
const startBtn = document.getElementById('start-detect');
if (startBtn) {
    startBtn.addEventListener('click', () => {
        const vendors = getSelectedVendors();
        let vulUrl = prompt('请输入要检测的存储桶URL：');
        if (!vulUrl) {
            addLog('未输入URL，检测取消');
            return;
        }
        chrome.runtime.sendMessage({ type: 'manual-detect', vendors, vulUrl });
        addLog('已发起检测，厂商: ' + (vendors.length ? vendors.join(', ') : '全部'));
    });
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"]|'/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}

// 支持结构化渲染检测结果
function addLogDetail(result) {
    console.log(result)
    const line = document.createElement('div');
    line.className = 'logline';
    line.innerHTML =
        `<b>[${escapeHtml(result.vendor)}] [${escapeHtml(result.type)}]</b><br>` +
        `URL: <span style="color:#2d7be5">${escapeHtml(result.url || '')}</span><br>` +
        (result.statusCode ? `响应码: <span style="color:#e67e22">${escapeHtml(result.statusCode + '')}</span><br>` : '') +
        (result.detail ? `详情: <span>${escapeHtml(result.detail)}</span><br>` : '') +
        `<details><summary>请求/响应</summary><pre style="background:#f4f4f4;padding:6px;">${escapeHtml(result.request || '')}

${escapeHtml(result.response || '')}</pre></details>`;
    logDiv.appendChild(line);
    logDiv.scrollTop = logDiv.scrollHeight;
}

// 兼容原有 addLog
function addLog(msg) {
    // 结构化日志渲染
    if (typeof msg === 'object' && msg.event) {
        if (msg.event === 'detect') {
            addLogDetail(msg);
            return;
        }
        const line = document.createElement('div');
        line.className = 'logline';
        if (msg.event === 'start') {
            line.innerHTML = `<span style='color:#2d7be5'>[检测开始]</span> 目标URL: <b>${escapeHtml(msg.url)}</b>`;
        } else if (msg.event === 'params') {
            line.innerHTML = `<span style='color:#888'>[参数]</span> ACL: <b>${msg.acl ? '检测' : '不检测'}</b> Policy: <b>${msg.policy ? '检测' : '不检测'}</b>`;
        } else if (msg.event === 'vendor-start') {
            line.innerHTML = `<span class='tag tag-vendor'>${escapeHtml(msg.vendor)}</span> <span style='color:#16a085'>开始检测...</span>`;
        } else if (msg.event === 'vendor-result') {
            line.innerHTML = `<span class='tag tag-vendor'>${escapeHtml(msg.vendor)}</span> <span class='tag tag-notfound'>未发现漏洞</span>`;
        } else if (msg.event === 'detect') {
            line.innerHTML = `
                <span class='tag tag-vendor'>${escapeHtml(msg.vendor)}</span>
                <span class='tag tag-type'>${escapeHtml(msg.type)}</span>
                <span class='tag tag-path'>${escapeHtml(msg.path)}</span>
                <span class='tag tag-status'>${escapeHtml((msg.statusCode || '-') + '')}</span>
                <span class='tag tag-found'>发现漏洞</span>
                <span class='tag tag-source' style='${msg.source === '主动' ? 'background:#eaf6ff;color:#2d7be5;' : 'background:#fbeee6;color:#c0392b;'}'>${escapeHtml(msg.source || '未知')}</span>
                ${msg.detail ? `<div style='margin:2px 0 2px 0;'>详情: <span>${escapeHtml(msg.detail)}</span></div>` : ''}
                <details><summary style='cursor:pointer'>请求/响应</summary><pre style='background:#f4f4f4;padding:6px;'>${escapeHtml(msg.request || '')}

${escapeHtml(msg.response || '')}</pre></details>
            `;
        } else if (msg.event === 'finish') {
            line.innerHTML = `<span style='color:#27ae60'>[检测完成]</span>`;
        } else if (msg.event === 'error') {
            line.innerHTML = `<span style='color:#c0392b'>[检测失败]</span> ${escapeHtml(msg.error)} `;
        } else {
            line.textContent = `[${new Date().toLocaleTimeString()}] ` + JSON.stringify(msg);
        }
        logDiv.appendChild(line);
        logDiv.scrollTop = logDiv.scrollHeight;
        return;
    }
    // 兼容原有字符串日志
    const line = document.createElement('div');
    line.className = 'logline';
    line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logDiv.appendChild(line);
    logDiv.scrollTop = logDiv.scrollHeight;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log(message)
    if (message && message.type === 'bucketvul-log') {
        addLog(message.msg);
    }
});

addLog('日志窗口已打开，等待检测...'); 