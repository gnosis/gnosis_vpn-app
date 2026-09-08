# Branch strategy: stable (hoprd v4) vs experimental (hoprd v5)

## Why

The app embeds `gnosis_vpn-lib` from
[gnosis_vpn-client](https://github.com/gnosis/gnosis_vpn-client), which split
into a stable hoprd v4 line and an experimental hoprd v5 line with changing
APIs. The app mirrors that split so each line keeps compiling against — and
stays protocol-compatible with — its client line.

## Lines

| Line              | Versions                   | Tracks client     | `gnosis_vpn-lib` pin          |
| ----------------- | -------------------------- | ----------------- | ----------------------------- |
| `release/hoprdv4` | `0.3x.y`, kept `< 0.100.0` | `release/hoprdv4` | `branch = "release/hoprdv4"`  |
| `main`            | `0.100.0` and up           | `main`            | `rev = "<sha>"`, bumped by PR |

## Publishing

Both lines publish to the same `gnosis_vpn-app` artifact registry package; only
the version tells them apart, which is what the reserved `0.100.0` gap buys.
Merging a PR publishes `<version>+pr.<N>` from the base branch's
`src-tauri/Cargo.toml`.

"Close release" is dispatched from the branch being released: it builds that
branch, tags it, and lands the post-release bump on it. Dispatch it from `main`
for the experimental line and from `release/hoprdv4` for the stable one.

The installer snapshot dispatch stays `main`-only. `gnosis_vpn` resolves
registry versions newest-first by upload time rather than by version bound, so
it cannot yet tell the two lines apart; revisit once it can.

## Backports

Label a merged `main` PR `backport release/hoprdv4`;
`.github/workflows/backport.yaml` cherry-picks it and opens a PR that runs the
same CI as any other.
