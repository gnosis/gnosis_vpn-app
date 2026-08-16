---
name: bump-client-ref
description: Bump the pinned gnosis_vpn-client rev in src-tauri/Cargo.toml and fix everything that breaks — Rust call sites, serialize_fixtures.rs, TypeScript Zod schemas, and (occasionally) the nix toolchain. Use when asked to update/bump the gnosis_vpn-client dependency, ref, or rev, or when gnosis_vpn-client gets new commits that gnosis_vpn-app should pick up.
---

# Bump the gnosis_vpn-client ref

`src-tauri/Cargo.toml` pins `gnosis_vpn-lib` to a commit of the sibling
`gnosis_vpn-client` repo via a git `rev`. There is no automation for doing
this locally (`renovate.json` explicitly disables auto-bumping this
dependency — manual bumps are expected); `.github/workflows/bump-version.yaml`
does the equivalent in CI, and is the ground truth for the exact commands
below. This skill is the manual/local walkthrough, plus the failure modes
that workflow doesn't have to handle interactively.

## 1. Find the target rev and diff the API

Find the sibling client checkout (usually `../gnosis_vpn-client` next to this
repo) and the current pinned rev:

```bash
grep gnosis_vpn-lib src-tauri/Cargo.toml   # current rev
cd ../gnosis_vpn-client && git rev-parse HEAD   # target rev (or whatever ref you were asked to bump to)
```

Diff the library crate's public API between the two revs — this tells you
exactly what needs fixing before you touch anything:

```bash
git log --oneline <old-rev>..<new-rev> -- gnosis_vpn-lib
git diff <old-rev>..<new-rev> -- gnosis_vpn-lib
```

Read every hunk that touches a `pub struct`/`pub enum`/`pub fn` signature.
Ignore private (`fd_passing`, internal `wg_tunnel` plumbing, etc.) — only
public surface can break the app.

## 2. Find every place the app touches the changed types

```bash
grep -rn "gnosis_vpn_lib" src-tauri/src
```

As of writing this touches: `commands.rs` (Tauri commands, `COMPATIBLE_VERSIONS`),
`types.rs` (the sanitized library→UI conversion boundary — **the most likely
place to need hand-edits** when a lib struct/enum changes shape), `settings.rs`,
`icons.rs`, `platform/macos.rs`, `lib.rs`. Also check:

- `src-tauri/tests/serialize_fixtures.rs` — hand-constructs lib types (may
  build the *same* type more than once — e.g. once for a `RunMode` fixture,
  again for a `BalanceResponse` fixture; fix every literal, not just the first).
- `src/services/vpnService.ts` and `src/stores/settingsStore.ts` — Zod schemas
  that hand-mirror the lib's serde output.
