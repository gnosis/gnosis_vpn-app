#!/bin/bash
#
# Build script for Gnosis VPN macOS PKG installer
#
# This script creates a distributable .pkg installer with custom UI for macOS.
# It uses pkgbuild and productbuild to create a standard macOS installer package.
#

set -euo pipefail

# Safe default values
: "${GNOSISVPN_PACKAGE_VERSION:=}"
: "${GNOSISVPN_CLI_VERSION:=}"
: "${GNOSISVPN_APP_VERSION:=}"
: "${GNOSISVPN_ENABLE_SIGNATURE:=false}"
: "${GNOSISVPN_APPLE_CERTIFICATE_DEVELOPER_PATH:=}"
: "${GNOSISVPN_APPLE_CERTIFICATE_INSTALLER_PATH:=}"
: "${GNOSISVPN_APPLE_ID:=}"
: "${GNOSISVPN_APPLE_PASSWORD:=}"
: "${GNOSISVPN_APPLE_TEAM_ID:=}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}/build"
RESOURCES_DIR="${SCRIPT_DIR}/resources"
DISTRIBUTION_XML="${SCRIPT_DIR}/Distribution.xml"
COMPONENT_PKG="GnosisVPN.pkg"

# Keychain
KEYCHAIN_NAME="gnosisvpn.keychain"
KEYCHAIN_PASSWORD=$(openssl rand -base64 24)

# shellcheck disable=SC2317
cleanup() {
    if [[ $GNOSISVPN_ENABLE_SIGNATURE == true ]]; then
        security delete-keychain "${KEYCHAIN_NAME}" >/dev/null 2>&1 || true
    fi
}
trap 'cleanup' EXIT INT TERM

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

# Usage help message
usage() {
    echo "Usage: $0 --package-version <version> --cli-version <version> --app-version <version> [--sign --binary-certificate-path <path> --installer-certificate-path <path> --apple-id <apple_id> --apple-password <app_password> --apple-team-id <team_id>]"
    echo
    echo "Options:"
    echo "  --package-version <version>  Set the package version (e.g., 1.0.0)"
    echo "  --cli-version <version>   Set the CLI version (e.g., latest, v0.50.7, 0.50.7-pr.465)"
    echo "  --app-version <version>   Set the App version (e.g., latest, v0.2.2, 0.2.2-pr.10)"
    echo "  --sign                    Enable code signing"
    echo "  --binary-certificate-path <path>  Set the path to the certificate for signing binaries (if signing is enabled)"
    echo "  --installer-certificate-path <path>  Set the path to the certificate for signing the installer (if signing is enabled)"
    echo "  --apple-id <apple_id>     Set the Apple ID for notarization (if signing is enabled)"
    echo "  --apple-password <app_password>  Set the Apple ID app-specific password for notarization (if signing is enabled)"
    echo "  --apple-team-id <team_id> Set the Apple Team ID for notarization (if signing is enabled)"
    echo "  -h, --help                Show this help message"
    exit 1
}

