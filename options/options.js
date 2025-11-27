const input = document.getElementById('blacklist-input');
const addBtn = document.getElementById('blacklist-add');
const listEl = document.getElementById('blacklist-list');

function normalizeEntry(str) {
    const s = String(str || '').trim();
    if (!s) return '';
    try {
        const u = new URL(s);
        return u.host.toLowerCase();
    } catch {
        return s.toLowerCase();
    }
}

function render(list) {
    listEl.innerHTML = '';
    (list || []).forEach((item, idx) => {
        const li = document.createElement('li');
        li.style = 'display:flex;align-items:center;justify-content:space-between;background:#f8f9fa;margin:6px 0;padding:6px 10px;border-radius:6px;';
        li.innerHTML = `<span>${item}</span><button data-idx="${idx}" class="del-btn" style="padding:4px 10px;">删除</button>`;
        listEl.appendChild(li);
    });
}

function load() {
    chrome.storage.local.get(['detectBlacklist'], (res) => {
        render(res.detectBlacklist || []);
    });
}

function save(list) {
    chrome.storage.local.set({ detectBlacklist: list }, () => {});
}

addBtn.addEventListener('click', () => {
    const v = normalizeEntry(input.value);
    if (!v) return;
    chrome.storage.local.get(['detectBlacklist'], (res) => {
        const cur = (res.detectBlacklist || []).slice();
        if (!cur.includes(v)) cur.push(v);
        save(cur);
        render(cur);
        input.value = '';
    });
});

listEl.addEventListener('click', (e) => {
    if (e.target.classList.contains('del-btn')) {
        const idx = Number(e.target.getAttribute('data-idx'));
        chrome.storage.local.get(['detectBlacklist'], (res) => {
            const cur = (res.detectBlacklist || []).slice();
            if (idx >= 0 && idx < cur.length) cur.splice(idx, 1);
            save(cur);
            render(cur);
        });
    }
});

document.addEventListener('DOMContentLoaded', load);