- `src/utils/*.test.ts` — hand-built fixture objects typed against the
  `vpnService.ts` schemas (TypeScript will flag these with a clear "missing
  properties" error once the schema changes).

## 3. Bump the rev and refresh the lockfile

```bash
# src-tauri/Cargo.toml
gnosis_vpn-lib = { git = "https://github.com/gnosis/gnosis_vpn-client.git", rev = "<new-rev>" }
```

Try the same command CI uses first:

```bash
nix develop --command cargo update --workspace --manifest-path src-tauri/Cargo.toml
```

**This can fail** with something like:

```
error: failed to select a version for `tokio`.
    ... required by package `edgli ... which satisfies git dependency `edgli` of gnosis_vpn-lib ...
versions that meet the requirements `^1.53.1` are: 1.53.1
previously selected package `tokio v1.52.3` ... locked to 1.52.3
```

`--workspace` deliberately restricts updates to workspace-member versions and
leaves every other locked dependency alone (per the comment above the
equivalent CI step) — so it won't bump `tokio` (or whatever else) even though
the new `gnosis_vpn-lib` needs a newer one transitively. Fix by explicitly
including the blocking crate(s):

```bash
nix develop --command cargo update -p gnosis_vpn-lib -p tokio --manifest-path src-tauri/Cargo.toml
```

Expect a *large* lockfile diff when the client pulls in hoprnet/edge-client
bumps (dozens of transitive crates) — that's normal, not a mistake. Don't try
to hand-minimize it.

## 4. Fix compile breaks

`nix develop --command cargo build --manifest-path src-tauri/Cargo.toml` and
work through the errors. Recurring pattern: when a lib struct grows past
clippy's `large_enum_variant` threshold, the lib boxes the field
(`Option<T>` → `Option<Box<T>>`). Fixes needed at every call site:

```rust
// old: field.map(Into::into)
// new: field.map(|b| (*b).into())          // deref before converting
```

If the app's own sanitized type in `types.rs` mirrors that field 1:1 (or you're
adding the lib's new fields to the sanitized type — see below), it will likely
trip the *same* lint once it grows, since `cargo clippy` runs the same check
on this crate. Mirror the lib's fix: box the sanitized field too
(`Option<T>` → `Option<Box<T>>`), not just the lib-facing one.

If a lib struct gained fields and `types.rs` intentionally re-exposes them
(not just drops them at the sanitization boundary), follow the existing
per-field convention in that file: balance amounts become raw-hopli integer
`String`s via `.amount().to_string()` (never the lib's `serde_utils::balance`
`"1 wxHOPR"` display format — unparseable by JS `BigInt()`), counts stay
plain integers.

## 5. Regenerate fixtures and fix the TS side

```bash
nix develop --command cargo test --test serialize_fixtures --manifest-path src-tauri/Cargo.toml
```

This overwrites `src/services/fixtures/*.json` from real Rust serde output —
`git diff --stat src/services/fixtures/` should show changes *only* for
fixtures touching the type(s) you changed. Then:

```bash
nix develop --command deno task test   # tsc --noEmit && vitest run
```

`tsc` will point at every Zod schema and hand-built TS fixture that needs the
new/changed fields. Mirror the same convention as step 4: wei amounts as
`BigIntStringSchema`, counts as `z.number()` (see `CapacitySchema` in
`vpnService.ts` for precedent).

## 6. Check `COMPATIBLE_VERSIONS`

`src-tauri/src/commands.rs` gates on the client's reported service version.
A bare entry like `"0.94.0"` is a **caret requirement** (`^0.94.0` →
`>=0.94.0, <0.95.0`), not a prefix match — so it silently stops matching once
the client crosses a minor version boundary. Compare the new client's
workspace `version` (`gnosis_vpn-client/Cargo.toml`) against
`COMPATIBLE_VERSIONS` and bump if needed; the repo's own bump-version
workflow has an input for this exact purpose.

## 7. Toolchain: watch for an MSRV bump

If `cargo build` instead fails with:

```
error: rustc 1.94.1 is not supported by the following packages:
  hopr-... requires rustc 1.97
```

the new dependency tree needs a newer compiler than this repo's `flake.lock`
provides (the devShell gets `rustc`/`cargo` from nixpkgs directly — there's no
`rust-toolchain.toml` here, unlike `gnosis_vpn-client`). This is a
whole-devShell change (every package pulled from nixpkgs moves, not just
rustc) — **check with the user before doing it**, then:

```bash
nix flake lock --update-input nixpkgs
nix develop --command rustc --version   # confirm it's high enough now
```

Watch `nix fmt` afterwards for unrelated formatter-version churn (a newer
nixpkgs can ship a newer `deno`, which may reflow files nothing here touched,
e.g. `index.html`'s inline `<style>` indentation). Check `git diff --stat`
after formatting and `git checkout -- <file>` anything unrelated to this bump.

## 8. Final verification

```bash
nix develop --command cargo test --manifest-path src-tauri/Cargo.toml   # full suite, not just serialize_fixtures
nix develop --command cargo clippy --manifest-path src-tauri/Cargo.toml
nix develop --command deno task test
nix fmt
git diff --stat   # sanity-check the file list matches what you touched
```

Manual smoke test (optional but recommended for anything touching the
Tauri↔client socket protocol): build and install the `.deb` per
`README.md`'s "Install the locally-built `.deb` (Linux)" section, and drive
the code path your change actually touches (e.g. the PreparingSafe/onboarding
flow for a `BalanceRecommendation` change) against a real client daemon.

## 9. Commit

One commit is usually right: `chore(deps): bump gnosis_vpn-client to <short-sha> (<version>)`,
body noting what broke and how it was fixed (see `git log --grep "bump gnosis_vpn-client"`
for precedent). If you fix an unrelated pre-existing bug you tripped over while
running the full test suite (it happens — stale tests don't always get updated
when a hardcoded constant changes elsewhere), call it out explicitly in the
commit body as a separate concern from the rev bump itself.

If the same bump is needed on more than one branch, don't redo the manual work —
`git cherry-pick <sha>` the commit onto the other branch(es).