# Parse command-line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
        --package-version)
            GNOSISVPN_PACKAGE_VERSION="${2:-}"
            if [[ -z $GNOSISVPN_PACKAGE_VERSION ]]; then
                log_error "'--package-version <version>' requires a value"
                usage
            else
                check_version_syntax "$GNOSISVPN_PACKAGE_VERSION"
            fi
            PKG_NAME="GnosisVPN-Installer-${GNOSISVPN_PACKAGE_VERSION}.pkg"
            SIGNED_PKG_NAME="${PKG_NAME%.pkg}-signed.pkg"
            shift 2
            ;;
        --cli-version)
            GNOSISVPN_CLI_VERSION="${2:-}"
            if [[ -z $GNOSISVPN_CLI_VERSION ]]; then
                log_error "'--cli-version <version>' requires a value"
                usage
            else
                check_version_syntax "$GNOSISVPN_CLI_VERSION"
            fi
            shift 2
            ;;
        --app-version)
            GNOSISVPN_APP_VERSION="${2:-}"
            if [[ -z $GNOSISVPN_APP_VERSION ]]; then
                log_error "'--app-version <version>' requires a value"
                usage
            else
                check_version_syntax "$GNOSISVPN_APP_VERSION"
            fi
            shift 2
            ;;
        --sign)
            GNOSISVPN_ENABLE_SIGNATURE=true
            shift
            ;;
        --binary-certificate-path)
            GNOSISVPN_APPLE_CERTIFICATE_DEVELOPER_PATH="${2:-}"
            if [[ -z $GNOSISVPN_APPLE_CERTIFICATE_DEVELOPER_PATH ]]; then
                log_error "'--binary-certificate-path <path>' requires a value"
                usage
            else
                if [[ ! -f $GNOSISVPN_APPLE_CERTIFICATE_DEVELOPER_PATH ]]; then
                    log_error "Certificate file not found: $GNOSISVPN_APPLE_CERTIFICATE_DEVELOPER_PATH"
                    exit 1
                fi
            fi
            shift 2
            ;;
        --installer-certificate-path)
            GNOSISVPN_APPLE_CERTIFICATE_INSTALLER_PATH="${2:-}"
            if [[ -z $GNOSISVPN_APPLE_CERTIFICATE_INSTALLER_PATH ]]; then
                log_error "'--installer-certificate-path <path>' requires a value "
                usage
            else
                if [[ ! -f $GNOSISVPN_APPLE_CERTIFICATE_INSTALLER_PATH ]]; then
                    log_error "Certificate file not found: $GNOSISVPN_APPLE_CERTIFICATE_INSTALLER_PATH"
                    exit 1
                fi
            fi
            shift 2
            ;;
        --apple-id)
            GNOSISVPN_APPLE_ID="${2:-}"
            if [[ -z $GNOSISVPN_APPLE_ID ]]; then
                log_error "'--apple-id <apple_id>' requires a value"
                usage
            fi
            shift 2
            ;;
        --apple-team-id)
            GNOSISVPN_APPLE_TEAM_ID="${2:-}"
            if [[ -z $GNOSISVPN_APPLE_TEAM_ID ]]; then
                log_error "'--apple-team-id <team_id>' requires a value"
                usage
            fi
            shift 2
            ;;
        --apple-password)
            GNOSISVPN_APPLE_PASSWORD="${2:-}"
            if [[ -z $GNOSISVPN_APPLE_PASSWORD ]]; then
                log_error "'--apple-password <app_password>' requires a value"
                usage
            fi
            shift 2
            ;;
        -h | --help)
            usage
            ;;
        *)
            log_error "Unknown argument: $1"
            usage
            ;;
        esac
    done

    if [[ -z $GNOSISVPN_PACKAGE_VERSION ]]; then
        log_error "'--package-version <version>' is required or environment variable GNOSISVPN_PACKAGE_VERSION must be set"
        usage
    fi

    if [[ -z $GNOSISVPN_CLI_VERSION ]]; then
        log_error "'--cli-version <version>' is required or environment variable GNOSISVPN_CLI_VERSION must be set"
        usage
    fi

    if [[ -z $GNOSISVPN_APP_VERSION ]]; then
        log_error "'--app-version <version>' is required or environment variable GNOSISVPN_APP_VERSION must be set"
        usage
    fi

    # Validate required arguments
    if [[ $GNOSISVPN_ENABLE_SIGNATURE == true ]]; then
        if [[ -z $GNOSISVPN_APPLE_CERTIFICATE_DEVELOPER_PATH ]]; then
            log_error "'--binary-certificate-path <path>' is required or environment variable GNOSISVPN_APPLE_CERTIFICATE_DEVELOPER_PATH must be set"
            usage
        fi

        if [[ -z $GNOSISVPN_APPLE_CERTIFICATE_INSTALLER_PATH ]]; then
            log_error "'--installer-certificate-path <path>' is required or environment variable GNOSISVPN_APPLE_CERTIFICATE_INSTALLER_PATH must be set"
            usage
        fi

        if [[ -z $GNOSISVPN_APPLE_ID ]]; then
            log_error "'--apple-id <apple_id>' is required or environment variable GNOSISVPN_APPLE_ID must be set"
            usage
        fi

        if [[ -z $GNOSISVPN_APPLE_PASSWORD ]]; then
            log_error "'--apple-password <app_password>' is required or environment variable GNOSISVPN_APPLE_PASSWORD must be set"
            usage
        fi

        if [[ -z $GNOSISVPN_APPLE_TEAM_ID ]]; then
            log_error "'--apple-team-id <team_id>' is required or environment variable GNOSISVPN_APPLE_TEAM_ID must be set"
            usage
        fi
    fi

    log_success "Command-line arguments parsed successfully"
}

