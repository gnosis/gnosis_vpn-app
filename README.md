# Gnosis VPN client application

## Reporting Issues

We use **[Gnosis VPN](https://github.com/gnosis/gnosis_vpn)** repository as the
central hub for all user feedback.

### How to report an issue

1. Visit
   [Gnosis VPN Discussions](https://github.com/gnosis/gnosis_vpn/discussions)
   board.
1. Search existing Discussions and
   [Issues](https://github.com/gnosis/gnosis_vpn/issues) to see if your topic is
   already covered.
1. If not, start a new Discussion in the
   [Issues & Bug Reports](https://github.com/gnosis/gnosis_vpn/discussions/new?category=issues-bug-reports)
   category.
1. Provide as much detail as possible using the provided template.

The team will review all discussions and promote confirmed bugs or planned
features to actionable issues. This repository is reserved for tracking
actionable work on this component.

## Supported Platforms

The Gnosis VPN application supports the following platforms and architectures:

### macOS

- **aarch64-darwin** - Apple Silicon

### Linux

- **x86_64-linux** - 64-bit Intel/AMD Linux
- **aarch64-linux** - 64-bit ARM Linux (e.g., Raspberry Pi 4/5, AWS Graviton)

## Development

You need a working instance of
[Gnosis VPN client service](https://github.com/gnosis/gnosis_vpn-client) running
on your system on the default socket.

### Linux

In order to start development, run a local dev server via:

```sh
nix develop --command deno install
nix develop --command deno task tauri dev
```

### macOS

- Install [Prerequisites](#prerequisites)
- `deno install`
- `deno task tauri dev`

#### Prerequisites

1. Install [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
   (Xcode and Rust)
   - If you don’t have Xcode tooling yet, Apple’s docs explain how to install
     [Command Line Tools for Xcode](https://developer.apple.com/documentation/xcode/installing-the-command-line-tools/)
     (e.g. `xcode-select --install`). That is usually enough without installing
     the full Xcode app; you may be prompted to accept the license on first use.
   - Install Rust via [rustup](https://rustup.rs/). If you plan to build
     Intel-only or universal binaries, also install the corresponding Rust
     targets: `rustup target add aarch64-apple-darwin x86_64-apple-darwin`
2. Install Deno — choose one of:
   - **Homebrew** (requires installing Homebrew first): `brew install deno`
     (Homebrew install docs: https://brew.sh/)
   - **Official installer**: `curl -fsSL https://deno.land/install.sh | sh`
     (then ensure Deno is on your `PATH`:
     https://docs.deno.com/runtime/getting_started/installation/)
   - **Nix** (if you have Nix installed): enter the dev shell with `nix develop`
     — Deno, Rust, and all tools are provided automatically, then run the
     commands below without the `nix develop --command` prefix
3. `deno install` (if you get errors about lifecycle scripts, use
   `deno install --allow-scripts`)
4. `deno task tauri dev`

#### Adding npm packages

```bash
deno add npm:<package-name>           # dependency
deno add npm:<package-name> --dev     # dev dependency
```

#### Build and run

```bash
deno task tauri build
```

You can add `--target` for `x86_64-apple-darwin`, `aarch64-apple-darwin`,
`universal-apple-darwin`, `x86_64-linux`, `aarch64-linux`.

### Code Signing (macOS)

To convert a developer certificate so it can be used by tauri build flow, follow
these steps:

Import key and certificate into keychain access:

```bash
$ ls -l
gnosisvpn.key
gnosisvpn.pem
$ keychain_pass=<anypass>
$ security create-keychain -p "$keychain_pass" build.keychain
$ security default-keychain -s build.keychain
$ security unlock-keychain -p "$keychain_pass" build.keychain
$ security set-keychain-settings -t 3600 -u build.keychain
$ security import gnosisvpn.pem -k build.keychain
1 certificate imported.
$ security import gnosisvpn.key -k build.keychain
1 key imported.
```

Open keychain access, find certificates, click export and choose .p12 format.
Use `<anypass>` from the previous step to unlock the keychain. Set a strong
password for the exported .p12 file and configure the
`APPLE_CERTIFICATE_PASSWORD` env in the CI with this password.

```bash
$ ls -l
gnosisvpn.key
gnosisvpn.pem
gnosisvpn.p12
$ openssl base64 -in ./gnosisvpn.p12 -out gnosisvpn-base64.txt
$ security delete-keychain build.keychain
```

Set the content of `./gnosisvpn-base64.txt` as `APPLE_CERTIFICATE_BASE64` env in
the CI.

### Continuous Integration

The CI will check formatting and linting, and build binaries for all supported
architectures.

#### Supported Build Architectures

The CI builds binaries for the following platforms:

- **macOS**: aarch64-darwin
- **Linux**: x86_64-linux, aarch64-linux

Linux builds are performed on GitHub-hosted runners:

- `ubuntu-22.04` for x86_64-linux
- `ubuntu-22.04-arm` for aarch64-linux

Run formatting locally via:

```sh
nix fmt
```

Run linting locally via:

```sh
nix develop --command deno lint --fix
```
