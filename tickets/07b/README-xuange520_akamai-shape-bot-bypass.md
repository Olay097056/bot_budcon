# 🛡️ Akamai Bot Manager Bypass API & SDK (2026 Latest)

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Status](https://img.shields.io/badge/status-Active-success.svg)
![Akamai](https://img.shields.io/badge/Akamai-v2%20%7C%20v3-orange.svg)
![Shape](https://img.shields.io/badge/Shape%20Security-Supported-red.svg)

> **🚀 The most stable and cost-effective REST API for bypassing Akamai Bot Manager and Shape Security (F5). Generate valid `_abck` cookies (with `~0~` status), `sensor_data` payloads, and device fingerprints in milliseconds.**

---

## 🌟 Key Features

- **Akamai v2 / v3 Solver**: Fully bypass Akamai Bot Manager. Automatically generates `sensor_data` and returns a validated `_abck` cookie with the `~0~` validation marker.
- **Shape Security (F5) Solver**: Deep protocol-level decryption for Shape's heavily obfuscated telemetry.
- **100% Protocol Based**: We do not use slow browser automation (Puppeteer/Playwright) farms. Our solvers run on raw protocol and AST reverse engineering, ensuring **sub-100ms** response times.
- **No Headless Browsers Required**: Keep your scraper lightweight. Just POST to our API and get the cookies/tokens you need.
- **Pay as You Go**: Transparent pricing based ONLY on successful requests. Starting at **$2.00 / 1K requests** - Premium stability at fair market rates.

## 📦 What can you scrape with this?
- Airlines (ANA, Peach, etc.)
- E-commerce & Sneaker sites
- Pokemon / Gaming portals
- Any site protected by Akamai or Shape Security.

---

## 🚀 Quick Start / Usage

### 1. Request an API Key & Endpoint
To protect our bypass infrastructure from abuse and security scanners, our API operates on a **Private Access / Invite-Only** model. We do not expose public endpoints.
- Contact us via Telegram `@Jay_Star666` to undergo a quick vetting process. Approved clients receive a private endpoint URL and a trial API Key.

### 2. Implementation Examples

Check out the folders for code examples:
- [Python SDK (Requests / httpx)](./python/akamai_solver.py)
- [Node.js SDK (Axios / Fetch)](./nodejs/akamai_solver.js)

### Python Example:
```python
import requests

API_KEY = "sk-your-api-key"
# Your private gateway URL will be assigned after contacting support
GATEWAY_URL = "https://<YOUR_ASSIGNED_PRIVATE_ENDPOINT>/api/v1/akamai-v2-cookies"

payload = {
    "target_url": "https://www.target-website.com/login",
    "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36..."
}

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

response = requests.post(GATEWAY_URL, json=payload, headers=headers)
print("Validated Cookies:", response.json()['data']['cookies'])
# You will get a valid _abck cookie with ~0~
```

---

## 💰 Pricing

We offer the most aggressive pricing in the industry. 1 Request = 1 Point. No hidden fees.

| Tier | Target Protection | Pricing | Features |
| :--- | :--- | :--- | :--- |
| **L1** | Basic Antibot (Lightweight) | **$2.00 / 1K** | High concurrency, headless clusters |
| **L2** | **Akamai v2 (`_abck`)** | **$3.50 / 1K** | Validated `~0~` cookies, raw sensor data |
| **L3** | **Akamai v3 / Shape Security** | **$6.00 / 1K** | Deep AST decryption, protocol level bypass |

---

## ⚠️ Disclaimer
This repository contains SDK examples and documentation for an external commercial API. The API is intended for legitimate data extraction, academic research, and accessibility testing. Users must ensure their use of the API complies with the target website's Terms of Service and local laws.

## 🔍 SEO Keywords
`akamai bot manager bypass`, `akamai v2 solver`, `akamai v3 solver`, `_abck cookie generator`, `sensor_data generator`, `shape security bypass`, `f5 shape solver`, `web scraping api`, `antibot bypass api`.
