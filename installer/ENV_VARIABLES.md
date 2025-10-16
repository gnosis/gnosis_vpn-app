# Environment Variables for Multi-Repository Binary Bundling

The installer now supports bundling binaries from GitHub releases using a single release URL. This allows you to specify a GitHub release and have the installer automatically download the required binaries based on expected naming conventions.

## Required Environment Variables

### GitHub Release URL
- `GITHUB_RELEASE_URL` - URL to a GitHub release (tag or download format)

The installer will automatically construct binary URLs based on this release URL and expected binary names:
- VPN Service: `gnosis_vpn-x86_64-apple-darwin` and `gnosis_vpn-aarch64-apple-darwin`
- VPN CLI: `gnosis_vpn-cli-x86_64-apple-darwin` and `gnosis_vpn-cli-aarch64-apple-darwin`

## Optional Environment Variables

### Tauri UI Application
- `TAURI_APP_URL` - URL to the Tauri app bundle

### Customization Variables
- `VPN_SERVICE_BINARY_NAME` - Override VPN service binary name (default: `gnosis_vpn`)
- `VPN_CLI_BINARY_NAME` - Override VPN CLI binary name (default: `gnosis_vpn-cli`)
- `X86_PLATFORM` - Override x86_64 platform suffix (default: `x86_64-apple-darwin`)
- `ARM_PLATFORM` - Override aarch64 platform suffix (default: `aarch64-apple-darwin`)

## Expected Binary Names in Release

For a release, the installer expects these binary files to be available:
- `gnosis_vpn-x86_64-apple-darwin` (VPN service for Intel Macs)
- `gnosis_vpn-aarch64-apple-darwin` (VPN service for Apple Silicon Macs)
- `gnosis_vpn-cli-x86_64-apple-darwin` (CLI utility for Intel Macs)
- `gnosis_vpn-cli-aarch64-apple-darwin` (CLI utility for Apple Silicon Macs)

## Usage Examples

### Example 1: GitHub Release Tag URL

```bash
# Point to a specific release tag
export GITHUB_RELEASE_URL="https://github.com/owner/repo/releases/tag/v1.0.0"

# Build the installer
cd installer
./build-pkg.sh latest
```

### Example 2: GitHub Release Download URL

```bash
# Point to a release download URL (also works)
export GITHUB_RELEASE_URL="https://github.com/owner/repo/releases/download/v1.0.0"

# Build the installer
cd installer
./build-pkg.sh v1.0.0
```

### Example 3: Including Tauri App

```bash
# Set GitHub release URL and Tauri app URL
export GITHUB_RELEASE_URL="https://github.com/owner/repo/releases/tag/v1.0.0"
export TAURI_APP_URL="https://another-repo.com/releases/v1.0.0/GnosisVPN.app.tar.gz"

# Build the installer
cd installer
./build-pkg.sh v1.0.0
```

### Example 4: Custom Binary Names

```bash
# Override binary names if they differ from defaults
export GITHUB_RELEASE_URL="https://github.com/owner/repo/releases/tag/v1.0.0"
export VPN_SERVICE_BINARY_NAME="custom_vpn_service"
export VPN_CLI_BINARY_NAME="custom_vpn_cli"

# This will look for:
# - custom_vpn_service-x86_64-apple-darwin
# - custom_vpn_service-aarch64-apple-darwin
# - custom_vpn_cli-x86_64-apple-darwin
# - custom_vpn_cli-aarch64-apple-darwin

cd installer
./build-pkg.sh latest
```

## URL Construction

The installer automatically constructs download URLs like this:

```
{GITHUB_RELEASE_URL}/{BINARY_NAME}-{PLATFORM}
```

For example, with:
- `GITHUB_RELEASE_URL="https://github.com/owner/repo/releases/download/v1.0.0"`
- Default binary names and platforms

The installer will download:
- `https://github.com/owner/repo/releases/download/v1.0.0/gnosis_vpn-x86_64-apple-darwin`
- `https://github.com/owner/repo/releases/download/v1.0.0/gnosis_vpn-aarch64-apple-darwin`
- `https://github.com/owner/repo/releases/download/v1.0.0/gnosis_vpn-cli-x86_64-apple-darwin`
- `https://github.com/owner/repo/releases/download/v1.0.0/gnosis_vpn-cli-aarch64-apple-darwin`

## Incremental Updates

When updating an existing installation, the installer:

1. **Detects Previous Installation**: Checks for existing version and binaries
2. **Compares Binaries**: Uses SHA-256 checksums to identify changes
3. **Updates Selectively**: Only replaces binaries that have changed
4. **Preserves Configuration**: Keeps user settings when compatible
5. **Creates Backups**: Automatically backs up replaced files

This makes updates faster and safer, especially for large binary files that haven't changed.

## Troubleshooting

### Update Issues
- **Version Mismatch**: Check `/etc/gnosisvpn/version.txt` for current version
- **Configuration Conflicts**: Use `gnosis-vpn-manager backups` to see available backups
- **Binary Corruption**: Compare checksums using `gnosis-vpn-manager status`

### Management Commands
```bash
# Check installation status
gnosis-vpn-manager status

# List available backups
gnosis-vpn-manager backups

# Restore configuration from backup
sudo gnosis-vpn-manager restore

# Clean up old backup files
sudo gnosis-vpn-manager cleanup
```

## Binary Requirements

### File Formats
- **VPN Service & CLI**: Raw executable binaries or binaries with proper executable permissions
- **Tauri App**: Can be `.app` bundles, `.dmg` files, or compressed archives (`.tar.gz`, `.zip`)

### Architecture Support
- **x86_64**: Intel-based Macs
- **aarch64**: Apple Silicon Macs (M1, M2, etc.)
- The installer will combine both architectures into universal binaries using `lipo`

## Installation Locations

The installer will place the binaries in the following locations:

- **VPN Service**: `/usr/local/bin/gnosis_vpn`
- **VPN CLI**: `/usr/local/bin/gnosis_vpn-ctl`  
- **Tauri App**: `/Applications/GnosisVPN.app` (if provided)

## Fallback Behavior

If environment variables are not set, the installer will fall back to the original behavior of downloading from the hardcoded GitHub repository:

```
https://github.com/gnosis/gnosis_vpn-client/releases/
```

## Validation

The installer will validate that:

1. All required environment variables are set when using URL mode
2. URLs are accessible and return valid binaries
3. Universal binaries can be created successfully
4. Proper file permissions are set

## Security Considerations

- URLs should use HTTPS for security
- Consider implementing checksum verification for external URLs
- GPG signature verification is only available for GitHub releases (fallback mode)
- Downloaded binaries should be from trusted sources

## Troubleshooting

### Common Issues

1. **Missing Environment Variables**: Ensure all required variables are set
2. **Download Failures**: Check that URLs are accessible and return valid binaries
3. **Permission Issues**: Ensure downloaded binaries have proper executable permissions
4. **Architecture Mismatch**: Verify that x86_64 and aarch64 versions are provided

### Debug Mode

Add debug output by setting:
```bash
export DEBUG=1
```

This will provide more verbose logging during the build process.