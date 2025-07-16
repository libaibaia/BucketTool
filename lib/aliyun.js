// lib/aliyun.js

const TYPE = {
    TRAVERSABLE: '存储桶可遍历',
    UPLOAD: 'PUT文件上传',
    ACL_READ: 'ACL可读',
    ACL_WRITE: 'ACL可写',
    POLICY_WRITE: 'Policy可写',
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
 * 检测阿里云 OSS 桶配置
 * @param {string} url
 * @param {Object} options { checkAcl: boolean, checkPolicy: boolean }
 * @returns {Promise<Array>} 检测结果数组
 */
export async function checkAliyun(url, options = { checkAcl: true, checkPolicy: true }) {
    const results = [];
    const { checkAcl, checkPolicy } = options;
    const listUrl = removeAllParameters(url);

    // 1. 桶可遍历
    let traversableFound = false;
    let traversableReqHeaders = {};
    let traversableReqBody = undefined;
    let traversableResp, traversableText, traversableRespHeaders;
    try {
        traversableResp = await fetch(listUrl, { method: 'GET' });
        traversableText = await traversableResp.text();
        traversableRespHeaders = Object.fromEntries(traversableResp.headers.entries());
        if (
            traversableResp.status >= 200 && traversableResp.status < 300 &&
            traversableText.includes('<ListBucketResult>') && traversableText.includes('<Name>')
        ) {
            traversableFound = true;
        }
    } catch (e) { }
    if (traversableFound) {
        results.push({
            type: TYPE.TRAVERSABLE,
            vendor: '阿里云',
            url: listUrl,
            found: traversableFound,
            request: buildBurpRequest('GET', listUrl, traversableReqHeaders, traversableReqBody),
            response: traversableResp ? buildBurpResponse(traversableResp.status, traversableResp.statusText, traversableRespHeaders, traversableText) : '',
            detail: '存储桶可遍历'
        });
    }

    // 2. 上传文件检测
    let uploadFound = false;
    const fileName = 'testFileByExt.testFileByExt';
    const uploadUrl = listUrl + '/' + fileName;
    let uploadReqHeaders = {};
    let uploadReqBody = 'test fileUpload';
    let uploadResp, uploadRespBody, uploadRespHeaders;
    try {
        uploadResp = await fetch(uploadUrl, {
            method: 'PUT',
            body: uploadReqBody
        });
        uploadRespBody = await uploadResp.text();
        uploadRespHeaders = Object.fromEntries(uploadResp.headers.entries());
        if (uploadResp.status >= 200 && uploadResp.status < 300) {
            uploadFound = true;
        }
    } catch (e) { }
    if (uploadFound) {
        results.push({
            type: TYPE.UPLOAD,
            vendor: '阿里云',
            url: uploadUrl,
            found: uploadFound,
            request: buildBurpRequest('PUT', uploadUrl, uploadReqHeaders, uploadReqBody),
            response: uploadResp ? buildBurpResponse(uploadResp.status, uploadResp.statusText, uploadRespHeaders, uploadRespBody) : '',
            detail: 'PUT文件上传成功'
        });
    }

    // 3. ACL 检查
    if (checkAcl) {
        // ACL可读
        let aclReadFound = false;
        const aclUrl = listUrl + '?acl';
        let aclReadReqHeaders = {};
        let aclReadReqBody = undefined;
        let aclResp, aclRespBody, aclRespHeaders;
        try {
            aclResp = await fetch(aclUrl, { method: 'GET' });
            aclRespBody = await aclResp.text();
            aclRespHeaders = Object.fromEntries(aclResp.headers.entries());
            if (aclResp.status >= 200 && aclResp.status < 300) {
                aclReadFound = true;
            }
        } catch (e) { }
        if (aclReadFound) {
            results.push({
                type: TYPE.ACL_READ,
                vendor: '阿里云',
                url: aclUrl,
                found: aclReadFound,
                request: buildBurpRequest('GET', aclUrl, aclReadReqHeaders, aclReadReqBody),
                response: aclResp ? buildBurpResponse(aclResp.status, aclResp.statusText, aclRespHeaders, aclRespBody) : '',
                detail: 'ACL可读'
            });
        }
        // ACL可写
        let aclWriteFound = false;
        const putAclHeaders = { 'x-oss-object-acl': 'default' };
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
                vendor: '阿里云',
                url: aclUrl,
                found: aclWriteFound,
                request: buildBurpRequest('PUT', aclUrl, putAclHeaders, undefined),
                response: putAclResp ? buildBurpResponse(putAclResp.status, putAclResp.statusText, putAclRespHeaders, putAclRespBody) : '',
                detail: 'ACL可写'
            });
        }
    }

    // 4. Policy 检查
    if (checkPolicy) {
        let policyFound = false;
        const policyUrl = listUrl + '/?policy';
        const policyBody = JSON.stringify({
            Version: '1',
            Statement: [{
                Action: ['oss:PutObject', 'oss:GetObject'],
                Effect: 'Allow',
                Principal: ['1234567890'],
                Resource: ['acs:oss:*:*/*']
            }]
        });
        let policyReqHeaders = {};
        let policyResp, policyRespBody, policyRespHeaders;
        try {
            policyResp = await fetch(policyUrl, {
                method: 'PUT',
                body: policyBody
            });
            policyRespBody = await policyResp.text();
            policyRespHeaders = Object.fromEntries(policyResp.headers.entries());
            if (policyResp.status >= 200 && policyResp.status < 300) {
                policyFound = true;
            }
        } catch (e) { }
        if (policyFound) {
            results.push({
                type: TYPE.POLICY_WRITE,
                vendor: '阿里云',
                url: policyUrl,
                found: policyFound,
                request: buildBurpRequest('PUT', policyUrl, policyReqHeaders, policyBody),
                response: policyResp ? buildBurpResponse(policyResp.status, policyResp.statusText, policyRespHeaders, policyRespBody) : '',
                detail: 'Policy可写'
            });
        }
    }
    //5.桶接管检测
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
            vendor: '阿里云',
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