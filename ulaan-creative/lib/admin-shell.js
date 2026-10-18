// HTML shell of the separate admin dashboard. The app itself is static JS/CSS in
// public/admin/assets; this file only sets the base path (/admin or the admin subdomain root).
import { esc } from './http.js';
import { ASSET_V } from './asset-version.js';

export function adminShell({ base }) {
  return `<!doctype html>
<html lang="mn" data-base="${esc(base)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#111111">
<title>Ulaan Creative — Admin</title>
<link rel="icon" href="/assets/img/favicon-32.png" type="image/png" sizes="32x32">
<link rel="stylesheet" href="/assets/css/fonts.css?v=${ASSET_V}">
<link rel="stylesheet" href="/admin/assets/admin.css">
<script type="module" src="/admin/assets/app.js"></script>
</head>
<body>
<noscript><p style="padding:24px">Admin dashboard-д JavaScript шаардлагатай.</p></noscript>
<div id="app" aria-live="polite"></div>
<div id="toasts" class="toasts" role="status" aria-live="polite"></div>
</body>
</html>`;
}
