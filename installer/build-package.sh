#!/bin/bash
#
# Build script for Gnosis VPN macOS PKG installer
#
# This script creates a distributable .pkg installer with custom UI for macOS.
# It uses pkgbuild and productbuild to create a standard macOS installer package.
#


set -euo pipefail
set -x

# Default values
CLI_VERSION="latest"
APP_VERSION="latest"
PACKAGE_VERSION="latest"
APPLE_CERTIFICATE_DEVELOPER_PATH=""
APPLE_CERTIFICATE_INSTALLER_PATH=""
SIGN=false

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
PKG_NAME="GnosisVPN-Installer.pkg"
COMPONENT_PKG="GnosisVPN.pkg"

# shellcheck disable=SC2317
cleanup_binary() {
    security delete-keychain gnosisvpn-binary.keychain >/dev/null 2>&1 || true
}

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
  echo "Usage: $0 --package-version <version> --cli-version <version> --app-version <version> --binary-certificate-path <path> --installer-certificate-path <path> [--sign]"
  echo
  echo "Options:"
  echo "  --package-version <version>  Set the package version (e.g., 1.0.0)"
  echo "  --cli-version <version>   Set the CLI version (e.g., latest, v0.50.7, 0.50.7-pr.465)"
  echo "  --app-version <version>   Set the App version (e.g., latest, v0.2.2, 0.2.2-pr.10)"
  echo "  --binary-certificate-path <path>  Set the path to the certificate for signing binaries"
  echo "  --installer-certificate-path <path>  Set the path to the certificate for signing the installer"
  echo "  --sign                    Enable code signing"
  echo "  -h, --help                Show this help message"
  exit 1
}

# Parse command-line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
    case "$1" in
        --package-version)
        PACKAGE_VERSION="${2:-}"
        if [[ -z "$PACKAGE_VERSION" ]]; then
            log_error "--package-version requires a value"
            usage
        fi
        shift 2
        ;;
        --cli-version)
        CLI_VERSION="${2:-}"
        if [[ -z "$CLI_VERSION" ]]; then
            log_error "--cli-version requires a value"
            usage
        else
            check_version_syntax "$CLI_VERSION"
        fi
        shift 2
        ;;
        --app-version)
        APP_VERSION="${2:-}"
        if [[ -z "$APP_VERSION" ]]; then
            log_error "--app-version requires a value"
            usage
        else
            check_version_syntax "$APP_VERSION"
        fi
        shift 2
        ;;
        --sign)
        SIGN=true
        shift
        ;;
        --binary-certificate-path)
        APPLE_CERTIFICATE_DEVELOPER_PATH="${2:-}"
        if [[ -z "$APPLE_CERTIFICATE_DEVELOPER_PATH" ]]; then
            log_error "--binary-certificate-path requires a value"
            usage
        else
            if [[ ! -f "$APPLE_CERTIFICATE_DEVELOPER_PATH" ]]; then
                log_error "Certificate file not found: $APPLE_CERTIFICATE_DEVELOPER_PATH"
                exit 1
            fi
        fi
        shift 2
        ;;
        --installer-certificate-path)
        APPLE_CERTIFICATE_INSTALLER_PATH="${2:-}"
        if [[ -z "$APPLE_CERTIFICATE_INSTALLER_PATH" ]]; then
            log_error "--installer-certificate-path requires a value"
            usage
        else
            if [[ ! -f "$APPLE_CERTIFICATE_INSTALLER_PATH" ]]; then
                log_error "Certificate file not found: $APPLE_CERTIFICATE_INSTALLER_PATH"
                exit 1
            fi
        fi
        shift 2
        ;;

        -h|--help)
        usage
        ;;
        *)
        echo "Unknown argument: $1" >&2
        usage
        ;;
    esac
    done

    # Validate required arguments
    if [[ "$SIGN" == true ]] && [[ -z "$APPLE_CERTIFICATE_DEVELOPER_PATH" ]]; then
    echo "Error: --binary-certificate-path is required" >&2
    usage
    fi

    if [[ "$SIGN" == true ]] && [[ -z "$APPLE_CERTIFICATE_INSTALLER_PATH" ]]; then
    echo "Error: --installer-certificate-path is required" >&2
    usage
    fi

    log_success "Command-line arguments parsed successfully"
}

