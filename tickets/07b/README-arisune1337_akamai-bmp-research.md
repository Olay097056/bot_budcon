# Akamai Bot Manager Client — Static & Dynamic Analysis

![license](https://img.shields.io/badge/license-MIT-blue)
![type](https://img.shields.io/badge/type-security%20research-555)
![status](https://img.shields.io/badge/status-version%20snapshot-orange)
![no bypass code](https://img.shields.io/badge/no%20bypass%20code-by%20design-red)

A teardown of one Akamai Bot Manager (BMP) client sensor script: a 570,568-byte, single-line, heavily obfuscated JavaScript file named `svTgcMXF8B.js`. The repo documents how the script is built, what it collects, how it hides its own logic behind a small bytecode VM, and how it ships telemetry back to Akamai. The goal is descriptive and defensive: explain the machinery so defenders, privacy researchers, and students can reason about what runs in their users' browsers.

The script itself is copyright Akamai Technologies and is not redistributed here. What you get is the analysis: decoded identifiers, a disassembler for the embedded VM, the reconstructed wire format, and notes on where I had hard evidence versus where I inferred.

## What this is / what this is not

This is a structural and behavioral analysis of a specific, dated sensor build. Every concrete claim traces back to either a recovered runtime string, a disassembled opcode sequence, or an observed API call in a sandbox. Where a meaning is guessed, it says so.

This is not a bypass kit. There is no `sensor_data` generator here, no key-derivation-to-payload pipeline, no forging recipe, and no copy-paste path to producing Akamai-accepted telemetry. The cryptography and serialization are described at the level of "what algorithm, what inputs, what shape of output" and stop there, deliberately. If you came looking for a solver, this is the wrong repository.

## Contents

- [Background: Akamai BMP and what a sensor script does](#background-akamai-bmp-and-what-a-sensor-script-does)
- [The sample](#the-sample)
- [Obfuscation stack](#obfuscation-stack)
- [The embedded VM](#the-embedded-vm)
- [Fingerprinting surface](#fingerprinting-surface)
- [Behavioral biometrics and the isTrusted model](#behavioral-biometrics-and-the-istrusted-model)
- [Bot, automation, and headless detection](#bot-automation-and-headless-detection)
- [Telemetry and wire format](#telemetry-and-wire-format)
- [Cryptography](#cryptography)
- [Self-protection and anti-analysis](#self-protection-and-anti-analysis)
- [Methodology](#methodology)
- [Repository layout](#repository-layout)
- [Limitations and open questions](#limitations-and-open-questions)
- [Scope, ethics & legal](#scope-ethics--legal)
- [References and further reading](#references-and-further-reading)

## Background: Akamai BMP and what a sensor script does

The server side scores requests; the client side is this script. Akamai Bot Manager is a managed bot-mitigation product, and the sensor is its in-browser half: a JavaScript file that runs in the visitor's browser, harvests signals about the device and the person driving it, and posts that telemetry back so the server can decide whether a session looks human. The sensor is what this repo dissects.

Attribution to Akamai was not a guess. It fell out of the decoded string table on its own. The script references the `bmak` global (Bot Manager Akamai), reads the `_abck` verdict cookie and the `bm_sz` session/seed cookie, and exposes the exact function vocabulary Akamai's BMP uses: `get_telemetry`, `buildPostData`, `getTelemetryHeaderForInline`, `getTelemetryHeaderForAutopost`, `processAutopostRes`, plus `startTs` and `sensorData` on the `bmak` object. The clincher is the `sensor_data` field-abbreviation set recovered from memory, which lines up with published BMP field names: `s024 swrt wrt wre xof xot sjs_r ak_ bmint_ iks ift cTc hc la las pl pn dm tz ctry wdr av un sur`. Four independent kinds of evidence (global name, cookies, function names, field schema) all point at the same vendor.

A client sensor like this has one job that splits into four: collect a device fingerprint, watch how the user behaves, look for tells that the "user" is automation, and serialize all of it into a compact, integrity-checked blob that the origin forwards to Akamai. Everything in the script is in service of one of those four.

## The sample

| Property | Value |
|---|---|
| Filename | `svTgcMXF8B.js` |
| Vendor | Akamai Bot Manager (BMP) |
| Raw size | 570,568 bytes, a single line |
| Beautified | 15,651 lines (`js-beautify`) |
| Copyright | Akamai Technologies; not included in this repo |
| Acquisition | DevTools Network tab, on a page already protected by BMP |

I pulled the file the boring way, off the wire with browser dev tools on a protected page, then ran it through `js-beautify` to get something a human can read. The beautified file is the coordinate system for every line number in these docs (for example `pCw()` at 12541, `sck()` at 14565). The names are the obfuscator's own minified identifiers, not anything I assigned; they survive because the obfuscator never renames across the whole program, only within scopes.

## Obfuscation stack

Five layers sit between a reader and the logic, and they are stacked deliberately so that beating one still leaves you facing the next. None of them is novel on its own. The combination is what makes a purely static read impractical.

Control-flow flattening is the first and the worst of it. The beautified file has 1,026 functions, 35 `switch` dispatchers, and 610 `case` labels. Logic that would normally be a readable call graph is shredded into numbered states behind those dispatchers, so you cannot follow execution top to bottom; you would have to simulate the state variable to know which `case` runs next. This is the single biggest obstacle to reading the file, and it is the reason I went dynamic. Rather than rebuild 35 state machines by hand, I stubbed the browser surface and watched which APIs actually got called, with which arguments. Observe effects and the flattening stops mattering.

The interesting logic is not present as JavaScript at all. Two base64 blobs ride along in the decoded string table, and the same giant `switch` that flattens control flow also doubles as a stack-machine interpreter for those blobs. De-obfuscating the surrounding JavaScript gets you nothing here; the payload-building logic only exists as VM bytecode. I wrote a small TLV disassembler (`tools/disasm.js`) and recovered the programs from the byte stream. More on the VM below, since it is the most interesting part of the file.

Every identifying string (API names, cookie names, field abbreviations) lives encrypted in a master array `l0k[]`, split across three pools `vpk`, `z0k`, and `Bqk`, each with its own decoder: `St`, `kY`, and `Ox`. Strings decode lazily on first access and the decoded value replaces the encrypted one in place. The point is to defeat `strings` and `grep`: a static viewer sees junk bytes, and the real vocabulary only exists in memory once the script runs. I beat this by instrumenting the output side of all three decoders inside jsdom and pushing every decoded value to `window.__decoded[]`. That recovered 452 values total (the 2 VM blobs plus the plain strings) without having to reimplement the XOR.

The fourth layer is jsfuck-style numeric constants. Numbers are written as `+`, `!`, `[`, `]` expressions. The djb2 multiplier `33` is `+!+[]` repeated 33 times; the SHA-256 round constants get the same treatment. A function `pCw()` generates these at load time. The intent is to keep magic numbers out of reach of any tool that scans for numeric literals. This is the weakest layer in practice: jsfuck constants are just numbers the instant the engine evaluates them, and the VM bytecode stores the values directly anyway (the disassembler reads `PUSHi 33` straight out of the blob with no jsfuck in sight).

Finally, dead-variable noise. Somewhere between 300 and 500 `var` declarations across the 15,651 lines are assigned and never meaningfully read. They pad the namespace and trip up automated variable-tracers that assume every assignment matters. Dynamic instrumentation skips past this entirely, since I was watching calls, not assignments.

One aside worth recording: the `VT`-prefixed tokens in the decoded table (`VT$qcm`, `VT2qqq`, `VTcfdI`, `VTsqUm`, and similar) look like opaque handles into the obfuscator's own string-table machinery rather than anything human-meaningful. They are not useful as logic, but they are a stable, fingerprintable signature of this particular obfuscator build, which is handy for cross-version diffing.

## The embedded VM

The VM is where Akamai hid the part that actually matters, the serializer that turns collected signals into the wire payload. It is a stack machine with no typed registers; every value on the stack is an untyped JavaScript value, which is consistent with an interpreter that runs inside the JS engine and leans on the host for types. The instruction stream is tag-length-value: `[opcode:u8][operands]`, with string operands prefixed by a big-endian `u16` length. Multibyte integers are big-endian.

The full opcode table lives in [`docs/vm-opcodes.md`](docs/vm-opcodes.md). A compact subset, enough to read the examples below:

| Hex | Mnemonic | Operands | Meaning |
|---|---|---|---|
| `0x8f` | FUNC | u32 | Lambda header (the u32 roughly tracks the next header; see below) |
| `0xd2` | PROLOG | none | Frame/scope begin |
| `0xff` | LOAD | u16 len + bytes | Push identifier or property name |
| `0x7e` | PUSHSTR | u16 len + bytes | Push string literal / scope root (`window`, `bmak`) |
| `0x4f` | PUSHi | u8 | Push small int (`4f 21` → 33) |
| `0x96` | STORE | u8 slot | Pop into variable slot |
| `0x7f` | GET / CALL | u8 flag | flag `0x01` = member get; flag `0x00` + `1a 01 00 01` = method call |
| `0xd5` | TRUNC32 | none | `>>> 0`, keeps a value in uint32 range |
| `0x29` | JUMP | u16 + u8 | Branch / loop back-edge |
| `0x85` | POP / END | none | Discard top / block-end marker |

Two caveats about the disassembly up front. It is a single-pass linear sweep, so the multibyte operands of `PUSHnum` (`0x54`, eight operand bytes) and typed constants will occasionally desync the decoder and make it print phantom `FUNC` headers inside operand data. And I could not pin the exact semantics of the `FUNC` `u32` field. It is monotonically increasing and roughly tracks the position of the next header, but the arithmetic does not close as either a clean body byte-length or an absolute skip target: FUNC@348 carries `len=2466` in a 2,481-byte blob, and `348 + 2466 = 2814` overshoots the end, so it cannot be a body length. Treat the `u32` as a heuristic that orders the early headers, not a decoded field.

### Blob 0: the permutation tables

Blob 0 is 959 bytes and it is data, not logic. It opens with a `0x8f` FUNC header (`len=944`), a prologue, a few 2-char variable loads (`wT`, `cw`, `kT`, `Eq`), and then a long run of `PUSHi` constants. That run is the whole point. `PUSHi` is the single dominant opcode across both blobs (321 total, 245 of them in this blob).

Each table entry is emitted as `PUSHi value` followed by a `PUSHi 0` filler, raw bytes `4f VV 4f 00`. A table is exactly 23 entries (46 `PUSHi` ops) and is terminated by the 2-byte marker `8c 17`. There are five such markers, at offsets 129, 225, 321, 417, and 513; the fifth is immediately followed by a different marker `8c 05` at offset 517, which closes the table region and starts the trailing tail of the blob.

The five tables are five complete permutations of the integers 0..22, each machine-verified as a bijection:

| # | Offset | Permutation (length 23) |
|---|---|---|
| 0 | 37  | `2, 12, 10, 11, 20, 17, 13, 6, 5, 0, 3, 21, 18, 22, 19, 7, 8, 14, 1, 4, 16, 9, 15` |
| 1 | 131 | `13, 11, 1, 15, 20, 21, 22, 2, 3, 0, 9, 6, 16, 12, 10, 5, 18, 8, 17, 7, 4, 14, 19` |
| 2 | 227 | `22, 8, 6, 16, 5, 7, 10, 3, 4, 19, 9, 14, 13, 1, 2, 11, 18, 21, 20, 17, 15, 0, 12` |
| 3 | 323 | `9, 1, 6, 15, 4, 16, 7, 18, 22, 17, 20, 2, 8, 19, 5, 21, 12, 14, 10, 11, 3, 0, 13` |
| 4 | 419 | `10, 11, 21, 8, 2, 5, 6, 1, 3, 4, 12, 20, 22, 16, 17, 13, 19, 18, 14, 0, 9, 7, 15` |

A practical note for anyone re-deriving these from the raw bytes: tables 1 through 4 start on the opposite phase of the `value, 0` interleave, meaning the `PUSHi 0` filler precedes each real value rather than following it. Read it naively and you get a plausible-looking but wrong permutation. The values above are phase-corrected.

Five fixed 23-element index orderings, sitting in a data-only region with no executable logic around them, is the textbook shape of a serialization ordering scheme. The reading I am confident in: there are 23 collected fields (or sensor-event slots), and these tables reorder them before concatenation so the column order on the wire is scrambled and varies per build. The structure is unambiguous, but the disassembly does not resolve which table is used when, so "five selectable orderings, one chosen per session or payload segment" is inference, not a decoded branch. The opcodes that would carry that selection are the unresolved index ops in Blob 1 (`op_9a`@762, `op_d7`@838/901/1791/2033/2320), which cluster around array-index and length operations; whoever picks this up next should start there.

### Blob 1: the serializer programs

Blob 1 is 2,481 bytes and holds the real executable sub-programs. Six FUNC headers at offsets 0, 136, 192, 348, 402, and 922 are the genuine top-level boundaries. The many headers the disassembler prints past offset ~1300 (1322, 1332, 1390, and so on) are false positives sitting inside `PUSHnum` operand bytes where the linear sweep desynced. Reading the real six:

| Offset | u32 | Reconstructed role | Stores |
|---|---|---|---|
| 0   | 122  | UA sanitizer | `qR` |
| 136 | 178  | int→string helper | `QO` |
| 192 | 334  | djb2 rolling checksum | `dk` |
| 348 | 2466 | main serializer (outer) | `CE` |
| 402 | 2442 | main serializer body (nested) | (inlined) |
| 922 | 2390 | inner serialization loop / record builder | (inlined) |

FUNC@0 → `qR` is the UA sanitizer. It loads `window.navigator.userAgent` and runs a `split/join → split/join` normalization chain: `LOAD "split"`, `CALL`, `LOAD "join"`, `CALL`, twice. That is a character-substitution/strip pass, the same effect as `replace(/\|"/g, '')`, stripping the pipe and quote characters that would otherwise collide with the semicolon-delimited wire format. Result goes to `qR`.

FUNC@136 → `QO` is a thin wrapper around `Number.prototype.toString(radix)`, with radix 2 visible in the operand stream (`PUSHi 2`, `PUSHSTR "Bv"`, `LOAD "toString"`, `CALL`). Stored to `QO`.

The djb2 checksum at FUNC@192 → `dk` is the cleanest recovery in the whole file, because the opcodes and a famous magic constant survive intact. The program is `hash = hash * 33 + s.charCodeAt(i)`, truncated to 32 bits, classic djb2. The evidence, straight from the disassembly:

- `PUSHi 33` at offset 295 (raw `4f 21`, the `0x21` = 33 multiplier).
- `charCodeAt` resolved as a member then called at offsets 276 → 289 (`LOAD "charCodeAt"` then the `CALL` detail `1a 01 00 01`).
- `0xd5` (TRUNC32) at offset 331, the `>>> 0` applied to the running `gI` accumulator (pushed at 326). TRUNC32 takes no operand; the `PUSHi 0` at 324 and `PUSHSTR "gI"` at 326 are the stack setup that precedes it.

The accumulator is `gI`, the loop index `bO`, the input `WA`; those 2-char names ride along inside `LOAD` operands, which is exactly why the program was reconstructable at all. The result is stored to `dk`. There is an annotated, line-by-line walkthrough of this loop in [`docs/vm-opcodes.md`](docs/vm-opcodes.md).

FUNC@348 → 402 → 922 → `CE` is the main serializer: the nested block that builds the payload. It carries a 31-character scrambled alphabet, `a3cd9efghiYjklm7opqrs1uvwQxyBz2`, loaded at offset 480 into `Or` and split into `M8` for use as an encode table. It calls the three helpers above by name (`qR`, `dk`, `QO`). It reads `window.bmak.startTs` (offsets 565–593 and again 2131–2164), coerces values through `String(...)` (eight occurrences of the `PUSHSTR "String"` + call pattern), creates a `<div>` for DOM-entropy probes (offsets 1042–1077) and reads `getElementsByTagName`, `ATTRIBUTE_NODE`, and `baseURI`, and touches `Math.cos / sqrt / pow / random / floor / abs` (the `Math` string appears 8 times) to feed numeric fingerprint slots. `parseInt(x, 10)` shows up six times. Everything is pushed into an output array `jI`, the most-referenced local in the program (10 occurrences) and clearly the accumulating output buffer. The final value loads/stores as `CE` at offsets 2459–2478.

Put together, Blob 1 is a field-collect-and-serialize routine: gather the signals, run each through the custom alphabet plus the djb2 and int→string helpers, push into `jI`, and let the Blob 0 permutation tables decide slot order. The 23 permutation slots and a 23-field collection are a suggestive match, but I never isolated a point in Blob 1 where exactly 23 items are emitted into `jI`, so treat the 23↔23 correspondence as plausible rather than confirmed.

A handful of opcodes stay unresolved: `op_9a` (one site, @762), `op_d7` (@838, 901, 1791, 2033, 2320), `op_d4` (@1165, 1382, 1441, 1917, 1935, 2011), `op_8d`, and `op_6f` (@2397). The `op_d4` and `op_d7` sites cluster tightly around array-index and `length` reads, which is a usable hint that they are the index/subscript arithmetic the serializer and the permutation step run on. The `8c xx` marker family and the `ce bd` loop-test group are named by their role (table terminator, less-than branch) but were inferred from context, not formally decoded by the tool. The honest state of the VM: control flow, the three helpers, and the serializer skeleton are understood; a few arithmetic and marker opcodes are labeled by behavior rather than proven.

## Fingerprinting surface

The fingerprinting reach is wide, and the decoded strings name most of it outright. Full catalog in [`docs/fingerprinting.md`](docs/fingerprinting.md); the highlights.

Canvas: offscreen `<canvas>` rendering (`OffscreenCanvas` is present, the headless-safe path), `fillText` with emoji and mixed-script strings to expose font-rendering differences, `fillRect`/`arc`, `getImageData` for raw pixels, `toDataURL('image/png')` as lossless hash input, and `measureText` feeding `calcFontMetrics`. The master compute routine is `calculateFP`, with `fpValStr` holding the fingerprint value string.

WebGL: the classic GPU unmask. `getExtension('WEBGL_debug_renderer_info')` then `getParameter` for `UNMASKED_VENDOR_WEBGL` and `UNMASKED_RENDERER_WEBGL`, plus `VERSION`, `SHADING_LANGUAGE_VERSION`, and the supported-extensions list length. Stored across `webGLVendor`, `gpuRenderer`, `gpuVendor`, and a second `gpu2Vendor` field that likely implies a fallback context probe.

Audio: an `OfflineAudioContext` (sample rate 44100, length 4096) drives an oscillator (triangle, 10000 Hz) through a `DynamicsCompressorNode`, renders offline, and hashes the resulting `Float32Array`. The recovered feature name is `synthesisSpeechHash`, which is a misnomer; the logic behind it is the oscillator/compressor audio hash, not any speech-synthesis or voice enumeration. No `speechSynthesis` or `getVoices` probe appears in the decoded strings, so do not read the name literally.

Navigator and UA Client Hints: `userAgent` (pipe/quote stripped, per the VM sanitizer above), then the `userAgentData` high-entropy surface, where the recovered keys are `brands`, `architecture`, `bitness`, `model`, and `uaFullVersion`. Alongside: `hardwareConcurrency`, `deviceMemory`, `languages`, `platform`, `plugins`/`mimeTypes` (still probed for legacy bot signals), and `connection` (the recovered string is `connection`; a specific `effectiveType` read is inferred by convention, not decoded).

Screen and environment: `width`/`height`/`avail*`, `colorDepth` (typically 24), `devicePixelRatio`, `innerWidth`/`innerHeight`, `matchMedia` probes for orientation and `(pointer: coarse)` to classify touch versus mouse, and the IANA timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone`.

API-presence booleans: a row of capability checks, each collapsed to a single bit in the metrics field. `ApplePaySession` → `av`, `PublicKeyCredential`/WebAuthn → `un`, `navigator.serviceWorker` → `sur`, `SharedWorker` → `wdr`, `Notification` → `pn`, `performance.memory.jsHeapSizeLimit` → `hc`, and a WebRTC presence probe → `wre` (the `;wre;` string and the telemetry doc support a WebRTC check; the literal `RTCPeerConnection` constructor name is inferred, not a recovered string). The `dm` field is device-memory-adjacent and, per the docs, also takes a battery-state contribution, so treat it as a composite rather than a pure RAM bucket (a `getBattery`-style read is implied by the docs but, like the constructor name, not a recovered identifier). The Apple Pay and WebAuthn probes are strong Safari/Apple-hardware and real-browser signals respectively, which is exactly why they are here.

## Behavioral biometrics and the isTrusted model

The behavioral side reads like a biometrics collector. The event names recovered from the decoded table are `mousemove`, `mouseup`, `keydown`, `keyup` (keyCode only, never the key value), `pointerdown`, `touchstart`, `touchmove`, `devicemotion`, and `deviceorientation`. A focus/blur lifecycle exists too, but it shows up as the abbreviations `PAGE_FOCUS`/`PAGE_BLUR` and `pagefocus`/`pageblur` rather than registered `focus`/`blur` listeners; `mousedown`, `scroll`, and `visibilitychange` are conventional companions of this set and probably present, but they are not in the decoded strings, so I am flagging them as inferred rather than recovered. Per event the collector captures coordinates, `which`/`target`, the modifier keys (`altKey`, `ctrlKey`, `metaKey`, `shiftKey`), and timing. The internal `mmeCnt` counts mousemove events; `previousEventTypeAbbrev` carries a compact code for the prior event in the stream.

The enforcement model is built on `Event.isTrusted`. Every event is checked, and synthetic events dispatched by automation (anything from `dispatchEvent`) carry `isTrusted === false`. The script keeps per-type tallies of the fakes: `untrustedClickCount`, `untrustedKeyDownCount`, `untrustedInputCount`. It also tracks sessions that produced no genuine events at all via `missingTrustedEvents`, and it carries verdicts across reloads with `persistentMissingTrustedEvents`, `persistentTrusted`, and `persistentNotTrusted`. The "persistent" prefix is the giveaway that these survive navigation, not just the current page.

The reason synthetic input gets caught is structural and hard to fake from userland: `isTrusted` is set by the browser's event-dispatch machinery, not by page script, so a tool that synthesizes events to mimic a user lights up the untrusted counters by construction. There is also a leftover internal hook, `__resetBiometricLimitsForTesting`, sitting in the biometric collector alongside `checkBiometricSignal`, `biometricAPInflight`, and `eventLimitBiometricAutopost`. A test-only reset function shipped in production is a small but real tell that this build came off an unstripped dev path; the trace symbol `_sdTrace` ("sensor-data trace") points the same direction.

## Bot, automation, and headless detection

The automation checks are specific and clearly tuned to 2023-era tooling rather than generic. The probe list, from recovered identifiers:

- `navigator.webdriver` (Selenium/WebDriver), abbreviated `wdr` in the sensor stream.
- `window.__playwright__binding__` and `window.runtimePlaywright`, Playwright's injected binding and runtime object, named directly.
- `collectHeadlessSignals` and `getHeadlessBrowserData`, the headless aggregators.
- `iframeChromium` plus probes of an injected iframe's `contentWindow` for Chromium leaks.
- `setBraveSignal`, keyed to Brave-specific API quirks.
- `stealthPluginManipulation`, aimed at puppeteer-extra-stealth and `navigator` patching.
- `window.chrome` / `chrome.runtime` integrity (headless Chrome lacks a genuine one).

The integrity checks are the part worth calling out. Akamai does not trust `typeof`; it checks the actual source text of functions. One recovered regex asserts that the `contentWindow` getter really is native:

```
function (get )?contentWindow(\(\)) \{(\n {3})? \[native code\][\n ]\}
```

paired with the bare `{ [native code] }` / `\[native code\]` markers. The reasoning is sound from Akamai's side: stealth tooling that monkey-patches a getter usually leaves a JS function whose `toString()` no longer reads `[native code]`, so matching the native-code source text at the character level catches hooked or spoofed getters that a presence check would miss.

## Telemetry and wire format

The payload is `sensor_data`, a semicolon-delimited string assembled by the Blob 1 serializer:

```
3;0;1;0;{startTs};{fpHash};{metrics};{encryptedBehavior}
```

| Field | Name | Content |
|---|---|---|
| 1 | format version | `3` |
| 2–4 | feature flags | `0;1;0` (static in this build) |
| 5 | `startTs` | session start, held in `bmak.startTs`; a compressed/relative representation, not a full Unix timestamp (the docs' `4600631` is an illustrative value, not a captured one) |
| 6 | `fpHash` | `SHA-256(canvas ‖ webgl_vendor ‖ webgl_renderer ‖ audio_hash)` → base64 |
| 7 | `metrics` | comma-separated device integers (the docs' `17,1,0,0,4,124` is an illustrative shape, not a captured sample) |
| 8 | `encryptedBehavior` | serialized event tuples, XOR-keyed, then custom base62; slot order per the Blob 0 permutation tables |

The metrics field is where the abbreviations land. The mapping below is from [`docs/telemetry-format.md`](docs/telemetry-format.md); several are confident, a few (`s024`, `swrt`, `cTc`, `iks`, `ift`) are partially inferred:

| Abbrev | Meaning | Abbrev | Meaning |
|---|---|---|---|
| `s024` | screen w×h (encoded) | `iks` | input keystrokes |
| `swrt` | screen ratio | `ift` | input focus time |
| `wrt` | window w/h | `cTc` | click-to-complete |
| `wre` | WebRTC present (0/1) | `hc` | heap capacity present (0/1) |
| `xof` | X offset / scroll | `la` / `las` | languages array / string |
| `xot` | X offset total | `pl` | plugin count |
| `sjs_r` | script JS result | `pn` | Notification permission |
| `ak_` | Akamai tag prefix | `dm` | device memory (+ battery contribution) |
| `bmint_` | BMP interaction count | `tz` | timezone offset |
| `wdr` | SharedWorker present | `ctry` | country (server-side, from IP) |
| `av` | ApplePay present | `un` | WebAuthn present |
| `sur` | ServiceWorker present | | |

Two delivery paths. Autopost over XHR is gated on `<form>` submit, the checkout/payment moment. The chain is `buildPostData` → `get_telemetry` → `sck` (the XHR builder, `withCredentials: true`) → `processAutopostRes`. The body is `sensor_data=...` url-encoded, credentials included, posted to an endpoint path read from the `_abck` cookie. The inline-header path covers AJAX and fetch made after initial load: `getTelemetryHeaderForInline` attaches the same string as an `x-acf-sensor-data` request header before the request leaves the browser.

The response side reads cookies. `_abck` is the verdict cookie, `~`-delimited:

```
~{score}~{endpoint}~{flags}~{timestamp}~{nonce}~
```

Because the string opens with a leading `~`, splitting on the delimiter yields an empty first element, then `score`, then `endpoint`: in a 0-based array that puts the score at index 1 and the endpoint at index 2. The endpoint is the second non-empty segment. (`telemetry-format.md` describes the endpoint as "field 2" but is internally inconsistent about whether it is counting from 0 or 1; resolve it against the real `Iwk()` splitter, which is what scans `document.cookie` for the `~` delimiter.) The `bm_sz` session/seed cookie is read by the same generic cookie path, but its read-site was not isolated and its internal structure was not recovered, so I am leaving both as a known gap rather than guessing.

Timers observed: a 100 ms behavioral sampling tick, 1 s and 3 s heartbeats, and a 6-hour token renewal. The script also re-fetches its own URL with a `?t=<timestamp>` cache-buster, which rotates the logic and frustrates static snapshots.

No assembly order, no field-population recipe, and no end-to-end encode pipeline is written out here, deliberately, because that is the line between documenting a format and handing someone a generator.

## Cryptography

Three primitives, kept at the how-it-works level.

A full SHA-256 lives in `IRk()`, with the standard round constants (`K` starting `0x428a2f98`, `0x71374491`, …), the standard IV (`H` starting `0x6a09e667`, `0xbb67ae85`, …), and a `ROTR` helper in `jOk()`. It hashes the concatenated canvas, WebGL vendor, WebGL renderer, and audio values and base64-encodes the digest into field 6; the base64 step is the `btoa` in the decoded table. The byte-formatting tells around it (`padStart`, `toString` with a radix, `charCodeAt`, `fromCharCode`) are consistent with a hand-rolled digest rather than a WebCrypto call, which makes sense for a script that wants its hashing to run identically everywhere and to be observable to itself.

One 256-bit secret is baked into the sample: a single base64 string, 32 bytes decoded, beginning `Qwea5Jiz/…`. (The full value is in the sample; I am not reprinting it in whole, since the live key alongside the alphabet and the XOR-then-base62 description is the most forge-adjacent cluster in this writeup.) It is the **embedded key**, the single most load-bearing crypto artifact in the file and the obvious anchor for the integrity/obfuscation layer over the behavioral payload.

The behavioral event stream is serialized, XOR-combined against that embedded key, then encoded with a custom base62 alphabet, `a3cd9efghiYjklm7opqrs1uvwQxyBz2` (the same scrambled alphabet the VM serializer loads at offset 480). This is an obfuscation/integrity wrapper, not strong cryptography; XOR with a fixed embedded key is reversible by anyone who has the key, which everyone who runs the script does. The work it does is raise the cost of casual inspection and bind the payload shape, not provide confidentiality. I am describing the algorithm and its inputs and stopping there; this section is intentionally not a decode-then-encode walkthrough.

## Self-protection and anti-analysis

The script actively resists being looked at. It deletes its own `<script>` node from the DOM after running (`removeCurrentScriptFromDOM`, reading `document.currentScript`) so a later DOM inspection finds nothing. It re-arms itself on a timer (`reloadScript`, `scheduleScriptReload`, `createResetSignalTimeout`), rotating logic between fetches. It can tear down its own listeners (`removeAllEventListeners`) and halt collection on server command (`checkStopProtocol`), a kill switch. A single-instance mutex, `tryAcquireLock` over `aj12_lock`, ensures only one collector runs, which conveniently also blocks anyone trying to run a second instrumented copy alongside it.

The anti-debug traps are the noisy part. `CustomErrorAfterFunctionCall` throws a custom exception right after a call as a control-flow trap, and the string `Maximum call stack size exceeded` shows up as a deliberate recursion/stack-overflow probe, which is both an anti-debug move and a native-versus-hooked timing check. There is also reflective dispatch (`listFunctions`, `applyFunc`) for indirect, obfuscated calls. None of this stopped dynamic analysis, because observing API effects from outside the flattened control flow sidesteps the traps that are meant to catch a stepping debugger. But it does raise the cost, and the self-deletion plus self-refetch combination is genuinely effective against anyone trying to grab a stable static copy.

## Methodology

Full write-up in [`docs/methodology.md`](docs/methodology.md). The short version is that I went dynamic early and treated the script as a black box that I poked with a stubbed browser, rather than trying to out-read 35 flattened state machines.

| Component | Version |
|---|---|
| Node.js | 26.3.1 |
| jsdom | 24.x |
| js-beautify | 1.x |
| Platform | Windows 10 |

The pipeline:

1. Beautify. `npx js-beautify` on the 570 KB single line gives 15,651 readable lines and locates the load-bearing functions (`pCw` at 12541, `KTk` at 12560, the decoders' install sites at 14119/14958/14976, `sck` at 14565, `Iwk` at 14609).
2. Decode strings. Patch the three decoder assignment sites (`var dPw=St(...)`, `var vEw=kY(...)`, `var LCw=Ox(...)`) to push their output into `window.__decoded[]`, then run the script in jsdom. This recovered 452 values: the 2 VM blobs plus the plain strings.
3. Simulate behavior. Inject a login form, run a 40-tick × 60 ms synthetic event loop (fields filled at tick 4, submit at tick 30), and compress timers (`setTimeout` capped at 8 ms, `setInterval` fired at most 8 times) so the heartbeat-gated paths fire inside a short run.
4. Disassemble the VM. The two blobs are the only `__decoded` entries over 200 chars (both base64). `tools/disasm.js` turns them into an annotated listing (`findings/vm-disasm.txt`).
5. Reconstruct and attribute. Recover program meaning from `LOAD` operand names (the 2-char locals `gI`/`bO`/`WA` survive), constant cross-reference (`PUSHi 33` → djb2), and idiom matching; confirm the vendor from the decoded `bmak`/cookie/field vocabulary.

The published `findings/decoded-strings.txt` holds 449 lines of representative deduplicated strings; the live `__decoded[]` array also carried the 2 base64 VM blobs, which live in `findings/vm-disasm.txt` rather than the string list, so the "452 values" total cannot be eyeballed from the string file alone (`wc -l` will report 449).

The sandbox is a real jsdom instance configured at `https://shop.example.com/checkout` with a `https://www.google.com/` referrer, `runScripts: 'outside-only'`, `pretendToBeVisual: true`, and a stack of deterministic stubs in front of the script: fake 2D and WebGL contexts, an `OfflineAudioContext` with a deterministic `oncomplete`, `RTCPeerConnection`, `getBattery`, Permissions, `mediaDevices`, `performance.memory`, `matchMedia`, `speechSynthesis`, `chrome`, the idle/animation-frame callbacks, an XHR stub, and a fake `document.currentScript`. Several of those stubs (`RTCPeerConnection`, `getBattery`, `speechSynthesis`) are present so the script does not throw when it probes for them, which is also why their literal constructor/method names appear in my harness but not in the recovered strings; do not mistake a stub for a recovered identifier. Deterministic stubs make the recovered strings and the fingerprint inputs reproducible across runs.

## Repository layout

```
akamai-bmp-research/
├── docs/
│   ├── architecture.md        # subsystem decomposition + execution flow
│   ├── obfuscation-layers.md  # the five layers, each dissected
│   ├── vm-opcodes.md          # full opcode table + annotated djb2 walkthrough
│   ├── fingerprinting.md      # every fingerprint surface, by API
│   ├── telemetry-format.md    # sensor_data wire format + cookies + transmission
│   └── methodology.md         # sandbox, instrumentation, environment
├── tools/
│   └── disasm.js              # TLV bytecode disassembler (Node.js, no deps)
├── findings/
│   ├── decoded-strings.txt    # representative runtime-decoded strings
│   └── vm-disasm.txt          # full disassembly of both VM blobs
├── LICENSE                    # MIT (docs + tooling only)
└── README.md
```

Running the disassembler:

```bash
node tools/disasm.js
# reads base64 VM blobs from decoded_strings.txt,
# writes disasm.txt, and prints the first 90 instructions of BLOB 1
```

It needs Node.js ≥ 18 and has no npm dependencies. (The analysis itself ran on Node 26.3.1; ≥ 18 is just the floor the tool needs.) The tool expects the base64 blobs in a local `decoded_strings.txt`, one per line, and treats any line longer than 200 chars as a blob.

## Limitations and open questions

This is a snapshot of one build, and Akamai rotates these scripts often, so specific line numbers, the embedded key, the permutation tables, and the obfuscator's minified names will all drift between versions. The structural findings (five obfuscation layers, the TLV VM, the djb2 helper, the wire-format skeleton) are far more durable than any single offset.

jsdom is not a browser. The GPU-backed WebGL unmask, real audio rendering, and genuine high-resolution timing paths were stubbed, so anything that depends on real hardware output was observed by call, not by value. A few `sensor_data` abbreviations (`s024`, `swrt`, `cTc`, `iks`, `ift`) are still partly inferred from name and position rather than fully traced. The permutation-table selection (which of the five orderings is chosen, and on what input) is described structurally but not resolved to a decoded branch, and the candidate gate opcodes are the unresolved `op_9a`/`op_d7` index sites in Blob 1. Five VM opcodes (`op_9a`@762, `op_8d`, `op_6f`@2397, `op_d4`@1165/1382/1441/1917/1935/2011, `op_d7`@838/901/1791/2033/2320) and the `8c xx` marker family remain unnamed beyond their apparent role. And `bm_sz` is read by the script but neither its read-site nor its layout was recovered. Those are the honest edges of the work.

## Scope, ethics & legal

The analyzed script was obtained the way any visitor's browser obtains it: over the network, through standard DevTools inspection, on a page that was already serving Akamai Bot Manager. No protection was circumvented to get it, no account was compromised, and no service was attacked to produce these findings.

The script is copyright Akamai Technologies. It is not included in this repository, not in whole and not in fragments large enough to reconstruct it. What is published is original analysis: decoded identifier lists, a disassembler I wrote, reconstructed structure, and prose. The MIT license covers that documentation and tooling, not Akamai's code.

This repository contains no bypass tooling. There is no `sensor_data` generator, no key-to-payload pipeline, and no step-by-step for fabricating telemetry that Akamai would accept. The cryptography and serialization are described well enough to understand what is collected and how it is shaped, and deliberately not well enough to forge a valid payload. That boundary is intentional and I held it throughout.

The audience is defenders, privacy researchers, and students. Knowing what a sensor script reads from a browser (the canvas and WebGL fingerprints, the UA Client Hints, the behavioral biometrics, the PII-field interaction timing) is exactly the kind of thing a site operator or a privacy-minded engineer should be able to reason about for the code running on their own pages and in their own users' browsers. The form-field watchlist in `fingerprinting.md` lists 12 English field names (`email`, `confirmEmailAddress`, `password`, and so on); the decoded table also carries a Spanish field name, `nombre`, which is not on that 12-field list, so I read it as evidence the watchlist is localized across versions rather than as a 13th documented entry. If you represent Akamai and want something changed here, open an issue.

## References and further reading

- Akamai's own public documentation on Bot Manager and the `sensor_data` / `_abck` mechanism, which is where the canonical field abbreviations were cross-checked.
- General literature on browser fingerprinting: canvas and WebGL fingerprinting, AudioContext fingerprinting, and UA Client Hints as an entropy source. The EFF's work on browser uniqueness is a reasonable starting point for the privacy framing.
- Anti-fingerprinting and automation-detection research aimed at the puppeteer-extra-stealth / Playwright / headless-Chrome ecosystem, which is the same tooling this script names explicitly.
- Standard references on control-flow flattening and bytecode-VM obfuscation as code-protection techniques, from the software-protection and malware-analysis literature, for the obfuscation-layer framing.
- The W3C `Event.isTrusted` definition, which is the mechanism the whole synthetic-event detection model rests on.
