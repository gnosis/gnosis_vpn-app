---
name: run-gnosis-vpn-app
description: Run, screenshot, and drive the Gnosis VPN UI headlessly. Renders any screen (main, settings, usage) in headless Chromium WITHOUT the Rust/Tauri backend, using a fixture-driven Tauri shim. Use to run the app, verify UI changes visually, take screenshots, or click through screens.
---

# Run the Gnosis VPN app (headless, no backend)

Solid.js + Tauri 2 desktop app. The Rust backend (and the VPN daemon it talks
to) is not needed to render the UI: `driver.ts` injects `shim.js` — a fake
`__TAURI_INTERNALS__` that answers the app's `invoke()` calls from
`fixture.json` — into a generated `index.browser.html`, serves it with the Vite
dev server, and drives headless Chromium over CDP.

All paths below are relative to the repo root. All commands were verified on
NixOS with `deno` 2.7 and `chromium` 149 on PATH (no `nix develop` needed for
these).

## Run + screenshot + interact (agent path)

```bash
deno run -A .claude/skills/run-gnosis-vpn-app/driver.ts \
  shot /tmp/main.png \
  click '[aria-label="Dismiss balance notification"]' \
  wait 500 \
  shot /tmp/main-after-dismiss.png
```

The driver starts the Vite dev server itself if port 1420 is free (and stops it
again), waits for the Solid app to mount, then executes the steps in order:

| Step              | Effect                                                  |
| ----------------- | ------------------------------------------------------- |
| `shot <file.png>` | screenshot to that path                                 |
| `click <css>`     | click first match (works with Solid's delegated events) |
| `text <css>`      | print innerText of first match                          |
| `eval <js>`       | evaluate JS, print JSON result                          |
| `wait <ms>`       | sleep                                                   |

Flags: `--fixture <path>` (default: the skill's `fixture.json`), `--size WxH`
(default `360x640` — the main window; settings window is `640x480`).

Browser console warnings/errors are relayed to stderr — watch for
`[tauri-shim] unhandled invoke: <command>`, which means the shim needs a new
handler in `shim.js`.

### Choosing what to render

The fixture drives the app's real logic — edit a copy, don't force UI state in
source:

- `cached_state.status.Ok.run_mode` — `{"Running": {...}}` reaches the main
  screen; `funding_issues: ["SafeLowOnFunds"]` shows the low-balance banner
  (`"Unfunded"` etc. → "empty" variant; see `FundingIssueSchema` in
  `src/services/vpnService.ts`).
- `windowLabel: "settings"` renders the settings window instead (use
  `--size 640x480`). Switch tabs by clicking the nav buttons, e.g. Usage:

```bash
deno run -A .claude/skills/run-gnosis-vpn-app/driver.ts --size 640x480 \
  --fixture /tmp/fixture-settings.json \
  eval "[...document.querySelectorAll('button')].find(b => b.textContent.includes('Usage')).click()" \
  wait 500 \
  shot /tmp/usage.png
```

Fixture shapes must satisfy the zod schemas in `src/services/vpnService.ts`
(`StatusResponseSchema`, `BalanceResponseSchema`) — amounts are wei integer
_strings_. An invalid fixture triggers `criticalError` and the app never leaves
the Initialization screen.

## Run (human path)

`deno task tauri dev` starts the full desktop app (Vite on port 1420 + Rust
backend; needs a display and the VPN service). Not usable headless; not verified
here.

## Test / lint

```bash
nix develop --command deno task typecheck
nix develop --command deno lint
nix fmt
```

## Gotchas

- **The static splash trap.** A screenshot showing the big "Gnosis VPN" logo + a
  title like "El Dorado" is NOT the app loading — it is the static fallback
  markup baked into `index.html`. It means the Solid app never mounted, almost
  always because `getCurrentWindow()` threw (no/broken `__TAURI_INTERNALS__`).
- **Screen changes are throttled.** `App.tsx` enforces `MIN_SCREEN_DISPLAY_TIME`
  (1333 ms) between screen switches. The driver waits this out after mount, but
  add `wait 1500` after any action that triggers a screen transition.
- **Theme comes from `matchMedia`, not the backend.** `index.tsx` overrides the
  backend theme with `prefers-color-scheme`, and headless Chromium defaults to
  light. `shim.js` patches `matchMedia` when the fixture says dark — answering
  `get_initial_theme` alone is not enough.
- **`settingsStore.load()` must succeed.** `App.tsx` awaits it before
  `initializeApp()` with no try/catch; if the `plugin:store|*` commands reject,
  no status is hydrated and no screen ever changes.
- **Don't edit source files while the dev server runs.** Deno's fs watcher
  crashes the whole server (`NotFound ... .tmp...` from `fs.watch`) when files
  are replaced via atomic rename, which is how Claude's Edit tool writes. Stop
  the server first (`pkill -f vite`), or let the driver manage the server
  lifecycle.
- **`pkill -f vite` after killing `deno task dev`.** The vite child survives its
  parent; the driver does this sweep automatically.

## Troubleshooting

- `error: app did not mount` — check stderr for `[browser exception]` /
  `[tauri-shim] unhandled invoke`. Usual causes: fixture fails a zod schema, or
  a new `invoke()` command needs a handler in `shim.js`.
- Driver hangs at `starting vite dev server…` then times out — a stale vite is
  holding port 1420 in a broken state; `pkill -f vite` and retry.
- `index.browser.html` in the repo root is generated by the driver on every run
  (gitignored); safe to delete.
