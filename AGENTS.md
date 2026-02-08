# AGENTS.md - Gnosis VPN UI App

## Build, Lint & Test Commands

- **Dev**: `deno task tauri dev` (starts Vite + Tauri dev server on port 1420)
- **Build**: `deno task tauri build [--target ARCH]` (e.g.,
  `--target universal-apple-darwin`)
- **Format**: `nix fmt` (Deno + rustfmt via Treefmt)
- **Lint**: `nix develop --command deno lint --fix` (Deno linter for TS/JS)
- **Preview**: `vite preview` or `npm run serve`

## Architecture & Codebase

**Stack**: Solid.js (frontend) + Tauri 2 (desktop) + TypeScript + Tailwind CSS +
Vite

**Structure**:

- `src/` - TypeScript/JSX frontend (Solid.js components)
  - `components/` - Reusable UI components
  - `screens/` - Page-level components
  - `stores/` - Reactive state management
  - `services/` - API/Tauri integration logic
  - `utils/` - Helper functions
  - `windows/` - Tauri window definitions
- `src-tauri/` - Rust backend (Tauri commands, system integration)
- `public/` - Static assets
- Config: `vite.config.ts`, `tauri.conf.json`, `flake.nix` (Nix dev environment)

**Key Dependencies**: `@tauri-apps/api`, `solid-js`, `tailwindcss`, Deno (task
runner)

## Code Style & Conventions

- **TypeScript**: Strict mode enabled. Type all functions. Use `@src/*`,
  `@assets/*` path aliases.
- **Solid.js**: Functional components,
  `createSignal`/`createEffect`/`createMemo`, fine-grained reactivity, prefer
  `<Show>`/`<For>` over if/map.
- **Styling**: Tailwind utility classes only; no inline styles or CSS modules.
- **Naming**: Descriptive camelCase for functions/variables, PascalCase for
  components.
- **Exports**: Export only what's necessary; use JSDoc for public APIs.
- **Error Handling**: Validate all Tauri backend calls, handle async errors
  properly.
- **Testing**: Unit tests for utils/hooks; mock Tauri APIs; aim for edge cases.
- **Git**: No `--no-verify`. Follow pre-commit hooks (Deno lint, formatting).

**Copilot Instructions**: See `.github/copilot-instructions.md` for extended
patterns & Do's/Don'ts.
