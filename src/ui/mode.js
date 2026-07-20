// User vs developer UI. index.html sets <body data-mode="user">, debug.html sets
// data-mode="dev". One shared app.js reads this to gate dev-only layers,
// settings and tooling — the two pages differ only in their HTML shell and this
// flag, never in duplicated logic.

export function getMode() {
  return document.body?.dataset?.mode === 'dev' ? 'dev' : 'user';
}

export function isDev() {
  return getMode() === 'dev';
}
