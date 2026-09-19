# Working on Fillframe

Read this file, README.md, manifest.json and the relevant source before modifying the extension. SETUP-PROMPT.md is the end-user installation workflow. Follow the user's requested scope; do not infer permission to publish, expand host access or modify their browser profile from this file.

## Product contract

Fillframe is an experimental, free Manifest V3 extension that crops web video to fill its player while preserving the source aspect ratio. It is a static, no-framework extension with no runtime dependencies, service worker, server, accounts, telemetry or payment system.

On YouTube, the rectangle/diagonal icon belongs beside fullscreen in the existing player toolbar. Clicking it immediately enables automatic fill with centered framing and neutral extra zoom. It must not open a panel. A second click restores the original framing. Keep the icon visually aligned with neighboring controls and its tooltip consistent with YouTube. Advanced adjustments remain in the extension popup; other players use the floating fallback.

Target the current player dimensions, which match the fullscreen viewport when fullscreen is active. Do not substitute the physical display dimensions for a smaller windowed player. Automatic sizing is not pixel-based detection of black bars encoded in the video; manual content-ratio overrides handle those cases.

## Architecture and ownership

| File | Responsibility |
| --- | --- |
| `manifest.json` | MV3 version, icons, popup/options and static host matches. Only `storage` API permission is requested. |
| `src/content_script.js` | Video selection, crop geometry, reversible CSS ownership, lifecycle observers, local preferences, toolbar/fallback UI, tooltip and message listener. Runs in the isolated content-script world. |
| `src/popup.html`, `.css`, `.js` | Light/dark controls and active-tab messaging. Queues slider patches and avoids applying stale replies over newer UI state. |
| `src/options.html`, `.css`, `.js` | Local help/privacy explanation and displayed extension version. |
| `assets/icons/` | Editable app SVG and packaged PNGs. The monochrome in-player SVG is inline in `attachToolbar()`. |
| `scripts/package.py` | Explicit allowlist copied to `release/Fillframe`; creates a versioned ZIP. Update the allowlist when runtime assets change. |
| `scripts/validate_extension.py` | Third-party static MV3/path/CSP validator, preserved with MIT attribution. Heuristic only. |
| `tests/smoke.mjs` | Real extension in isolated Chrome with intercepted synthetic page/video fixtures, including popup messaging and toolbar recovery. |
| `tests/youtube.mjs` | Network-dependent public YouTube playback, direct toggle, fullscreen geometry and restoration checks. |
| `tests/tooltip.mjs` | Network-dependent native tooltip style comparison, hover, fullscreen and keyboard checks. |
| `tests/video.webm` | Generated test-pattern fixture, not downloaded entertainment footage. |

### Content script flow

- `refresh()` selects a visible video, preferring playback and then larger area, chooses a known player container or fallback, and rebuilds controls when video/container identity changes.
- `schedule()` coalesces work through requestAnimationFrame. ResizeObserver and a filtered MutationObserver handle layout and DOM replacement. Avoid broad mutation loops or per-frame video processing.
- `apply()` computes proportional video dimensions large enough to cover the target. Explicit content ratios describe the useful image within encoded bars, not a request to stretch it.
- `setStyle()` records owned inline properties and priorities. Preserve subsequent site-authored changes before reapplying. `restore()` restores only properties still carrying extension-owned values. Never overwrite the entire style attribute or transform the controls/captions with the video.
- `attachToolbar()` locates the fullscreen button and its parent, supporting the current split YouTube toolbar. It inserts one button, hides the floating bar, and recreates the button after toolbar replacement. Do not assume the legacy `.ytp-right-controls` container exists.
- `showTooltip()` uses YouTube tooltip classes with an extension-owned element. No `title` attribute: that produces Chrome's mismatched browser tooltip. Keep the label non-interactive, bounded within the player, accessible and dismissible.

### State and messaging

State is `{mode, ratio, zoom, x, y, remember}`. `mode` is `original` or `fill`; `ratio` is `auto` or an allowed numeric string; zoom is 1–2; x/y are -1–1; remember is boolean. `clean()` validates incoming state. Keep ratio option values consistent between popup and fallback UI.

The popup queries the active tab and sends:

