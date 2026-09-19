try { document.getElementById('version').textContent = chrome.runtime.getManifest().version; } catch { document.getElementById('version').textContent = ''; }
