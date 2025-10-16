# Configuration Files Directory

This directory contains all configuration files and templates used by the Gnosis VPN installer.

## Directory Structure

```
config/
├── README.md              # This file - documentation
├── system/               # System configuration files
│   └── org.gnosis.vpn.plist  # LaunchD service configuration
└── templates/           # Configuration templates
    ├── dufour.toml.template   # Dufour network configuration template
    └── rotsee.toml.template   # Rotsee network configuration template
```

## System Configuration Files

### `system/org.gnosis.vpn.plist`
LaunchD service configuration for automatic startup and management of the Gnosis VPN service.

**Features:**
- Automatic startup on system boot (`RunAtLoad=true`)
- Automatic restart on crashes (`KeepAlive`)
- Resource limits and security configuration
- Logging to `/var/log/gnosis_vpn/`
- Runs as root with wheel group permissions

## Configuration Templates

### `templates/*.toml.template`
TOML configuration templates for different network environments.

**Available Networks:**
- **rotsee**: Default production network
- **dufour**: Development/testing network

**Template Structure:**
```toml
[destinations.0xAddress]
meta = { location = "Country" }
path = { intermediates = ["0xIntermediateAddress"] }
```

## Usage

These configuration files are automatically processed during installation:

1. **Templates** are copied to `/etc/gnosisvpn/templates/` during package installation
2. **System configs** are processed by postinstall scripts to set up services
3. The installer selects appropriate templates based on the `INSTALLER_CHOICE_NETWORK` environment variable

## Customization

To customize the installer configuration:

1. **Add new network templates**: Create new `.toml.template` files in `templates/`
2. **Modify service behavior**: Edit `system/org.gnosis.vpn.plist`
3. **Update build process**: Modify references in `../build-pkg.sh` and `../scripts/postinstall`

## File Ownership

- **Templates**: Copied to target system during installation
- **System configs**: Used by installer scripts, not copied to target system
- **Documentation**: Local reference only