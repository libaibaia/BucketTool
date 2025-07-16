// lib/aws.js

const TYPE = {
    TRAVERSABLE: '存储桶可遍历',
    UPLOAD: 'PUT文件上传',
    DELETE: 'DELETE文件删除',
    ACL_READ: 'ACL可读',
    ACL_WRITE: 'ACL可写',
    BUCKET_TAKEOVER: '桶接管', // 新增桶接管类型
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
 * 检测 AWS S3 桶配置
 * @param {string} url
 * @param {Object} options
 * @returns {Promise<Array>} 检测结果数组
 */
export async function checkAWS(url, options = {}) {
    const results = [];
    const listUrl = removeAllParameters(url);

    // 1. 桶可遍历
    let traverseFound = false;
    let traverseReq = buildBurpRequest('GET', listUrl + '?list-type=2', {}, undefined);
    let traverseResp, traverseRespText, traverseRespStatus, traverseRespStatusText, traverseRespHeaders;
    try {
        traverseResp = await fetch(listUrl + '?list-type=2', { method: 'GET' });
        traverseRespText = await traverseResp.text();
        traverseRespStatus = traverseResp.status;
        traverseRespStatusText = traverseResp.statusText;
        traverseRespHeaders = Object.fromEntries(traverseResp.headers.entries());
        if (
            traverseResp.status >= 200 && traverseResp.status < 300 &&
            traverseRespText.includes('<ListBucketResult') && traverseRespText.includes('<Name>')
        ) {
            traverseFound = true;
        }
    } catch (e) { }
    if (traverseFound) {
        results.push({
            type: TYPE.TRAVERSABLE,
            vendor: 'AmazonS3',
            url: listUrl,
            found: traverseFound,
            request: traverseReq,
            response: traverseResp ? buildBurpResponse(traverseRespStatus, traverseRespStatusText, traverseRespHeaders, traverseRespText) : '',
            detail: '存储桶可遍历'
        });
    }

    // 2. 匿名上传
    let uploadFound = false;
    let uploadUrl = listUrl + '/testFileByExt.txt';
    let uploadReq = buildBurpRequest('PUT', uploadUrl, {}, 'test fileUpload');
    let uploadResp, uploadRespText, uploadRespStatus, uploadRespStatusText, uploadRespHeaders;
    try {
        uploadResp = await fetch(uploadUrl, {
            method: 'PUT',
            body: 'test fileUpload'
        });
        uploadRespText = await uploadResp.text();
        uploadRespStatus = uploadResp.status;
        uploadRespStatusText = uploadResp.statusText;
        uploadRespHeaders = Object.fromEntries(uploadResp.headers.entries());
        if (uploadResp.status >= 200 && uploadResp.status < 300) {
            uploadFound = true;
        }
    } catch (e) { }
    if (uploadFound) {
        results.push({
            type: TYPE.UPLOAD,
            vendor: 'AmazonS3',
            url: uploadUrl,
            found: uploadFound,
            request: uploadReq,
            response: uploadResp ? buildBurpResponse(uploadRespStatus, uploadRespStatusText, uploadRespHeaders, uploadRespText) : '',
            detail: 'PUT文件上传成功'
        });
    }

    // 3. 匿名删除
    let deleteFound = false;
    let delUrl = listUrl + '/testFileByExt.txt';
    let delReq = buildBurpRequest('DELETE', delUrl, {}, undefined);
    let delResp, delRespText, delRespStatus, delRespStatusText, delRespHeaders;
    try {
        delResp = await fetch(delUrl, { method: 'DELETE' });
        delRespText = await delResp.text();
        delRespStatus = delResp.status;
        delRespStatusText = delResp.statusText;
        delRespHeaders = Object.fromEntries(delResp.headers.entries());
        if (delResp.status >= 200 && delResp.status < 300) {
            deleteFound = true;
        }
    } catch (e) { }
    if (deleteFound) {
        results.push({
            type: TYPE.DELETE,
            vendor: 'AmazonS3',
            url: delUrl,
            found: deleteFound,
            request: delReq,
            response: delResp ? buildBurpResponse(delRespStatus, delRespStatusText, delRespHeaders, delRespText) : '',
            detail: 'DELETE文件删除成功'
        });
    }

    // 4. ACL 可读
    let aclReadFound = false;
    let aclUrl = listUrl + '?acl';
    let aclReadReq = buildBurpRequest('GET', aclUrl, {}, undefined);
    let aclResp, aclReadRespText, aclReadRespStatus, aclReadRespStatusText, aclReadRespHeaders;
    try {
        aclResp = await fetch(aclUrl, { method: 'GET' });
        aclReadRespText = await aclResp.text();
        aclReadRespStatus = aclResp.status;
        aclReadRespStatusText = aclResp.statusText;
        aclReadRespHeaders = Object.fromEntries(aclResp.headers.entries());
        if (aclResp.status >= 200 && aclResp.status < 300 && aclReadRespText.includes('<AccessControlPolicy>')) {
            aclReadFound = true;
        }
    } catch (e) { }
    if (aclReadFound) {
        results.push({
            type: TYPE.ACL_READ,
            vendor: 'AmazonS3',
            url: aclUrl,
            found: aclReadFound,
            request: aclReadReq,
            response: aclResp ? buildBurpResponse(aclReadRespStatus, aclReadRespStatusText, aclReadRespHeaders, aclReadRespText) : '',
            detail: 'ACL可读'
        });
    }

    // 5. ACL 可写
    let aclWriteFound = false;
    let aclWriteReq = buildBurpRequest('PUT', aclUrl, { 'x-amz-acl': 'public-read-write' }, undefined);
    let putAclResp, aclWriteRespText, aclWriteRespStatus, aclWriteRespStatusText, aclWriteRespHeaders;
    try {
        const putAclHeaders = { 'x-amz-acl': 'public-read-write' };
        putAclResp = await fetch(aclUrl, {
            method: 'PUT',
            headers: putAclHeaders
        });
        aclWriteRespText = await putAclResp.text();
        aclWriteRespStatus = putAclResp.status;
        aclWriteRespStatusText = putAclResp.statusText;
        aclWriteRespHeaders = Object.fromEntries(putAclResp.headers.entries());
        if (putAclResp.status >= 200 && putAclResp.status < 300) {
            aclWriteFound = true;
        }
    } catch (e) { }
    if (aclWriteFound) {
        results.push({
            type: TYPE.ACL_WRITE,
            vendor: 'AmazonS3',
            url: aclUrl,
            found: aclWriteFound,
            request: aclWriteReq,
            response: putAclResp ? buildBurpResponse(aclWriteRespStatus, aclWriteRespStatusText, aclWriteRespHeaders, aclWriteRespText) : '',
            detail: 'ACL可写'
        });
    }
    // 6.桶接管
    let takeoverFound = false;
    let takeoverResp, takeoverText, takeoverRespHeaders;
    try {
        takeoverResp = await fetch(listUrl, { method: 'GET' });
        takeoverText = await takeoverResp.text();
        takeoverRespHeaders = Object.fromEntries(takeoverResp.headers.entries());
        if (takeoverText && takeoverText.includes('<Code>NoSuchBucket</Code>')) {
            takeoverFound = true;
        }
    } catch (e) { }
    if (takeoverFound) {
        results.push({
            type: TYPE.BUCKET_TAKEOVER,
            vendor: 'AmazonS3',
            url: listUrl,
            found: takeoverFound,
            request: buildBurpRequest('GET', listUrl, {}, undefined),
            response: takeoverResp ? buildBurpResponse(takeoverResp.status, takeoverResp.statusText, takeoverRespHeaders, takeoverText) : '',
            detail: '存在桶接管风险'
        });
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