# Validate environment variables for signing
parse_env_vars() {
    if [[ $GNOSISVPN_ENABLE_SIGNATURE == true ]]; then
        if [[ -z ${GNOSISVPN_APPLE_CERTIFICATE_DEVELOPER_PASSWORD:-} ]]; then
            log_error "Apple Developer certificate password not set in GNOSISVPN_APPLE_CERTIFICATE_DEVELOPER_PASSWORD environment variable"
            exit 1
        else
            if ! command -v openssl pkcs12 -info -in "$GNOSISVPN_APPLE_CERTIFICATE_DEVELOPER_PATH" -passin pass:"$GNOSISVPN_APPLE_CERTIFICATE_DEVELOPER_PASSWORD" -nokeys -nomacver -nodes 2>/dev/null >/dev/null; then
                log_error "Password for $GNOSISVPN_APPLE_CERTIFICATE_DEVELOPER_PATH certificate is incorrect or certificate file is invalid"
                exit 1
            fi
        fi

        if [[ -z ${GNOSISVPN_APPLE_CERTIFICATE_INSTALLER_PASSWORD:-} ]]; then
            log_error "Apple Installer certificate password not set in GNOSISVPN_APPLE_CERTIFICATE_INSTALLER_PASSWORD environment variable"
            exit 1
        else
            if ! command -v openssl pkcs12 -info -in "$GNOSISVPN_APPLE_CERTIFICATE_INSTALLER_PATH" -passin pass:"$GNOSISVPN_APPLE_CERTIFICATE_INSTALLER_PASSWORD" -nokeys -nomacver -nodes 2>/dev/null >/dev/null; then
                log_error "Password for $GNOSISVPN_APPLE_CERTIFICATE_INSTALLER_PATH certificate is incorrect or certificate file is invalid"
                exit 1
            fi
        fi
    fi
    log_success "Environment variables validated successfully"
}

# Validate version syntax
check_version_syntax() {
    local version="$1"
    # Matches: v1.2.3, 1.2.3, 1.2.3+pr.123, 1.2.3+commit.abcdef, latest
    local semver_regex='^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(\+(pr|commit)(\.[0-9A-Za-z-]+)*)?$'
    if [[ ! $version =~ $semver_regex && $version != "latest" ]]; then
        log_error "Invalid version format: $version"
        log_error "Expected format: MAJOR.MINOR.PATCH(+pr.123|+commit.abcdef) or latest"
        exit 1
    fi
}

# Print banner
print_banner() {
    echo ""
    echo "=========================================="
    echo "  Create installer package for GnosisVPN"
    echo "=========================================="
    echo "Package Version:            ${GNOSISVPN_PACKAGE_VERSION}"
    echo "Client Version:             ${GNOSISVPN_CLI_VERSION}"
    echo "App Version:                ${GNOSISVPN_APP_VERSION}"
    echo "Signing:                    $(if [[ $GNOSISVPN_ENABLE_SIGNATURE == true ]]; then echo "Enabled"; else echo "Disabled"; fi)"
    if [[ $GNOSISVPN_ENABLE_SIGNATURE == true ]]; then
        echo "Developer certificate path: $GNOSISVPN_APPLE_CERTIFICATE_DEVELOPER_PATH"
        echo "Installer certificate path: $GNOSISVPN_APPLE_CERTIFICATE_INSTALLER_PATH"
        echo "Apple ID:                   $GNOSISVPN_APPLE_ID"
        echo "Apple Team ID:              $GNOSISVPN_APPLE_TEAM_ID"
    fi
    echo "=========================================="
    echo ""
}

# Verify prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    local missing=0

    # Check for required tools
    for cmd in pkgbuild productbuild curl lipo openssl; do
        if ! command -v "$cmd" &>/dev/null; then
            log_error "Required tool not found: $cmd"
            missing=$((missing + 1))
        fi
    done

    if [[ $missing -gt 0 ]]; then
        log_error "Prerequisites check failed. Please install missing tools and verify file structure."
        exit 1
    fi

    log_success "Prerequisites check passed"
}

