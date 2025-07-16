// lib/huawei.js

const TYPE = {
    TRAVERSABLE: '存储桶可遍历',
    UPLOAD: 'PUT文件上传',
    ACL_READ: 'ACL可读',
    ACL_WRITE: 'ACL可写',
};

function buildBurpRequest(method, url, headers, body) {
    const u = new URL(url);
    let req = `${method} ${u.pathname}${u.search} HTTP/1.1\r\n`;
    req += `Host: ${u.host}\r\n`;
    for (const [k, v] of Object.entries(headers || {})) {
        if (k.toLowerCase() !== 'host') req += `${k}: ${v}\r\n`;
    }
    req += '\r\n';
    if (body) req += body;
    return req;
}

function buildBurpResponse(status, statusText, headers, body) {
    let resp = `HTTP/1.1 ${status} ${statusText}\r\n`;
    for (const [k, v] of Object.entries(headers || {})) {
        resp += `${k}: ${v}\r\n`;
    }
    resp += '\r\n';
    if (body) resp += body;
    return resp;
}

/**
 * 检测华为云 OBS 桶配置
 * @param {string} url
 * @param {Object} options { checkAcl: boolean }
 * @returns {Promise<Array>} 检测结果数组
 */
export async function checkHuawei(url, options = { checkAcl: true }) {
    const results = [];
    const { checkAcl } = options;
    const listUrl = removeAllParameters(url);

    // 1. PUT文件上传
    let uploadFound = false;
    const uploadUrl = listUrl + '/testFileByExt.testFileByExt';
    const reqHeaders = {};
    const reqBody = 'test';
    let uploadResp, respBody, uploadRespHeaders;
    try {
        uploadResp = await fetch(uploadUrl, {
            method: 'PUT',
            body: reqBody
        });
        respBody = await uploadResp.text();
        uploadRespHeaders = Object.fromEntries(uploadResp.headers.entries());
        if (uploadResp.status >= 200 && uploadResp.status < 300) {
            uploadFound = true;
        }
    } catch (e) { }
    if (uploadFound) {
        results.push({
            type: TYPE.UPLOAD,
            vendor: '华为云',
            url: uploadUrl,
            found: uploadFound,
            request: buildBurpRequest('PUT', uploadUrl, reqHeaders, reqBody),
            response: uploadResp ? buildBurpResponse(uploadResp.status, uploadResp.statusText, uploadRespHeaders, respBody) : '',
            detail: 'PUT文件上传成功'
        });
    }

    // 2. 桶可遍历
    let traverseFound = false;
    let getResp, getText, respHeaders;
    try {
        getResp = await fetch(listUrl, { method: 'GET' });
        getText = await getResp.text();
        respHeaders = Object.fromEntries(getResp.headers.entries());
        if (
            getResp.status >= 200 && getResp.status < 300 &&
            getText.includes('<Name>') && getText.includes('<Contents>')
        ) {
            traverseFound = true;
        }
    } catch (e) { }
    if (traverseFound) {
        results.push({
            type: TYPE.TRAVERSABLE,
            vendor: '华为云',
            url: listUrl,
            found: traverseFound,
            request: buildBurpRequest('GET', listUrl, {}, undefined),
            response: getResp ? buildBurpResponse(getResp.status, getResp.statusText, respHeaders, getText) : '',
            detail: '存储桶可遍历'
        });
    }

    // 3. ACL可读/可写
    if (checkAcl) {
        // ACL可读
        let aclReadFound = false;
        const aclUrl = listUrl + '/?acl';
        let aclResp, aclText, aclRespHeaders;
        try {
            aclResp = await fetch(aclUrl, { method: 'GET' });
            aclText = await aclResp.text();
            aclRespHeaders = Object.fromEntries(aclResp.headers.entries());
            if (
                aclResp.status >= 200 && aclResp.status < 300 &&
                aclText.includes('<Owner>') && aclText.includes('<AccessControlList>')
            ) {
                aclReadFound = true;
            }
        } catch (e) { }
        if (aclReadFound) {
            results.push({
                type: TYPE.ACL_READ,
                vendor: '华为云',
                url: aclUrl,
                found: aclReadFound,
                request: buildBurpRequest('GET', aclUrl, {}, undefined),
                response: aclResp ? buildBurpResponse(aclResp.status, aclResp.statusText, aclRespHeaders, aclText) : '',
                detail: 'ACL可读'
            });
        }
        // ACL可写
        let aclWriteFound = false;
        const putAclHeaders = { 'x-obs-acl': 'public-read-write-delivered' };
        let putAclResp, putAclRespBody, putAclRespHeaders;
        try {
            putAclResp = await fetch(aclUrl, {
                method: 'PUT',
                headers: putAclHeaders
            });
            putAclRespBody = await putAclResp.text();
            putAclRespHeaders = Object.fromEntries(putAclResp.headers.entries());
            if (putAclResp.status >= 200 && putAclResp.status < 300) {
                aclWriteFound = true;
            }
        } catch (e) { }
        if (aclWriteFound) {
            results.push({
                type: TYPE.ACL_WRITE,
                vendor: '华为云',
                url: aclUrl,
                found: aclWriteFound,
                request: buildBurpRequest('PUT', aclUrl, putAclHeaders, undefined),
                response: putAclResp ? buildBurpResponse(putAclResp.status, putAclResp.statusText, putAclRespHeaders, putAclRespBody) : '',
                detail: 'ACL可写'
            });
        }
    }

    return results;
}

// 工具函数：去除所有参数
function removeAllParameters(url) {
    try {
        const u = new URL(url);
        u.search = '';
        return u.toString();
    } catch {
        return url;
    }
} 