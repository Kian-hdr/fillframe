const $ = (id) => document.getElementById(id);
let tabId;
let state = { mode: 'original', ratio: 'auto', zoom: 1, x: 0, y: 0, remember: false };
let queued = null;
let sending = false;
let revision = 0;
function draw() {
  for (const mode of ['original', 'fill']) $(mode).setAttribute('aria-pressed', String(state.mode === mode));
  $('mode-hint').textContent = state.mode === 'fill' ? 'Fill the frame. Some picture edges may be cropped.' : 'Keep the original framing.';
  for (const key of ['ratio', 'zoom', 'x', 'y']) $(key).value = String(state[key]);
  $('remember').checked = state.remember;
  $('zoom-value').textContent = `${Math.round(state.zoom * 100)}%`;
  for (const key of ['x', 'y']) {
    const value = state[key];
    const direction = key === 'x' ? (value < 0 ? 'Left' : 'Right') : (value < 0 ? 'Up' : 'Down');
    $(`${key}-value`).textContent = Math.abs(value) < .005 ? 'Center' : `${direction} ${Math.round(Math.abs(value) * 100)}%`;
  }
}
function fail(message = 'No video connection') {
  $('status').textContent = message;
  $('controls').disabled = true;
  $('controls').hidden = true;
  $('unavailable').hidden = false;
  document.body.dataset.ready = 'false';
}
function accept(response, updateState = true) {
  if (!response?.ok || !response.state) throw new Error(response?.error || 'Video unavailable');
  if (updateState) { state = { ...state, ...response.state }; draw(); }
  $('controls').disabled = false;
  $('controls').hidden = false;
  $('unavailable').hidden = true;
  document.body.dataset.ready = 'true';
  $('status').textContent = state.remember ? 'Framing remembered for this site' : 'Connected to your video';
  $('site').textContent = response.site || 'Your picture. Your space.';
  const video = response.video;
  $('dimensions').textContent = video?.width && video?.height ? `${video.width} × ${video.height}` : '';
}
async function connect() {
  $('status').textContent = 'Finding your video…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab');
    tabId = tab.id;
    accept(await chrome.tabs.sendMessage(tabId, { type: 'FF_GET' }));
  } catch { fail(); }
}
async function flush() {
  if (sending || !queued) return;
  sending = true;
  while (queued) {
    const patch = queued; queued = null;
    const sentRevision = revision;
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: 'FF_SET', patch });
      accept(response, sentRevision === revision);
    } catch (error) { queued = null; fail(error.message); }
  }
  sending = false;
}
function change(patch) {
  revision += 1;
  state = { ...state, ...patch };
  queued = { ...queued, ...patch };
  draw();
  void flush();
}
for (const mode of ['original', 'fill']) $(mode).addEventListener('click', () => change({ mode }));
$('ratio').addEventListener('change', () => change({ ratio: $('ratio').value, mode: 'fill' }));
for (const key of ['zoom', 'x', 'y']) $(key).addEventListener('input', () => change({ [key]: Number($(key).value), mode: 'fill' }));
$('remember').addEventListener('change', () => change({ remember: $('remember').checked }));
$('reset').addEventListener('click', async () => {
  // Queue the reset behind pending writes so a late slider response cannot undo it.
  $('reset').disabled = true;
  try {
    while (sending) await new Promise(resolve => setTimeout(resolve, 15));
    accept(await chrome.tabs.sendMessage(tabId, { type: 'FF_RESET' }));
  } catch { fail(); }
  finally { $('reset').disabled = false; }
});
$('retry').addEventListener('click', connect);
draw();
void connect();
