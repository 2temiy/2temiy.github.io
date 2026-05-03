# Test Plan — Telegram Bot Control Panel (PR #4)

## What's being tested
PR #4 adds a web control panel for the Telegram moderation bot: a login screen → grid of chats where the bot is configured → per-chat management panel with 11 tabs (Dashboard, Feed, Send, Members, Staff, Mod-log, Tops, Clans, Rules, Settings, Manage).

Latest commit `6caac61` also fixes 3 issues found by Devin Review:
- 🔴 Members list: `replace(/'/g, "\\'")` was a no-op inside the worker.js template literal → potential XSS via crafted display name
- 🔴 Staff list: same root cause
- 🟡 `logout()` did not call `clearInterval(FEED_TIMER)` → feed kept polling after logout

The fix replaces inline `onclick` handlers with `addEventListener` + `data-*` attributes (no string concat into JS source) and clears the timer on logout.

## How testing will run
- Standalone `tg-panel/dashboard.html` is served by a local Python mock server on `http://127.0.0.1:8088` (the dashboard's `apiFetch` uses relative URLs, so same-origin mock works).
- Mock server fakes every `/api/*` endpoint with deterministic data designed to trigger the change. In particular the members & staff payloads include adversarial display names that would have fired `alert()` with the buggy escaping.
- Browser DevTools console is the source of truth for "did the XSS fire / did the timer stop".

## Adversarial test cases

### T1 — Login screen accepts password and shows chat picker
- **Action:** Open `http://127.0.0.1:8088/dashboard`, type `testpass` in the password field, click ВОЙТИ.
- **Expected pass:** `#login-screen` is hidden, `#app` is visible, `#chat-picker` shows two cards labelled "Главный чат" and "Тест канал".
- **Would-fail-if-broken:** With a broken `enterApp()` or auth, password submission either errors or the chat grid renders empty.

### T2 — Clicking a chat opens the management panel on Dashboard tab
- **Action:** Click the "Главный чат" card.
- **Expected pass:** `#chat-picker` hides, `#chat-panel` shows. Active tab is "📊 Дашборд". Stat tiles populated: `Сообщений (лог) = 4`, `Варны (всего) = 7`, `Участники = 1 234`, `Стафф = 3`. "Топ нарушителей" panel shows ≥1 row. "Информация о чате" panel shows title and type badge.
- **Would-fail-if-broken:** If `enterChat()` doesn't pass `c` correctly, stat tiles stay `—`. If `loadStats()` is broken, "Топ нарушителей" stays empty.

### T3 — Feed tab shows mock messages and auto-refresh updates them
- **Action:** Click "💬 Лента" tab.
- **Expected pass:** `#feed` shows 3+ mock message cards. Each card has 3 buttons: "🗑 Удалить", "📌 Закрепить", "🔨 Бан автора". After ≤5 sec, mock server returns a 4th message and the feed updates (since `feed-auto` is checked).
- **Would-fail-if-broken:** If `loadFeed()` doesn't call `wireFeedButtons(el)`, the buttons exist visually but won't react to clicks. If `FEED_TIMER` regression is present, no auto-refresh happens.

### T4 — Members tab: XSS payload in display_name does NOT execute, action buttons still work
- **Critical assertion of the fix.**
- **Action:** Click "👥 Участники" tab. Mock returns a member with `display_name = "');alert('XSS_FROM_NAME');//"` and another with `display_name = "<img src=x onerror=alert('XSS_FROM_IMG')>"`.
- **Expected pass:**
  - No `alert()` dialog appears.
  - DevTools console has no execution of either XSS string (verified by an instrumented `window.__xssFired` flag we set in console before running).
  - The member rows render with the literal text shown (HTML-entity-escaped).
  - Click "🔇 Мут" on the malicious row → `muteUser(...)` is invoked with the literal string as the `name` arg (verified: a stub on `window.muteUser` records the args and our test reads them).
  - In a buggy build, the previous `replace(/'/g, "\\'")` was a no-op, so the literal `'` in the display name would have closed the JS string in the inline `onclick` and executed `alert('XSS_FROM_NAME')`. The new `data-uname` path can't reach that codepath at all.
- **Would-fail-if-broken:** If we accidentally re-introduced inline `onclick` with string concat, the alert would fire on render OR on button click.

### T5 — Staff tab uses the same data-attr pattern (regression mirror of T4)
- **Action:** Click "👮 Стафф" tab. Mock includes one staff entry with `name = "Mr ' OR 1=1"`.
- **Expected pass:** Row renders, no alert fires. Clicking "⚙ Ранг" invokes `setRankPrompt(uid, name, rank)` with the literal name.

### T6 — Logout clears the feed auto-refresh timer (🟡 fix)
- **Action:** Open Feed tab (starts `FEED_TIMER`). Click "Выйти".
- **Expected pass:**
  - `#login-screen` is visible, `#app` is hidden.
  - DevTools network panel shows ZERO `/api/messages` requests in the 8 seconds after logout (i.e. ≥2 polling intervals of 4s have elapsed).
  - Before the fix, logout would leave the interval running, generating two 4xx requests against the wiped password.
- **Would-fail-if-broken:** Network panel shows 1+ `/api/messages` requests after logout.

### T7 — Manage tab: "delete chat" requires confirmation (regression check, not in this commit but in the PR)
- **Action:** Click "🔧 Управление" tab. Click "Бот покидает чат и удаляет данные" without checking the confirmation checkbox.
- **Expected pass:** A toast/alert says "Подтверди удаление" or similar, no network request to `/api/delete-chat` is made.

### T8 — Chat-picker: HTML-entity payload in chat title does NOT execute (commit `11971a4`)
- **Critical assertion of the second XSS fix.**
- **Action:** Open the chat picker. The mock returns a chat with `title = "&#34;+alert('XSS_FROM_TITLE')+&#34;"`.
- **Expected pass:**
  - No `alert()` dialog fires while the picker renders.
  - The chat card renders the title as the literal text `&#34;+alert('XSS_FROM_TITLE')+&#34;` (HTML entities visibly preserved because the dashboard escapes through `esc()` and never injects raw entities into an attribute).
  - DOM inspection: the card uses `data-chat-idx="2"` (no embedded JSON in `onclick`).
  - Clicking the card calls `enterChat(CHATS_LIST[2])` with the literal object — observable as the card opening the per-chat panel without firing `alert`.
- **Would-fail-if-broken:** In the previous build, `JSON.stringify(c).replace(/"/g, '&quot;')` produced an `onclick` attribute whose `&#34;` sequences were decoded by the HTML parser into bare `"` characters, breaking out of the JS string and executing `alert('XSS_FROM_TITLE')`.

## Skipped / out of scope
- Real Telegram delivery (no live bot). Send/Kick/Ban only verified end-to-end against the mock — confirms the dashboard wires the API call, not Telegram-side semantics.
- CSS visual polish.
- Mobile breakpoints.