# Validate environment variables for signing
parse_env_vars(){

    if [[ "$SIGN" == true ]]; then
        if [[ -z $APPLE_CERTIFICATE_DEVELOPER_PASSWORD ]]; then
            log_error "Apple Developer certificate password not set in APPLE_CERTIFICATE_DEVELOPER_PASSWORD environment variable"
            exit 1
        else
            if ! command -v openssl pkcs12 -info -in "$APPLE_CERTIFICATE_DEVELOPER_PATH" -passin pass:"$APPLE_CERTIFICATE_DEVELOPER_PASSWORD" -nokeys -nomacver -nodes 2>/dev/null >/dev/null; then
                log_error "Password for $APPLE_CERTIFICATE_DEVELOPER_PATH certificate is incorrect or certificate file is invalid"
                exit 1
            else
                log_info "Apple Developer certificate detected"
            fi
        fi

        if [[ -z $APPLE_CERTIFICATE_INSTALLER_PASSWORD ]]; then
            log_error "Apple Installer certificate password not set in APPLE_CERTIFICATE_INSTALLER_PASSWORD environment variable"
            exit 1
        else
            if ! command -v openssl pkcs12 -info -in "$APPLE_CERTIFICATE_INSTALLER_PATH" -passin pass:"$APPLE_CERTIFICATE_INSTALLER_PASSWORD" -nokeys -nomacver -nodes 2>/dev/null >/dev/null; then
                log_error "Password for $APPLE_CERTIFICATE_INSTALLER_PATH certificate is incorrect or certificate file is invalid"
                exit 1
            else
                log_info "Apple Installer certificate detected"
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
    echo "=========================================="
    echo "  Gnosis VPN PKG Installer Builder"
    echo "  Package Version: $PACKAGE_VERSION"
    echo "  Client Version: ${CLI_VERSION}"
    echo "  App Version: ${APP_VERSION}"
    echo "  Signing: $(if [[ "$SIGN" == true ]]; then echo "Enabled"; else echo "Disabled"; fi)"
    if [[ "$SIGN" == true ]]; then
        echo "APPLE_CERTIFICATE_DEVELOPER_PATH = $APPLE_CERTIFICATE_DEVELOPER_PATH"
        echo "APPLE_CERTIFICATE_INSTALLER_PATH = $APPLE_CERTIFICATE_INSTALLER_PATH"
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
    echo ""
}

