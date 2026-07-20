// Renders the settings page from the schema. Every field shows its plain-English
// description, its default, whether you have changed it, and a per-field reset.

import { SETTINGS_GROUPS } from './settings-schema.js';
import { getValue, setValue, defaultFor, isChanged, resetField, resetAll, changedCount } from './settings-store.js';
import { mergeComfortParams } from '../core/comfort-params.js';
import { toComfortParams } from './settings-store.js';
import { isDev } from './mode.js';

// The user page hides pure router internals (time step, min heading change,
// heading resolution). Corridor width and every clearance/comfort setting stay.
function visibleFields(group) {
  return group.fields.filter(f => isDev() || !f.devOnly);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function fieldId(path) {
  return `set-${path.replace(/\./g, '-')}`;
}

function formatDefault(field) {
  const def = defaultFor(field.path);
  if (field.type === 'checkbox') return def ? 'on' : 'off';
  if (def === null || def === undefined) return 'blank (automatic)';
  return `${def}${field.unit ? ' ' + field.unit : ''}`;
}

function buildInput(field, onChange) {
  const id = fieldId(field.path);
  const value = getValue(field.path);

  const input = document.createElement('input');
  input.id = id;

  if (field.type === 'checkbox') {
    input.type = 'checkbox';
    input.checked = !!value;
    input.addEventListener('change', () => onChange(field, input.checked));
    return input;
  }

  input.type = 'number';
  if (field.step != null) input.step = String(field.step);
  if (field.min != null) input.min = String(field.min);
  if (field.max != null) input.max = String(field.max);
  input.value = value === null || value === undefined ? '' : String(value);

  input.addEventListener('change', () => {
    if (field.nullable && input.value.trim() === '') {
      onChange(field, null);
      return;
    }
    const parsed = parseFloat(input.value);
    onChange(field, Number.isNaN(parsed) ? defaultFor(field.path) : parsed);
  });
  return input;
}

function buildField(field, rerender) {
  const wrap = el('div', 'setting-field');
  if (isChanged(field.path)) wrap.classList.add('changed');

  const head = el('div', 'setting-head');
  const label = el('label', 'setting-label', field.label + (field.unit ? ` (${field.unit})` : ''));
  label.htmlFor = fieldId(field.path);
  head.appendChild(label);

  const input = buildInput(field, (f, value) => {
    setValue(f.path, value);
    rerender();
  });
  head.appendChild(input);
  wrap.appendChild(head);

  const meta = el('div', 'setting-meta');
  meta.appendChild(el('span', 'setting-default', `default ${formatDefault(field)}`));
  if (isChanged(field.path)) {
    meta.appendChild(el('span', 'setting-changed-badge', 'changed'));
    const reset = el('button', 'setting-reset', 'reset');
    reset.type = 'button';
    reset.addEventListener('click', () => { resetField(field.path); rerender(); });
    meta.appendChild(reset);
  }
  wrap.appendChild(meta);

  wrap.appendChild(el('p', 'setting-description', field.description));
  return wrap;
}

function validationMessage() {
  try {
    mergeComfortParams(toComfortParams());
    return null;
  } catch (err) {
    return err.message;
  }
}

export function renderSettings() {
  const container = document.getElementById('settings-content');
  if (!container) return;
  container.innerHTML = '';

  const rerender = () => renderSettings();

  const error = validationMessage();
  if (error) {
    const box = el('div', 'settings-error');
    box.appendChild(el('strong', null, 'These settings are not valid: '));
    box.appendChild(document.createTextNode(error));
    box.appendChild(el('p', 'hint', 'Calculating a route will refuse until this is fixed.'));
    container.appendChild(box);
  }

  const summary = el('div', 'settings-summary');
  const count = changedCount();
  summary.appendChild(el('span', null,
    count === 0 ? 'All settings are at their defaults.' : `${count} setting${count > 1 ? 's' : ''} changed from default.`));
  if (count > 0) {
    const resetAllBtn = el('button', 'secondary-btn settings-reset-all', 'Reset all to defaults');
    resetAllBtn.type = 'button';
    resetAllBtn.addEventListener('click', () => { resetAll(); rerender(); });
    summary.appendChild(resetAllBtn);
  }
  container.appendChild(summary);

  for (const group of SETTINGS_GROUPS) {
    const fields = visibleFields(group);
    if (fields.length === 0) continue;
    const section = el('section', 'settings-group');
    section.appendChild(el('h2', 'settings-group-title', group.title));
    section.appendChild(el('p', 'settings-group-blurb', group.blurb));
    for (const field of fields) {
      section.appendChild(buildField(field, rerender));
    }
    container.appendChild(section);
  }
}