- `FF_GET`: return current status/state.
- `FF_SET` with `patch`: merge and validate changes, apply and persist as requested.
- `FF_RESET`: return to defaults and remove the saved preference for this key.

Success is `{ok:true,state,video:{width,height},site}`; errors use `{ok:false,error}`. Validate sender identity, return `true` while replying asynchronously, and retain useful error messages. Scripts inject in matching frames; no-video frames must not win the reply race. Multiple video-bearing frames remain an area requiring explicit testing before claiming robust embedded-player support.

`chrome.storage.local` keys combine origin and display-shape class: wide (>2:1), compact (<1.7:1), or standard. This is not unique-monitor identification or cross-device sync. Loading uses a generation counter so late storage reads do not undo user changes. Preserve existing saved preferences when changing schemas or document a migration.

## Modify and validate

1. Inspect `git status` and preserve unrelated edits. Identify the smallest affected files. Do not edit generated `release/` files as the source of truth.
2. Keep code local and CSP-compatible: no remote scripts, inline HTML event handlers, eval, new Function, unnecessary packages or broader host permissions. Content-script template markup and normal registered event listeners are intentional.
3. Make a focused change. For a new player integration, inspect its actual DOM and test it separately; host matching alone is not compatibility evidence.
4. Run proportionate checks:

```sh
# Packaging/static validation; Node is not required for these two commands.
python3 scripts/package.py
python3 scripts/validate_extension.py release/Fillframe

# Equivalent package/static check when Node/npm are available.
npm test

# JavaScript syntax checks, when JavaScript changes.
node --check src/content_script.js
node --check src/popup.js

# Optional development dependencies and meaningful browser checks.
npm ci
node tests/smoke.mjs
node tests/youtube.mjs
node tests/tooltip.mjs
```

`npm ci` may download Puppeteer's test browser. Python's standard library is sufficient for packaging/validation; Windows can use `py -3`. Browser tests create isolated profiles, close them in `finally`, and write evidence under ignored `output/playwright/`. Network tests may encounter a cookie dialog in a separate frame; report the actual blocker instead of weakening assertions. Do not use a user's logged-in profile as a test fixture.

Run the fixture check for geometry, message, storage or lifecycle changes; the live YouTube check for toolbar/player integration; the tooltip check for tooltip changes. Inspect rendered screenshots for visual edits. Documentation-only changes need link/package checks, not repeated live playback tests.

The static validator does not prove runtime correctness. Warnings do not fail its exit code. It skips directories named `dist` or `build` anywhere in their path and may falsely flag test helpers such as `waitForFunction`; validate the production `release/Fillframe` folder, and inspect warnings. The legacy `npm run validate:extension` scans the whole checkout and can therefore flag test code.

## Package, update and contribute

- Keep release version consistent in manifest.json, package.json and package-lock.json for a shipped runtime change. Documentation-only changes need not bump the extension version.
- Package from source, verify referenced assets exist, and inspect the ZIP allowlist. Never include node_modules, browser profiles, credentials, local recordings/screenshots, private restart notes or machine-specific paths.
- README links to the setup prompt. Include relevant docs and both licenses in packages. Preserve the third-party MIT notice when retaining its scaffold/validator material.
- Explain what changed, why, which checks passed and which were not run. A fixture pass is not live-site acceptance; one Chromium build is not all Chromium browsers.
- Use a focused branch/commit/PR when the task calls for contribution. Push or publish only when the user requests it or the working repository's explicit workflow authorizes it. Do not alter global Git identity or force-push others' work.
- Browser installation uses the supported Extensions UI. If tools block it, provide the exact Load unpacked folder and hand off that step. Never bypass browser/tool restrictions, edit profile databases or disable protections.
- An installed unpacked copy requires extension Reload plus a video-page refresh after source/package updates. Do not report installation/update success from a saved file alone.

## Known boundaries

YouTube-first, desktop Chromium target. Netflix and Disney+ hostnames are enabled but their playback is not established by the YouTube tests. Other sites are not enabled. Physical multi-monitor transitions and other browser brands need separate checks. No automatic encoded-bar detection, HDR processing, interpolation, DRM circumvention, Safari/Firefox/mobile support or Web Store approval is claimed. Do not silently expand these promises.
