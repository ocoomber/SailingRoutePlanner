// Loading / error / raw-log surfaces. Kept apart from the trail so the trail
// module only deals in cards.

export function showError(message) {
  const box = document.getElementById('status-box');
  if (!box) return;
  box.classList.remove('hidden');
  box.innerHTML = '';
  const strong = document.createElement('strong');
  strong.textContent = 'Error: ';
  box.appendChild(strong);
  box.appendChild(document.createTextNode(message));
}

export function hideError() {
  const box = document.getElementById('status-box');
  if (box) box.classList.add('hidden');
}

export function showLoading() {
  const mapEl = document.getElementById('map');
  if (!mapEl || document.getElementById('loading-overlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'loading-overlay';
  overlay.id = 'loading-overlay';
  overlay.textContent = 'Calculating route…';
  mapEl.appendChild(overlay);
}

export function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.remove();
}

export function showWarnings(warnings) {
  const box = document.getElementById('passage-warnings');
  if (!box) return;
  box.innerHTML = '';
  if (!warnings || warnings.length === 0) {
    box.classList.add('hidden');
    return;
  }
  box.classList.remove('hidden');
  const list = document.createElement('ul');
  for (const warning of warnings) {
    const li = document.createElement('li');
    li.textContent = warning;
    list.appendChild(li);
  }
  box.appendChild(list);
}
