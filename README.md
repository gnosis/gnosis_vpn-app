# Gnosis VPN client applications

## Development

You need a working instance of [Gnosis VPN client service](https://github.com/gnosis/gnosis_vpn-client)
running on your system on the default socket.

### Linux

In order to start development, run a local dev server via:

```sh
nix develop --command deno install
nix develop --command deno task tauri dev
```
