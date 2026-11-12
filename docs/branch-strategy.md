# Branch strategy

## Lines

`main` is the only release line. It tracks the client's `main` through the
`gnosis_vpn-ipc` crate (`branch = "main"`); `Cargo.lock` pins the exact rev,
advanced via `cargo update`.

| Branch            | Versions                       | Tracks client | Client crate pin                    |
| ----------------- | ------------------------------ | ------------- | ----------------------------------- |
| `main`            | `0.100.0` and up, `1.0.0-rc.N` | `main`        | `gnosis_vpn-ipc`, `branch = "main"` |
| `release/hoprdv4` | frozen at `0.38.x`             | —             | —                                   |

`release/hoprdv4` carried the app for the client's hoprd v4 line, kept below
`0.100.0`. Its last release is 0.38.1 (installer 0.97.1, the final v4 stable).
It takes no more changes, and the backport/forwardport automation between the
two branches is gone.

## Publishing

Merging a PR publishes `<version>+pr.<N>` from `main`'s `src-tauri/Cargo.toml`
to the `gnosis_vpn-app` artifact registry package. The installer (`gnosis_vpn`)
packages the newest such build at or above `0.100.0` into its nightly snapshot,
so a stray v4 build never ships.

Label a merged PR `installer-build` to dispatch a snapshot build right away
instead of waiting for the nightly.

Release candidates are set with Bump version's `custom_version` (`1.0.0-rc.1`,
then `1.0.0-rc.2`, …, then `1.0.0`); `release_type` refuses to bump a
prerelease.

## Release order with the client

The Rust side matches on the ipc crate's `Response` enum and serde rejects
variants it does not know, so a client that answers with a new variant breaks an
older app at the first poll. Whenever a client change adds a `Response` variant,
the app release that carries the matching ipc pin must reach users **before**
that client release.
