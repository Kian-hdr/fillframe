# Fillframe

An experimental, free Manifest V3 extension for framing web video. No account, paywall, telemetry or runtime dependency.

## Install locally

1. Run `python3 scripts/package.py`, or use the supplied release folder.
2. Open `chrome://extensions` in desktop Chrome and enable Developer mode.
3. Click **Load unpacked** and select the **Fillframe** folder inside **release**. Keep that folder in place.
4. Pin Fillframe from Chrome's Extensions menu and refresh existing video tabs.
5. Start a video. Use **Fill** in the player or **Fill player** in the toolbar popup. On YouTube, click the crop-frame icon beside fullscreen: it immediately switches to automatic fill, without opening controls. Click again to restore original. Geometry follows the player size, including fullscreen and resize. Other players retain the floating fallback.

Use **Original** to restore framing immediately. **Picture ratio** describes the useful picture inside any encoded bars; **Video size** uses the video's intrinsic dimensions. Filling crops edges without stretching. Extra zoom and position controls fine-tune the result. Remembered settings are local to this browser, site and display-shape class (compact, standard or wide), not a unique physical monitor. Alt+Shift+F toggles framing while the page has focus outside text fields.

Uninstall through the extension's **Remove** button and refresh affected tabs. Disable other video-zoom extensions on the same page to avoid competing modifications.

## Compatibility and limits

This is an initial personal-use build, not a published store extension. Static injection is limited to YouTube, Netflix and Disney+ hostnames. Other sites are not enabled. Desktop Chromium browsers are the target, but each browser and service needs testing. Safari, Firefox and mobile Chrome are outside this version.

No automatic pixel-based black-bar detection, HDR processing, frame interpolation or DRM bypass is included. Manual picture ratios handle many encoded-bar cases. Protected players, unusual nested containers, embedded videos, site redesigns and fullscreening a video element directly may need site-specific integration. Captions burned into the picture are cropped with it; separate player captions are not deliberately transformed.

## Verification

Version 0.1.4 was checked in isolated Chrome 153.0.8010.36: ten fixture/popup checks passed, plus live YouTube direct toolbar fill/fullscreen/restoration and native-tooltip styling/keyboard checks. Running the tests writes fresh evidence under `output/playwright/`; local recordings and browser screenshots are not published. Fixture tests use the real extension with controlled video and page content; they do not prove streaming-provider support. Physical MacBook/ultrawide transitions, Netflix/Disney+ playback and other browser brands require separate validation.

## Development

No build step is required for runtime files. Node/Puppeteer is used only for validation. `npm ci`, `node tests/smoke.mjs`, and `node tests/youtube.mjs` run the isolated browser checks. The live YouTube check requires network access. `npm test` packages production files and runs the static extension validator.

The extension requests `storage` plus static content-script access to the listed services. It has no network client or service worker. Popup messages update a content script in the video page; that script modifies only selected video/container CSS properties and stores requested preferences with `chrome.storage.local`.

The scaffold and static validator derive from Yashraj Nayak's MIT-licensed build-chrome-extension skill. See THIRD-PARTY-LICENSE.txt. Original project contributions are provided under the MIT license in LICENSE. Fillframe is an experimental project name; no trademark clearance or affiliation with YouTube, Google, Netflix or Disney is claimed.