# Clean and prepare build directory
prepare_build_dir() {
    log_info "Preparing build directory..."

    # Clean existing build directory
    if [[ -d $BUILD_DIR ]]; then
        log_info "Cleaning existing build directory..."
        rm -rf "$BUILD_DIR"
    fi

    # Create fresh build directory structure
    mkdir -p "$BUILD_DIR/root/usr/local/bin"
    mkdir -p "$BUILD_DIR/root/etc/gnosisvpn/templates"
    # UI app archive will be added during binary embedding
    mkdir -p "$BUILD_DIR/scripts"

    # Copy config templates to package payload
    if [[ -d "$RESOURCES_DIR/config/templates" ]]; then
        cp "$RESOURCES_DIR/config/templates"/*.template "$BUILD_DIR/root/etc/gnosisvpn/templates/" || true
        log_success "Config templates copied"
    fi

    # Copy system configuration files to scripts directory (for postinstall access)
    if [[ -d "$RESOURCES_DIR/config/system" ]]; then
        mkdir -p "$BUILD_DIR/scripts/config/system"
        cp "$RESOURCES_DIR/config/system"/* "$BUILD_DIR/scripts/config/system/" || true
        log_success "System config files copied"
    fi

    # Copy artifacts needed by the application
    if [[ -d "$RESOURCES_DIR/artifacts/" ]]; then
        mkdir -p "$BUILD_DIR/root/usr/local/bin/"

        log_info "Creating universal binary for the 'wg'..."
        lipo -create -output "$BUILD_DIR/root/usr/local/bin/wg" \
            "$RESOURCES_DIR/artifacts/wg-x86_64-darwin" "$RESOURCES_DIR/artifacts/wg-aarch64-darwin"
        chmod 755 "$BUILD_DIR/root/usr/local/bin/wg"

        # Signing of the wg binary by the `Developer ID Application` certificate
        if [[ "$SIGN" == true ]]; then
            trap 'cleanup_binary' EXIT INT TERM
            local keychain_password
            keychain_password=$(openssl rand -base64 24)
            security create-keychain -p "${keychain_password}" gnosisvpn-binary.keychain
            security default-keychain -s gnosisvpn-binary.keychain
            security set-keychain-settings -lut 21600 gnosisvpn-binary.keychain
            security unlock-keychain -p "${keychain_password}" gnosisvpn-binary.keychain
            security list-keychains -d user -s gnosisvpn-binary.keychain login.keychain
            security import "${APPLE_CERTIFICATE_DEVELOPER_PATH}" -k gnosisvpn-binary.keychain -P "${APPLE_CERTIFICATE_DEVELOPER_PASSWORD}" -T /usr/bin/codesign
            security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "${keychain_password}" gnosisvpn-binary.keychain
            CERT_ID=$(security find-identity -v -p codesigning gnosisvpn-binary.keychain | awk -F'"' '{print $2}' | tr -d '\n')
            codesign --sign "${CERT_ID}" --options runtime --timestamp "$BUILD_DIR/root/usr/local/bin/wg"
            codesign --verify --deep --strict --verbose=4 "$BUILD_DIR/root/usr/local/bin/wg"
            log_success "Wireguard binary signed successfully"
            security delete-keychain gnosisvpn-binary.keychain >/dev/null 2>&1 || true
            # Reset trap
            trap - EXIT INT TERM
        fi

        cp "$RESOURCES_DIR/artifacts/wg-quick" "$BUILD_DIR/root/usr/local/bin/" || true
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
embed_binaries() {
    log_info "Embedding binaries into staging directory..."

    mkdir -p "${BUILD_DIR}/binaries"
    chmod 700 "${BUILD_DIR}/binaries"

    gcloud artifacts files download --project=gnosisvpn-production --location=europe-west3 --repository=rust-binaries --destination=${BUILD_DIR}/binaries \
    gnosis_vpn:${CLI_VERSION}:gnosis_vpn-aarch64-darwin --local-filename=gnosis_vpn-aarch64-darwin &
    local pid1=$!
    gcloud artifacts files download --project=gnosisvpn-production --location=europe-west3 --repository=rust-binaries --destination=${BUILD_DIR}/binaries \
    gnosis_vpn:${CLI_VERSION}:gnosis_vpn-ctl-aarch64-darwin --local-filename=gnosis_vpn-ctl-aarch64-darwin &
    local pid2=$!
    gcloud artifacts files download --project=gnosisvpn-production --location=europe-west3 --repository=rust-binaries --destination=${BUILD_DIR}/binaries \
    gnosis_vpn:${CLI_VERSION}:gnosis_vpn-x86_64-darwin --local-filename=gnosis_vpn-x86_64-darwin &
    local pid3=$!
    gcloud artifacts files download --project=gnosisvpn-production --location=europe-west3 --repository=rust-binaries --destination=${BUILD_DIR}/binaries \
    gnosis_vpn:${CLI_VERSION}:gnosis_vpn-ctl-x86_64-darwin --local-filename=gnosis_vpn-ctl-x86_64-darwin &
    local pid4=$!
    gcloud artifacts files download --project=gnosisvpn-production --location=europe-west3 --repository=rust-binaries --destination=${BUILD_DIR}/binaries \
    gnosis_vpn-app:${APP_VERSION}:gnosis_vpn-app-universal-darwin --local-filename=gnosis_vpn-app-universal-darwin &
    local pid5=$!

    # Wait for all downloads to complete
    log_info "Waiting for downloads to complete..."
    if ! wait $pid1 || ! wait $pid2 || ! wait $pid3 || ! wait $pid4 || ! wait $pid5; then
        log_error "One or more downloads failed"
        exit 1
    fi
    log_success "All downloads completed"

    # Create universal binaries
    log_info "Creating universal binaries..."
    lipo -create -output "$BUILD_DIR/root/usr/local/bin/gnosis_vpn" \
        "${BUILD_DIR}/binaries/gnosis_vpn-aarch64-darwin" "${BUILD_DIR}/binaries/gnosis_vpn-x86_64-darwin"
    chmod 755 "$BUILD_DIR/root/usr/local/bin/gnosis_vpn"
    lipo -create -output "$BUILD_DIR/root/usr/local/bin/gnosis_vpn-ctl" \
        "${BUILD_DIR}/binaries/gnosis_vpn-ctl-aarch64-darwin" "${BUILD_DIR}/binaries/gnosis_vpn-ctl-x86_64-darwin"
    chmod 755 "$BUILD_DIR/root/usr/local/bin/gnosis_vpn-ctl"
    log_success "Universal binaries created"

    log_info "Processing UI app for packaging..."
    local ui_archive_path="$BUILD_DIR/root/usr/local/share/gnosisvpn/gnosis_vpn-app.tar.gz"
    if package_ui_app_archive "${BUILD_DIR}/binaries/gnosis_vpn-app-universal-darwin" "$ui_archive_path"; then
        log_info "UI app archive prepared for staging directory"
    else
        log_error "UI app archive could not be prepared; installer will ship without UI application"
        exit 1
    fi

    # Verify final binaries
    log_info "Verifying final binaries:"
    lipo -info "$BUILD_DIR/root/usr/local/bin/gnosis_vpn" || true
    lipo -info "$BUILD_DIR/root/usr/local/bin/gnosis_vpn-ctl" || true

    if [[ -f "$BUILD_DIR/root/Applications/GnosisVPN" ]]; then
        lipo -info "$BUILD_DIR/root/Applications/GnosisVPN" || true
    fi

    log_success "Binaries embedded"
    echo ""
}

# Copy installation scripts
copy_scripts() {
    log_info "Copying installation scripts..."

    # Copy logging library (required by all scripts)
    if [[ -f "$RESOURCES_DIR/scripts/logging.sh" ]]; then
        cp "$RESOURCES_DIR/scripts/logging.sh" "$BUILD_DIR/scripts/"
        log_success "Copied logging library"
    fi

    # Preinstall is now a minimal no-op (optional WireGuard check only)
    if [[ -f "$RESOURCES_DIR/scripts/preinstall" ]]; then
        cp "$RESOURCES_DIR/scripts/preinstall" "$BUILD_DIR/scripts/"
        chmod +x "$BUILD_DIR/scripts/preinstall"
        log_success "Copied preinstall script"
    fi

    if [[ -f "$RESOURCES_DIR/scripts/postinstall" ]]; then
        cp "$RESOURCES_DIR/scripts/postinstall" "$BUILD_DIR/scripts/"
        chmod +x "$BUILD_DIR/scripts/postinstall"
        log_success "Copied postinstall script"
    fi

    echo ""
}

# Build component package
build_component_package() {
    log_info "Building component package..."

    pkgbuild \
        --root "$BUILD_DIR/root" \
        --scripts "$BUILD_DIR/scripts" \
        --identifier "org.gnosis.vpn.client" \
        --version "$PACKAGE_VERSION" \
        --install-location "/" \
        --ownership recommended \
        "$BUILD_DIR/$COMPONENT_PKG"

    if [[ -f "$BUILD_DIR/$COMPONENT_PKG" ]]; then
        local size
        size=$(du -h "$BUILD_DIR/$COMPONENT_PKG" | cut -f1)
        log_success "Component package created: $COMPONENT_PKG ($size)"
    else
        log_error "Failed to create component package"
        exit 1
    fi

    echo ""
}

# Build distribution package
build_distribution_package() {
    log_info "Building distribution package with custom UI..."

    productbuild \
        --distribution "$DISTRIBUTION_XML" \
        --resources "$RESOURCES_DIR" \
        --package-path "$BUILD_DIR" \
        --version "$PACKAGE_VERSION" \
        "$BUILD_DIR/$PKG_NAME"

    if [[ -f "$BUILD_DIR/$PKG_NAME" ]]; then
        local size
        size=$(du -h "$BUILD_DIR/$PKG_NAME" | cut -f1)
        log_success "Distribution package created: $PKG_NAME ($size)"
    else
        log_error "Failed to create distribution package"
        exit 1
    fi

    echo ""
}

# Verify package
verify_package() {
    log_info "Verifying package structure..."

    # Check package structure
    if pkgutil --check-signature "$BUILD_DIR/$PKG_NAME" &>/dev/null; then
        log_warn "Package is signed"
    else
        log_warn "Package is unsigned (will require signing for distribution)"
    fi

    # List package contents
    log_info "Package contents:"
    pkgutil --payload-files "$BUILD_DIR/$COMPONENT_PKG" 2>/dev/null | head -n 10 || true

    echo ""
}

# Print build summary
print_summary() {
    echo "=========================================="
    echo "  Build Summary"
    echo "=========================================="
    echo "Version:        $PACKAGE_VERSION"
    echo "Build Date:    $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
    echo "Client Version: ${CLI_VERSION}"
    echo "App Version:    ${APP_VERSION}"
    echo "Package:        $BUILD_DIR/$PKG_NAME"
    echo "Component:      $BUILD_DIR/$COMPONENT_PKG"
    echo ""

    if [[ -f "$BUILD_DIR/$PKG_NAME" ]]; then
        local pkg_size
        pkg_size=$(du -h "$BUILD_DIR/$PKG_NAME" | cut -f1)
        echo "Package size:   $pkg_size"

        local sha256
        sha256=$(shasum -a 256 "$BUILD_DIR/$PKG_NAME" | cut -d' ' -f1)
        echo "SHA256:         $sha256"
    fi
    echo "=========================================="
}

# Run basic functionality tests
run_basic_tests() {
    log_info "Running basic functionality tests..."

    local test_failures=0

    # Test 1: Package file exists and is readable
    log_info "Test 1: Package file validation..."
    if [[ -f "$BUILD_DIR/$PKG_NAME" ]] && [[ -r "$BUILD_DIR/$PKG_NAME" ]]; then
        log_success "✓ Package file exists and is readable"
    else
        log_error "✗ Package file missing or unreadable: $BUILD_DIR/$PKG_NAME"
        test_failures=$((test_failures + 1))
    fi

    # Test 2: Package contents validation
    log_info "Test 2: Package contents validation..."
    if pkgutil --expand "$BUILD_DIR/$PKG_NAME" "$BUILD_DIR/test-expand" 2>/dev/null; then
        log_success "✓ Package can be expanded successfully"

        # Check for required files
        local required_files=(
            "$BUILD_DIR/test-expand/GnosisVPN.pkg"
            "$BUILD_DIR/test-expand/Distribution"
            "$BUILD_DIR/test-expand/Resources"
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
        rm -rf "$BUILD_DIR/test-expand" 2>/dev/null || true
    else
        log_error "✗ Package cannot be expanded"
        test_failures=$((test_failures + 1))
    fi

    # Test 3: Script syntax validation
    log_info "Test 3: Script syntax validation..."
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
    log_info "Test 4: Distribution XML validation..."
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
    log_info "Test 5: Binary architecture validation..."
    local binary_files=(
        "$BUILD_DIR/root/usr/local/bin/gnosis_vpn"
        "$BUILD_DIR/root/usr/local/bin/gnosis_vpn-ctl"
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
        log_success "All tests passed!"
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
    embed_binaries
    copy_scripts
    build_component_package
    build_distribution_package
    verify_package
    print_summary

    echo ""
    echo "=========================================="
    echo "  Post-Build Quality Checks"
    echo "=========================================="
    echo ""
    echo ""

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
