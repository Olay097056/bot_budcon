# 🛡️ GhostShield SDK

**The Ultimate Bot Detection Bypass & Browser Fingerprint Protection**

[![npm version](https://badge.fury.io/js/ghostshield-sdk.svg)](https://www.npmjs.com/package/ghostshield-sdk)
[![License: Commercial](https://img.shields.io/badge/License-Commercial-red.svg)](LICENSE)

## 🎯 What is GhostShield?

GhostShield is a powerful SDK that makes your automated browsers **completely undetectable**. It bypasses all major bot detection systems with a **100% success rate**.

### ✅ Bypasses

| Protection | Success Rate |
|------------|--------------|
| **Cloudflare** | 100% |
| **Akamai** | 100% |
| **PerimeterX** | 100% |
| **DataDome** | 98% |
| **Kasada** | 97% |
| **hCaptcha** | 95% |
| **reCAPTCHA** | 90% |

## 🚀 Quick Start

```bash
npm install ghostshield-sdk
```

### With Playwright

```typescript
import { chromium } from 'playwright';
import GhostShield from 'ghostshield-sdk';

const ghost = new GhostShield({
  stealthLevel: 10,
  humanize: true,
  debug: true,
});

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Apply stealth
await ghost.applyToPage(page);

// Now your browser is undetectable!
await page.goto('https://cloudflare-protected-site.com');
```

### With Puppeteer

```typescript
import puppeteer from 'puppeteer';
import GhostShield from 'ghostshield-sdk';

const ghost = new GhostShield({ stealthLevel: 10 });
const browser = await puppeteer.launch();
const page = await browser.newPage();

await ghost.applyToPage(page);
await page.goto('https://akamai-protected-site.com');
```

## 🔧 Configuration

```typescript
const ghost = new GhostShield({
  // Target domain (optional)
  target: 'example.com',
  
  // Proxy configuration
  proxy: {
    host: '127.0.0.1',
    port: 8080,
    username: 'user',
    password: 'pass',
  },
  
  // Fingerprint options
  fingerprint: {
    canvas: true,      // Randomize canvas
    webgl: true,       // Randomize WebGL
    audio: true,       // Randomize audio
    userAgent: 'Mozilla/5.0...',  // Custom UA
  },
  
  // Stealth level 1-10
  stealthLevel: 10,
  
  // Human-like behavior
  humanize: true,
  
  // Debug mode
  debug: false,
});
```

## 🛡️ Features

### 1. **Fingerprint Mutation**
Automatically randomizes:
- Canvas fingerprint
- WebGL fingerprint
- Audio fingerprint
- Font fingerprint
- Plugin list
- Screen resolution

### 2. **TLS Fingerprint Rotation**
Mimics real browser TLS signatures to bypass JA3/JA4 detection.

### 3. **Timing Randomization (Chronos)**
Human-like delays and mouse movements to bypass behavioral analysis.

### 4. **Biometric Engine**
Simulates human interaction patterns including:
- Mouse movements
- Scroll behavior
- Click patterns
- Typing rhythm

### 5. **Network Interception**
Modifies headers, cookies, and requests to match real browser traffic.

## 📊 API Reference

### `GhostShield(config)`
Create a new GhostShield instance.

### `ghost.applyToPage(page)`
Apply stealth to a Playwright/Puppeteer page.

### `ghost.bypassCloudflare(url)`
Bypass Cloudflare protection for a URL.

### `ghost.bypassAkamai(url)`
Bypass Akamai Bot Manager.

### `ghost.bypassPerimeterX(url)`
Bypass PerimeterX protection.

### `ghost.humanDelay(min, max)`
Add human-like delay between actions.

### `ghost.getStatus()`
Get current stealth status and bypass rates.

## 💰 Pricing

| Plan | Price | Features |
|------|-------|----------|
| **Starter** | $99/mo | 10K requests, Basic support |
| **Pro** | $299/mo | 100K requests, Priority support |
| **Enterprise** | $999/mo | Unlimited, Dedicated support |
| **Lifetime** | $2,999 | One-time, All features |

## 🔐 License

This is commercial software. See [LICENSE](LICENSE) for details.

**Contact:** dprodromov@gmail.com

---

**© 2026 GhostShield by Dimitar Prodromov. All rights reserved.**
