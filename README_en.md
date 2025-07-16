# BucketTool

## Project Introduction

BucketTool is a browser extension for detecting common security vulnerabilities in mainstream cloud storage buckets (Aliyun OSS, Tencent COS, Huawei OBS, AWS S3), including bucket listing, unauthorized upload, ACL/Policy misconfiguration, and bucket takeover.

## Features
- One-click detection of common bucket vulnerabilities
- Supports Aliyun, Tencent, Huawei, AWS S3
- Real-time structured detection logs and history
- Red dot notification for new vulnerabilities, with popup history view
- Only active/manual detection outputs detailed logs; passive detection only writes to history

## Supported Cloud Vendors
- Aliyun OSS
- Tencent COS
- Huawei OBS
- AWS S3 (including China region)

## Usage
1. **Install the Extension:**
   - In Chrome/Edge, go to the extensions page (chrome://extensions/), enable Developer Mode, and load this project directory.
2. **Active Detection:**
   - Click the extension icon to open the log window, select vendors, enter the bucket URL, and click "Start Detection".
   - The detection process and results will be displayed in real time in the log window.
3. **Passive Detection:**
   - When browsing, the extension automatically detects cloud bucket URLs in web requests. Vulnerabilities are recorded in history and trigger a red dot notification.

## Main UI Description
- **Log Window:** Shows detailed process and results of active/manual detection.
  ![image-20250716123618070](./imgs/image-20250716123618070.png)
- **History:** Records all real vulnerabilities detected.
  ![image-20250716123534223](./imgs/image-20250716123534223.png)
- **Red Dot Notification:** Shows when new vulnerabilities are found; cleared after viewing the popup/history.

## Notes
- Only public/anonymous-accessible buckets can be detected; private buckets requiring authentication are not supported.
- All detection requests are anonymous and do not use user credentials.
- Results are for security testing and self-assessment only. Do not use for illegal purposes.

---

For suggestions or issues, feel free to open an issue or contact the author. 