# Gnosis VPN client applications

## Supported Platforms

The Gnosis VPN application supports the following platforms and architectures:

### macOS

- **universal-darwin** - Universal binary (Intel + Apple Silicon)
- **aarch64-darwin** - Apple Silicon (M1/M2/M3)
- **x86_64-darwin** - Intel-based Macs

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

- Install [Prerequisites](https://v2.tauri.app/start/prerequisites/)
- `deno install`
- `deno task tauri dev`

#### Building for specific architectures

```bash
# Build for Apple Silicon
deno task tauri build --target aarch64-apple-darwin

# Build for Intel Macs
deno task tauri build --target x86_64-apple-darwin

# Build universal binary (recommended for distribution)
deno task tauri build --target universal-apple-darwin
```

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

- **macOS**: universal-darwin, aarch64-darwin, x86_64-darwin
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
