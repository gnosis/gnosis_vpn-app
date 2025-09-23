# Gnosis VPN client applications

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

### Continuous Integration

The CI will check formatting and linting.

Run formatting locally via:

```sh
nix fmt
```

Run linting locally via:

```sh
nix develop --command deno lint --fix
```