# Clean and prepare build directory
prepare_build_dir() {
    log_info "Preparing build directory..."

    # Clean existing build directory
    if [[ -d ${BUILD_DIR} ]]; then
        log_info "Cleaning existing build directory..."
        rm -rf "${BUILD_DIR}"
    fi

    # Create fresh build directory structure
    mkdir -p "${BUILD_DIR}/root/usr/local/bin"
    mkdir -p "${BUILD_DIR}/root/etc/gnosisvpn/templates"
    # UI app archive will be added during binary embedding
    mkdir -p "${BUILD_DIR}/scripts"

    # Copy config templates to package payload
    if [[ -d "$RESOURCES_DIR/config/templates" ]]; then
        cp "$RESOURCES_DIR/config/templates"/*.template "${BUILD_DIR}/root/etc/gnosisvpn/templates/" || true
        log_success "Config templates copied"
    fi

    # Copy system configuration files to scripts directory (for postinstall access)
    if [[ -d "$RESOURCES_DIR/config/system" ]]; then
        mkdir -p "${BUILD_DIR}/scripts/config/system"
        cp "$RESOURCES_DIR/config/system"/* "${BUILD_DIR}/scripts/config/system/" || true
        log_success "System config files copied"
    fi

    # Copy artifacts needed by the application
    if [[ -d "$RESOURCES_DIR/artifacts/" ]]; then
        mkdir -p "${BUILD_DIR}/root/usr/local/bin/"

        log_info "Creating universal binary for the 'wg'..."
        lipo -create -output "${BUILD_DIR}/root/usr/local/bin/wg" \
            "$RESOURCES_DIR/artifacts/wg-x86_64-darwin" "$RESOURCES_DIR/artifacts/wg-aarch64-darwin"
        chmod 755 "${BUILD_DIR}/root/usr/local/bin/wg"

        # Signing of the wg binary by the `Developer ID Application` certificate
        if [[ $GNOSISVPN_ENABLE_SIGNATURE == true ]]; then
            security create-keychain -p "${KEYCHAIN_PASSWORD}" "${KEYCHAIN_NAME}"
            security default-keychain -s "${KEYCHAIN_NAME}"
            security set-keychain-settings -lut 21600 "${KEYCHAIN_NAME}"
            security unlock-keychain -p "${KEYCHAIN_PASSWORD}" "${KEYCHAIN_NAME}"
            security list-keychains -d user -s "${KEYCHAIN_NAME}" login.keychain
            security import "${GNOSISVPN_APPLE_CERTIFICATE_DEVELOPER_PATH}" -k "${KEYCHAIN_NAME}" -P "${GNOSISVPN_APPLE_CERTIFICATE_DEVELOPER_PASSWORD}" -T /usr/bin/codesign
            security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "${KEYCHAIN_PASSWORD}" "${KEYCHAIN_NAME}" 2>/dev/null > /dev/null
            CERT_ID=$(security find-identity -v -p codesigning "${KEYCHAIN_NAME}" | awk -F'"' '{print $2}' | tr -d '\n')
            codesign --sign "${CERT_ID}" --options runtime --timestamp "${BUILD_DIR}/root/usr/local/bin/wg"
            codesign --verify --deep --strict --verbose=4 "${BUILD_DIR}/root/usr/local/bin/wg"
            log_success "Wireguard binary signed successfully"
        fi

        cp "$RESOURCES_DIR/artifacts/wg-quick" "${BUILD_DIR}/root/usr/local/bin/" || true
        log_success "Artifacts copied"
    fi

    log_success "Build directory prepared"
}

# Package UI application asset into a tar.gz archive for staging
package_ui_app_archive() {
    local asset_path="$1"
    local output_archive="$2"

    if [[ ! -f $asset_path ]]; then
        log_warn "UI asset not found at $asset_path"
        return 1
    fi

    local file_info
    file_info=$(file "$asset_path")
    local work_dir
    work_dir=$(mktemp -d -t gnosis-ui-app.XXXXXX)
    chmod 700 "$work_dir"

    local staging_app_dir="$work_dir/gnosis_vpn-app.app"
    local success=false

    log_info "Packaging UI asset (type: $file_info)"

    if echo "$file_info" | grep -qi "zlib compressed data"; then
        log_info "Detected DMG file, mounting for extraction"
        local mount_point
        mount_point=$(mktemp -d -t gnosis-dmg-mount.XXXXXX)

        if hdiutil attach "$asset_path" -mountpoint "$mount_point" -quiet; then
            log_info "DMG mounted at $mount_point"
            local app_bundle
            app_bundle=$(find "$mount_point" -maxdepth 1 -type d -name "*.app" | head -1)

            if [[ -n $app_bundle ]]; then
                log_info "Found app bundle in DMG: $(basename "$app_bundle")"
                if ditto "$app_bundle" "$staging_app_dir"; then
                    success=true
                else
                    log_warn "Failed to copy app bundle from DMG"
                fi
            else
                log_warn "No app bundle found inside DMG"
            fi

            hdiutil detach "$mount_point" -quiet || log_warn "Failed to detach DMG mount"
        else
            log_warn "Failed to mount DMG asset"
        fi

        rmdir "$mount_point" 2>/dev/null || true

    elif echo "$file_info" | grep -qi "zip archive data"; then
        log_info "Detected ZIP archive, extracting"
        local extract_dir
        extract_dir=$(mktemp -d -t gnosis-ui-extract.XXXXXX)
        if unzip -q "$asset_path" -d "$extract_dir"; then
            local app_bundle
            app_bundle=$(find "$extract_dir" -maxdepth 2 -type d -name "*.app" | head -1)
            if [[ -n $app_bundle ]]; then
                log_info "Found app bundle in ZIP: $(basename "$app_bundle")"
                if ditto "$app_bundle" "$staging_app_dir"; then
                    success=true
                else
                    log_warn "Failed to copy app bundle from ZIP"
                fi
            else
                log_warn "No app bundle found inside ZIP"
            fi
        else
            log_warn "Failed to extract ZIP asset"
        fi
        rm -rf "$extract_dir" 2>/dev/null || true

    elif echo "$file_info" | grep -qi "gzip compressed data"; then
        log_info "Detected gzip-compressed tar archive, extracting"
        local extract_dir
        extract_dir=$(mktemp -d -t gnosis-ui-extract.XXXXXX)
        if tar -xzf "$asset_path" -C "$extract_dir"; then
            local app_bundle
            app_bundle=$(find "$extract_dir" -maxdepth 2 -type d -name "*.app" | head -1)
            if [[ -n $app_bundle ]]; then
                log_info "Found app bundle in tar archive: $(basename "$app_bundle")"
                if ditto "$app_bundle" "$staging_app_dir"; then
                    success=true
                else
                    log_warn "Failed to copy app bundle from tar archive"
                fi
            else
                log_warn "No app bundle found inside tar archive"
            fi
        else
            log_warn "Failed to extract tar archive"
        fi
        rm -rf "$extract_dir" 2>/dev/null || true

    elif echo "$file_info" | grep -qi "tar archive"; then
        log_info "Detected uncompressed tar archive, extracting"
        local extract_dir
        extract_dir=$(mktemp -d -t gnosis-ui-extract.XXXXXX)
        if tar -xf "$asset_path" -C "$extract_dir"; then
            local app_bundle
            app_bundle=$(find "$extract_dir" -maxdepth 2 -type d -name "*.app" | head -1)
            if [[ -n $app_bundle ]]; then
                log_info "Found app bundle in tar archive: $(basename "$app_bundle")"
                if ditto "$app_bundle" "$staging_app_dir"; then
                    success=true
                else
                    log_warn "Failed to copy app bundle from tar archive"
                fi
            else
                log_warn "No app bundle found inside tar archive"
            fi
        else
            log_warn "Failed to extract tar archive"
        fi
        rm -rf "$extract_dir" 2>/dev/null || true

    elif [[ -d $asset_path ]]; then
        log_info "Detected app bundle directory, preparing for archiving"
        if ditto "$asset_path" "$staging_app_dir"; then
            success=true
        else
            log_warn "Failed to copy app bundle directory"
        fi
    else
        log_warn "Unsupported UI asset type: $file_info"
    fi

    local result=1
    if [[ $success == true ]] && [[ -d $staging_app_dir ]]; then
        mkdir -p "$(dirname "$output_archive")"
        rm -f "$output_archive"
        if tar -czf "$output_archive" -C "$work_dir" "$(basename "$staging_app_dir")"; then
            log_success "Packaged UI app archive: $output_archive"
            result=0
        else
            log_warn "Failed to create UI app archive at $output_archive"
        fi
    else
        log_warn "UI app staging failed, archive will not be created"
    fi

    rm -rf "$work_dir" 2>/dev/null || true
    return $result
}

# Download binaries and create universal binaries if needed
download_binaries() {
    log_info "Downloading binaries into staging directory..."

    mkdir -p "${BUILD_DIR}/binaries"
    chmod 700 "${BUILD_DIR}/binaries"

    gcloud artifacts files download --project=gnosisvpn-production --location=europe-west3 --repository=rust-binaries --destination="${BUILD_DIR}/binaries" \
        "gnosis_vpn:${GNOSISVPN_CLI_VERSION}:gnosis_vpn-aarch64-darwin" --local-filename=gnosis_vpn-aarch64-darwin

    gcloud artifacts files download --project=gnosisvpn-production --location=europe-west3 --repository=rust-binaries --destination="${BUILD_DIR}/binaries" \
        "gnosis_vpn:${GNOSISVPN_CLI_VERSION}:gnosis_vpn-ctl-aarch64-darwin" --local-filename=gnosis_vpn-ctl-aarch64-darwin

    gcloud artifacts files download --project=gnosisvpn-production --location=europe-west3 --repository=rust-binaries --destination="${BUILD_DIR}/binaries" \
        "gnosis_vpn:${GNOSISVPN_CLI_VERSION}:gnosis_vpn-x86_64-darwin" --local-filename=gnosis_vpn-x86_64-darwin

    gcloud artifacts files download --project=gnosisvpn-production --location=europe-west3 --repository=rust-binaries --destination="${BUILD_DIR}/binaries" \
        "gnosis_vpn:${GNOSISVPN_CLI_VERSION}:gnosis_vpn-ctl-x86_64-darwin" --local-filename=gnosis_vpn-ctl-x86_64-darwin

    gcloud artifacts files download --project=gnosisvpn-production --location=europe-west3 --repository=rust-binaries --destination="${BUILD_DIR}/binaries" \
        "gnosis_vpn-app:${GNOSISVPN_APP_VERSION}:gnosis_vpn-app-universal-darwin.dmg" --local-filename=gnosis_vpn-app-universal-darwin.dmg

    log_success "All downloads completed"

    # Create universal binaries
    log_info "Creating universal binaries..."
    lipo -create -output "${BUILD_DIR}/root/usr/local/bin/gnosis_vpn" \
        "${BUILD_DIR}/binaries/gnosis_vpn-aarch64-darwin" "${BUILD_DIR}/binaries/gnosis_vpn-x86_64-darwin"
    chmod 755 "${BUILD_DIR}/root/usr/local/bin/gnosis_vpn"
    lipo -create -output "${BUILD_DIR}/root/usr/local/bin/gnosis_vpn-ctl" \
        "${BUILD_DIR}/binaries/gnosis_vpn-ctl-aarch64-darwin" "${BUILD_DIR}/binaries/gnosis_vpn-ctl-x86_64-darwin"
    chmod 755 "${BUILD_DIR}/root/usr/local/bin/gnosis_vpn-ctl"
    log_success "Universal binaries created"

    log_info "Processing UI app for packaging..."
    local ui_archive_path="${BUILD_DIR}/root/usr/local/share/gnosisvpn/gnosis_vpn-app.tar.gz"
    if package_ui_app_archive "${BUILD_DIR}/binaries/gnosis_vpn-app-universal-darwin.dmg" "$ui_archive_path"; then
        log_info "UI app archive prepared for staging directory"
    else
        log_error "UI app archive could not be prepared; installer will ship without UI application"
        exit 1
    fi

    # Verify final binaries
    log_info "Verifying final binaries:"
    lipo -info "${BUILD_DIR}/root/usr/local/bin/gnosis_vpn" || true
    lipo -info "${BUILD_DIR}/root/usr/local/bin/gnosis_vpn-ctl" || true

    if [[ -f "${BUILD_DIR}/root/Applications/GnosisVPN" ]]; then
        lipo -info "${BUILD_DIR}/root/Applications/GnosisVPN" || true
    fi

    log_success "Binaries downloaded"
}

# Copy installation scripts
copy_scripts() {
    log_info "Copying installation scripts..."

    # Copy logging library (required by all scripts)
    if [[ -f "$RESOURCES_DIR/scripts/logging.sh" ]]; then
        cp "$RESOURCES_DIR/scripts/logging.sh" "${BUILD_DIR}/scripts/"
        log_success "Copied logging library"
    fi

    # Preinstall is now a minimal no-op (optional WireGuard check only)
    if [[ -f "$RESOURCES_DIR/scripts/preinstall" ]]; then
        cp "$RESOURCES_DIR/scripts/preinstall" "${BUILD_DIR}/scripts/"
        chmod +x "${BUILD_DIR}/scripts/preinstall"
        log_success "Copied preinstall script"
    fi

    if [[ -f "$RESOURCES_DIR/scripts/postinstall" ]]; then
        cp "$RESOURCES_DIR/scripts/postinstall" "${BUILD_DIR}/scripts/"
        chmod +x "${BUILD_DIR}/scripts/postinstall"
        log_success "Copied postinstall script"
    fi
}

# Build component package
build_component_package() {
    log_info "Building component package..."

    pkgbuild \
        --root "${BUILD_DIR}/root" \
        --scripts "${BUILD_DIR}/scripts" \
        --identifier "org.gnosis.vpn.client" \
        --version "$GNOSISVPN_PACKAGE_VERSION" \
        --install-location "/" \
        --ownership recommended \
        "${BUILD_DIR}/$COMPONENT_PKG"

    if [[ -f "${BUILD_DIR}/$COMPONENT_PKG" ]]; then
        local size
        size=$(du -h "${BUILD_DIR}/$COMPONENT_PKG" | cut -f1)
        log_success "Component package created: $COMPONENT_PKG ($size)"
    else
        log_error "Failed to create component package"
        exit 1
    fi
}

# Build distribution package
build_distribution_package() {
    log_info "Building distribution package with custom UI..."

    productbuild \
        --distribution "$DISTRIBUTION_XML" \
        --resources "$RESOURCES_DIR" \
        --package-path "${BUILD_DIR}" \
        --version "$GNOSISVPN_PACKAGE_VERSION" \
        "${BUILD_DIR}/$PKG_NAME"

    if [[ -f "${BUILD_DIR}/$PKG_NAME" ]]; then
        local size
        size=$(du -h "${BUILD_DIR}/$PKG_NAME" | cut -f1)
        log_success "Distribution package created: $PKG_NAME ($size)"
    else
        log_error "Failed to create distribution package"
        exit 1
    fi
}

# Verify package
verify_package() {
    log_info "Verifying package structure..."

    # Check package structure
    if pkgutil --check-signature "${BUILD_DIR}/$PKG_NAME" &>/dev/null; then
        log_warn "Package is signed"
    else
        log_warn "Package is unsigned (will require signing for distribution)"
    fi

    # List package contents
    log_info "Package contents:"
    pkgutil --payload-files "${BUILD_DIR}/$COMPONENT_PKG" 2>/dev/null | head -n 10 || true

    echo ""
}

# Sign package
sign_package() {
    if [[ $GNOSISVPN_ENABLE_SIGNATURE == true ]]; then
        log_info "Signing package for distribution..."
        security unlock-keychain -p "${KEYCHAIN_PASSWORD}" "${KEYCHAIN_NAME}"
        security import "${GNOSISVPN_APPLE_CERTIFICATE_INSTALLER_PATH}" -k "${KEYCHAIN_NAME}" -P "${GNOSISVPN_APPLE_CERTIFICATE_INSTALLER_PASSWORD}" -T /usr/bin/productsign -T /usr/bin/xcrun
        security set-key-partition-list -S apple-tool:,apple:,productsign:,xcrun: -s -k "${KEYCHAIN_PASSWORD}" "${KEYCHAIN_NAME}" 2>/dev/null > /dev/null
        local signing_identity
        signing_identity=$(security find-identity -v -p basic "${KEYCHAIN_NAME}" | grep "Developer ID Installer" | awk -F'"' '{print $2}')

        if [[ -n "$signing_identity" ]]; then
            log_info "Found signing certificate: $signing_identity"

            # Sign the package
            if productsign --sign "$signing_identity" --keychain "${KEYCHAIN_NAME}" "${BUILD_DIR}/$PKG_NAME" "${BUILD_DIR}/${SIGNED_PKG_NAME}"; then
                log_success "Package signed successfully: ${SIGNED_PKG_NAME}"
                log_info "Verifying package signature..."
                if pkgutil --check-signature "${BUILD_DIR}/${SIGNED_PKG_NAME}"; then
                    log_success "Signature verification passed"
                    echo ""
                else
                    log_error "Signature verification failed"
                    exit 1
                fi
            else
                log_error "Failed to sign package"
                log_info "Make sure the signing identity is correct"
                exit 1
            fi
            notarize_package
            staple_ticket
        else
            log_info "Package signing is disabled; skipping signing step"
        fi
    fi
}

# Submit for notarization
notarize_package() {
    log_info "Submitting package for notarization to Apple (this may take a while)..."
    if xcrun notarytool submit "${BUILD_DIR}/${SIGNED_PKG_NAME}" \
        --apple-id "$GNOSISVPN_APPLE_ID" \
        --team-id "$GNOSISVPN_APPLE_TEAM_ID" \
        --password "$GNOSISVPN_APPLE_PASSWORD" \
        --wait; then
        log_success "Notarization successful"
    else
        local exit_code=$?
        log_error "Notarization failed with exit code: $exit_code"
        log_info "Run with verbose output to see detailed error information"
        exit 1
    fi
}

# Staple notarization ticket
staple_ticket() {
    log_info "Stapling notarization ticket to package..."

    if xcrun stapler staple -v "${BUILD_DIR}/${SIGNED_PKG_NAME}"; then
        log_success "Notarization ticket stapled successfully"
        echo ""
    else
        local exit_code=$?
        log_warn "Failed to staple ticket (exit code: $exit_code)"
        log_warn "Package is still valid, but requires internet for verification"
        log_info "To check stapler status manually, run:"
        log_info "  xcrun stapler validate '${BUILD_DIR}/${SIGNED_PKG_NAME}'"
        echo ""
    fi
}



# Print build summary
print_summary() {
    local package_name
    package_name="${BUILD_DIR}/${PKG_NAME}"
    if [[ $GNOSISVPN_ENABLE_SIGNATURE == true ]]; then
        package_name="${BUILD_DIR}/${SIGNED_PKG_NAME}"
    fi

    echo "=========================================="
    echo "  Build Summary"
    echo "=========================================="
    echo "Version:        $GNOSISVPN_PACKAGE_VERSION"
    echo "Build Date:     $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
    echo "Client Version: ${GNOSISVPN_CLI_VERSION}"
    echo "App Version:    ${GNOSISVPN_APP_VERSION}"
    echo "Package:        $package_name"
    echo "Component:      ${BUILD_DIR}/$COMPONENT_PKG"

    if [[ -f "$package_name" ]]; then
        local pkg_size
        pkg_size=$(du -h "$package_name" | cut -f1)
        echo "Package size:  $pkg_size"

        local sha256
        sha256=$(shasum -a 256 "$package_name" | cut -d' ' -f1 | tee "$package_name".sha256)
        echo "SHA256:         $sha256"
    fi
    echo "=========================================="
    echo ""
}

# Run basic functionality tests
run_basic_tests() {
    log_info "Running basic functionality tests..."

    local test_failures=0

    # Test 1: Package file exists and is readable
    if [[ -f "${BUILD_DIR}/$PKG_NAME" ]] && [[ -r "${BUILD_DIR}/$PKG_NAME" ]]; then
        log_success "✓ Package file exists and is readable"
    else
        log_error "✗ Package file missing or unreadable: ${BUILD_DIR}/$PKG_NAME"
        test_failures=$((test_failures + 1))
    fi

    # Test 2: Package contents validation
    if pkgutil --expand "${BUILD_DIR}/$PKG_NAME" "${BUILD_DIR}/test-expand" 2>/dev/null; then
        log_success "✓ Package can be expanded successfully"

        # Check for required files
        local required_files=(
            "${BUILD_DIR}/test-expand/GnosisVPN.pkg"
            "${BUILD_DIR}/test-expand/Distribution"
            "${BUILD_DIR}/test-expand/Resources"
        )

        local missing_files=0
        for file in "${required_files[@]}"; do
            if [[ ! -e $file ]]; then
                log_error "✗ Missing required package component: $(basename "$file")"
                missing_files=$((missing_files + 1))
            fi
        done

        if [[ $missing_files -eq 0 ]]; then
            log_success "✓ All required package components present"
        else
            test_failures=$((test_failures + 1))
        fi

        # Clean up test expansion
        rm -rf "${BUILD_DIR}/test-expand" 2>/dev/null || true
    else
        log_error "✗ Package cannot be expanded"
        test_failures=$((test_failures + 1))
    fi

    # Test 3: Script syntax validation
    local script_syntax_errors=0

    local test_scripts=(
        "$RESOURCES_DIR/scripts/preinstall"
        "$RESOURCES_DIR/scripts/postinstall"
        "$SCRIPT_DIR/uninstall.sh"
    )

    for script in "${test_scripts[@]}"; do
        if [[ -f $script ]]; then
            if bash -n "$script" 2>/dev/null; then
                log_success "✓ $(basename "$script") syntax valid"
            else
                log_error "✗ $(basename "$script") has syntax errors"
                script_syntax_errors=$((script_syntax_errors + 1))
            fi
        fi
    done

    if [[ $script_syntax_errors -eq 0 ]]; then
        log_success "✓ All scripts have valid syntax"
    else
        test_failures=$((test_failures + 1))
    fi

    # Test 4: Distribution XML validation
    if [[ -f $DISTRIBUTION_XML ]]; then
        if xmllint --noout "$DISTRIBUTION_XML" 2>/dev/null; then
            log_success "✓ Distribution.xml is valid XML"
        else
            log_error "✗ Distribution.xml has XML syntax errors"
            test_failures=$((test_failures + 1))
        fi
    else
        log_warn "⚠ Distribution.xml not found, skipping XML validation"
    fi

    # Test 5: Binary architecture validation (if binaries exist)
    local binary_files=(
        "${BUILD_DIR}/root/usr/local/bin/gnosis_vpn"
        "${BUILD_DIR}/root/usr/local/bin/gnosis_vpn-ctl"
    )

    local arch_errors=0
    for binary in "${binary_files[@]}"; do
        if [[ -f $binary ]]; then
            if lipo -info "$binary" 2>/dev/null | grep -q "x86_64 arm64"; then
                log_success "✓ $(basename "$binary") is universal binary (x86_64 + arm64)"
            else
                log_warn "⚠ $(basename "$binary") may not be universal binary"
                arch_errors=$((arch_errors + 1))
            fi
        fi
    done

    if [[ $arch_errors -eq 0 ]]; then
        log_success "✓ All binaries are universal (x86_64 + arm64)"
    fi

    echo ""
    if [[ $test_failures -eq 0 ]]; then
        log_success "✓ All tests passed!"
        return 0
    else
        log_error "Tests failed with $test_failures failure(s)"
        return 1
    fi
}

# Main build process
main() {
    parse_env_vars
    print_banner
    check_prerequisites
    prepare_build_dir
    download_binaries
    copy_scripts
    build_component_package
    build_distribution_package
    verify_package
    sign_package
    print_summary

    # Run tests
    if ! run_basic_tests; then
        log_error "Basic tests failed!"
        log_error "The package may have issues. Please review the test output above."
        exit 1
    fi

    echo ""
    log_success "🎉 Build completed successfully with all quality checks passed!"
}

# Execute main
parse_args "$@"
main

exit 0
