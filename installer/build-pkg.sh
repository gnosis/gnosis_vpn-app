#!/bin/bash
#
# Build script for Gnosis VPN macOS PKG installer
#
# This script creates a distributable .pkg installer with custom UI for macOS.
# It uses pkgbuild and productbuild to create a standard macOS installer package.
#
# Usage:
#   ./build-pkg.sh [version]
#
# Example:
#   ./build-pkg.sh 1.0.0
#

set -euo pipefail

# Configuration
VERSION_ARG="${1:-latest}"
VERSION="$VERSION_ARG"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}/build"
RESOURCES_DIR="${SCRIPT_DIR}/resources"
DISTRIBUTION_XML="${SCRIPT_DIR}/Distribution.xml"
PKG_NAME="GnosisVPN-Installer-${VERSION}.pkg"
COMPONENT_PKG="GnosisVPN.pkg"

# Binary URL environment variables
# GitHub release URL - installer will construct binary URLs automatically
GITHUB_RELEASE_URL="${GITHUB_RELEASE_URL:-}"
TAURI_APP_URL="${TAURI_APP_URL:-}"

# Binary names (can be customized if needed)
VPN_SERVICE_BINARY_NAME="${VPN_SERVICE_BINARY_NAME:-gnosis_vpn}"
VPN_CLI_BINARY_NAME="${VPN_CLI_BINARY_NAME:-gnosis_vpn-cli}"

# Platform suffixes for binary names
X86_PLATFORM="${X86_PLATFORM:-x86_64-apple-darwin}"
ARM_PLATFORM="${ARM_PLATFORM:-aarch64-apple-darwin}"

# Fallback GitHub release config (for backward compatibility)
REPO_OWNER="gnosis"
REPO_NAME="gnosis_vpn-client"
LATEST_URL="https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/LATEST"
RELEASE_BASE_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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
    echo -e "${RED}[ERROR]${NC} $*"
}

# Print banner
print_banner() {
    echo "=========================================="
    echo "  Gnosis VPN PKG Installer Builder"
    echo "  Version: ${VERSION}"
    echo "=========================================="
    echo ""
}

# Verify prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    local missing=0

    # Check for required tools
    for cmd in pkgbuild productbuild curl lipo; do
        if ! command -v "$cmd" &>/dev/null; then
            log_error "Required tool not found: $cmd"
            missing=$((missing + 1))
        fi
    done

    # Check for required files
    if [[ ! -f $DISTRIBUTION_XML ]]; then
        log_error "Distribution.xml not found: $DISTRIBUTION_XML"
        missing=$((missing + 1))
    fi

    if [[ ! -d $RESOURCES_DIR ]]; then
        log_error "Resources directory not found: $RESOURCES_DIR"
        missing=$((missing + 1))
    fi

    if [[ $missing -gt 0 ]]; then
        log_error "Prerequisites check failed. Please install missing tools and verify file structure."
        exit 1
    fi

    log_success "Prerequisites check passed"
    echo ""
}

# Validate environment variables for binary URLs
validate_environment() {
    log_info "Validating environment variables..."

    # Check if GitHub release URL is provided
    if [[ -n $GITHUB_RELEASE_URL ]]; then
        log_info "GitHub release URL detected: $GITHUB_RELEASE_URL"

        # Validate GitHub release URL format
        local download_url
        download_url=$(parse_github_release_url "$GITHUB_RELEASE_URL")

        log_info "Binary configuration:"
        log_info "  Download base URL: $download_url"
        log_info "  VPN Service binary: ${VPN_SERVICE_BINARY_NAME}-${X86_PLATFORM}, ${VPN_SERVICE_BINARY_NAME}-${ARM_PLATFORM}"
        log_info "  VPN CLI binary: ${VPN_CLI_BINARY_NAME}-${X86_PLATFORM}, ${VPN_CLI_BINARY_NAME}-${ARM_PLATFORM}"

        if [[ -n $TAURI_APP_URL ]]; then
            log_info "  Tauri App: $TAURI_APP_URL"
        else
            log_warn "Tauri app URL not provided (optional)"
        fi

        log_success "Environment variables validated"
    else
        log_info "No GitHub release URL set, will use fallback GitHub releases"
    fi

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
    mkdir -p "$BUILD_DIR/root/Applications"
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

    log_success "Build directory prepared"
    echo ""
}

# Resolve version (supports "latest")
resolve_version() {
    if [[ $VERSION_ARG == "latest" ]]; then
        log_info "Fetching latest version tag from GitHub..."
        if ! VERSION=$(curl -fsSL "$LATEST_URL" | tr -d '[:space:]'); then
            log_error "Failed to fetch LATEST version"
            exit 1
        fi
        if [[ -z $VERSION ]]; then
            log_error "LATEST file is empty"
            exit 1
        fi
        PKG_NAME="GnosisVPN-Installer-${VERSION}.pkg"
        log_success "Resolved version: $VERSION"
        echo ""
    fi
}

# Download asset from GitHub releases with retry logic
download_asset() {
    local asset="$1"
    local out="$2"
    local url="${RELEASE_BASE_URL}/${VERSION}/${asset}"
    local max_retries=3
    local retry_count=0
    local wait_time=2

    log_info "Downloading $asset"
    log_info "URL: $url"

    while [[ $retry_count -lt $max_retries ]]; do
        if curl -fL --progress-bar --connect-timeout 30 --max-time 300 "$url" -o "$out"; then
            log_success "Successfully downloaded $asset"
            return 0
        fi

        retry_count=$((retry_count + 1))

        if [[ $retry_count -lt $max_retries ]]; then
            log_warn "Download failed, retrying in ${wait_time}s (attempt $retry_count/$max_retries)"
            sleep "$wait_time"
            # Exponential backoff: double the wait time for next retry
            wait_time=$((wait_time * 2))
        fi
    done

    log_error "Failed to download $asset after $max_retries attempts"
    log_error "URL: $url"
    exit 1
}

# Download binary from direct URL with retry logic
download_binary() {
    local name="$1"
    local url="$2"
    local out="$3"
    local max_retries=3
    local retry_count=0
    local wait_time=2

    if [[ -z $url ]]; then
        log_error "No URL provided for $name"
        exit 1
    fi

    log_info "Downloading $name"
    log_info "URL: $url"

    while [[ $retry_count -lt $max_retries ]]; do
        if curl -fL --progress-bar --connect-timeout 30 --max-time 300 "$url" -o "$out"; then
            log_success "Successfully downloaded $name"
            return 0
        fi

        retry_count=$((retry_count + 1))

        if [[ $retry_count -lt $max_retries ]]; then
            log_warn "Download failed, retrying in ${wait_time}s (attempt $retry_count/$max_retries)"
            sleep "$wait_time"
            # Exponential backoff: double the wait time for next retry
            wait_time=$((wait_time * 2))
        fi
    done

    log_error "Failed to download $name after $max_retries attempts"
    log_error "URL: $url"
    exit 1
}

# Check binary architecture and determine if universal binary creation is needed
# Check binary architecture (utility function for debugging)
# shellcheck disable=SC2329,SC2317
check_binary_architecture() {
    local file="$1"
    local name="$2"

    if [[ ! -f $file ]]; then
        log_error "Binary file not found: $file"
        exit 1
    fi

    # Use file command to check architecture
    local arch_info
    arch_info=$(file "$file")

    log_info "Architecture info for $name: $arch_info"

    # Check if it's already a universal binary
    if echo "$arch_info" | grep -q "universal binary"; then
        echo "universal"
    elif echo "$arch_info" | grep -q "x86_64"; then
        echo "x86_64"
    elif echo "$arch_info" | grep -q "arm64"; then
        echo "arm64"
    else
        log_warn "Unknown architecture for $name: $arch_info"
        echo "unknown"
    fi
}

# Construct binary URL from GitHub release URL
construct_binary_url() {
    local release_url="$1"
    local binary_name="$2"
    local platform="$3"

    # Remove trailing slash if present
    release_url="${release_url%/}"

    # Construct the full binary URL
    echo "${release_url}/${binary_name}-${platform}"
}

# Parse GitHub release URL to extract repo info and tag
parse_github_release_url() {
    local url="$1"

    # Expected format: https://github.com/owner/repo/releases/tag/v1.0.0
    # or: https://github.com/owner/repo/releases/download/v1.0.0

    if [[ $url =~ https://github\.com/([^/]+)/([^/]+)/releases/(tag|download)/(.+) ]]; then
        local owner="${BASH_REMATCH[1]}"
        local repo="${BASH_REMATCH[2]}"
        local tag="${BASH_REMATCH[4]}"

        # Convert tag URL to download URL if needed
        local download_url="https://github.com/${owner}/${repo}/releases/download/${tag}"

        echo "$download_url"
    else
        log_error "Invalid GitHub release URL format: $url"
        log_error "Expected format: https://github.com/owner/repo/releases/tag/v1.0.0"
        exit 1
    fi
}

# Verify SHA-256 checksum for downloaded asset
verify_checksum() {
    local asset="$1"
    local file="$2"
    local checksum_url="${RELEASE_BASE_URL}/${VERSION}/${asset}.sha256"

    log_info "Verifying checksum for $asset"

    # Download checksum file
    local checksum_file="${file}.sha256"
    if ! curl -fsSL "$checksum_url" -o "$checksum_file"; then
        log_error "Failed to download checksum file: $checksum_url"
        log_error "Checksum verification is required for security"
        exit 1
    fi

    # Extract expected checksum (format: "checksum  filename")
    local expected_checksum
    expected_checksum=$(awk '{print $1}' "$checksum_file")

    # Validate that we got a checksum
    if [[ -z $expected_checksum ]]; then
        log_error "Checksum file is empty or invalid: $checksum_file"
        exit 1
    fi

    # Calculate actual checksum
    local actual_checksum
    actual_checksum=$(shasum -a 256 "$file" | awk '{print $1}')

    # Compare checksums
    if [[ $expected_checksum != "$actual_checksum" ]]; then
        log_error "Checksum verification failed for $asset"
        log_error "Expected: $expected_checksum"
        log_error "Actual:   $actual_checksum"
        log_error "This could indicate a corrupted download or security issue"
        exit 1
    fi

    log_success "Checksum verified: $expected_checksum"
    rm -f "$checksum_file"
}

# Verify GPG signature for downloaded asset (optional, non-blocking)
verify_gpg_signature() {
    local asset="$1"
    local file="$2"
    local sig_url="${RELEASE_BASE_URL}/${VERSION}/${asset}.sig"

    log_info "Checking for GPG signature for $asset"

    # Check if GPG is available
    if ! command -v gpg &>/dev/null; then
        log_warn "GPG not found, skipping signature verification"
        log_info "Install GPG for additional security: brew install gnupg"
        return 0
    fi

    # Try to download signature file
    local sig_file="${file}.sig"
    if ! curl -fsSL "$sig_url" -o "$sig_file" 2>/dev/null; then
        log_warn "GPG signature not available for $asset"
        log_info "Signature URL: $sig_url"
        return 0
    fi

    log_info "GPG signature found, verifying..."

    # Verify signature
    if gpg --verify "$sig_file" "$file" 2>&1 | tee /tmp/gpg-verify.log; then
        log_success "GPG signature verified for $asset"
        rm -f "$sig_file"
        return 0
    else
        log_error "GPG signature verification failed for $asset"
        log_error "This could indicate a security issue"
        cat /tmp/gpg-verify.log
        rm -f "$sig_file"
        exit 1
    fi
}

# Download binaries and create universal binaries if needed
embed_binaries() {
    log_info "Embedding binaries for version $VERSION"

    # Create secure temporary directory with restrictive permissions
    local tmp_dir
    tmp_dir=$(mktemp -d -t gnosis-vpn-build.XXXXXX)
    chmod 700 "$tmp_dir"

    # Ensure cleanup on exit
    trap 'rm -rf "$tmp_dir"' EXIT

    # Check if GitHub release URL is provided
    if [[ -n $GITHUB_RELEASE_URL ]]; then

        log_info "Using GitHub release URL for binary downloads..."

        # Parse GitHub release URL to get download base URL
        local download_base_url
        download_base_url=$(parse_github_release_url "$GITHUB_RELEASE_URL")

        # Construct binary URLs
        local vpn_service_x86_url
        vpn_service_x86_url=$(construct_binary_url "$download_base_url" "$VPN_SERVICE_BINARY_NAME" "$X86_PLATFORM")
        local vpn_service_arm_url
        vpn_service_arm_url=$(construct_binary_url "$download_base_url" "$VPN_SERVICE_BINARY_NAME" "$ARM_PLATFORM")
        local vpn_cli_x86_url
        vpn_cli_x86_url=$(construct_binary_url "$download_base_url" "$VPN_CLI_BINARY_NAME" "$X86_PLATFORM")
        local vpn_cli_arm_url
        vpn_cli_arm_url=$(construct_binary_url "$download_base_url" "$VPN_CLI_BINARY_NAME" "$ARM_PLATFORM")

        log_info "Constructed URLs:"
        log_info "  VPN Service (x86_64): $vpn_service_x86_url"
        log_info "  VPN Service (aarch64): $vpn_service_arm_url"
        log_info "  VPN CLI (x86_64): $vpn_cli_x86_url"
        log_info "  VPN CLI (aarch64): $vpn_cli_arm_url"

        # Download all binaries in parallel
        log_info "Starting parallel downloads..."
        download_binary "VPN Service (x86_64)" "$vpn_service_x86_url" "$tmp_dir/gnosis_vpn-x86_64" &
        local pid1=$!
        download_binary "VPN Service (aarch64)" "$vpn_service_arm_url" "$tmp_dir/gnosis_vpn-aarch64" &
        local pid2=$!
        download_binary "VPN CLI (x86_64)" "$vpn_cli_x86_url" "$tmp_dir/gnosis_vpn-ctl-x86_64" &
        local pid3=$!
        download_binary "VPN CLI (aarch64)" "$vpn_cli_arm_url" "$tmp_dir/gnosis_vpn-ctl-aarch64" &
        local pid4=$!

        # Download Tauri app if URL is provided
        local tauri_pid=""
        if [[ -n $TAURI_APP_URL ]]; then
            download_binary "Tauri App" "$TAURI_APP_URL" "$tmp_dir/tauri-app" &
            tauri_pid=$!
        fi

        # Wait for all downloads to complete
        log_info "Waiting for downloads to complete..."
        if ! wait $pid1 || ! wait $pid2 || ! wait $pid3 || ! wait $pid4; then
            log_error "One or more downloads failed"
            exit 1
        fi

        # Wait for Tauri download if it was started
        if [[ -n $tauri_pid ]]; then
            if ! wait $tauri_pid; then
                log_error "Tauri app download failed"
                exit 1
            fi
        fi

        log_success "All downloads completed"

        # Create universal binaries
        log_info "Creating universal binaries..."
        lipo -create -output "$BUILD_DIR/root/usr/local/bin/gnosis_vpn" \
            "$tmp_dir/gnosis_vpn-x86_64" "$tmp_dir/gnosis_vpn-aarch64"
        chmod 755 "$BUILD_DIR/root/usr/local/bin/gnosis_vpn"

        lipo -create -output "$BUILD_DIR/root/usr/local/bin/gnosis_vpn-ctl" \
            "$tmp_dir/gnosis_vpn-ctl-x86_64" "$tmp_dir/gnosis_vpn-ctl-aarch64"
        chmod 755 "$BUILD_DIR/root/usr/local/bin/gnosis_vpn-ctl"

        # Handle Tauri app if downloaded
        if [[ -f "$tmp_dir/tauri-app" ]]; then
            log_info "Processing Tauri app..."

            # Check if it's a compressed file or app bundle
            local file_info
            file_info=$(file "$tmp_dir/tauri-app")
            if echo "$file_info" | grep -q -E "(gzip|zip|tar)"; then
                log_info "Extracting compressed Tauri app..."
                # Handle extraction based on file type
                if echo "$file_info" | grep -q "gzip"; then
                    tar -xzf "$tmp_dir/tauri-app" -C "$BUILD_DIR/root/Applications/"
                elif echo "$file_info" | grep -q "zip"; then
                    unzip -q "$tmp_dir/tauri-app" -d "$BUILD_DIR/root/Applications/"
                fi
            else
                # Assume it's a direct app bundle or binary
                cp -r "$tmp_dir/tauri-app" "$BUILD_DIR/root/Applications/GnosisVPN.app" 2>/dev/null || {
                    cp "$tmp_dir/tauri-app" "$BUILD_DIR/root/Applications/GnosisVPN"
                    chmod 755 "$BUILD_DIR/root/Applications/GnosisVPN"
                }
            fi
        fi

    else
        log_info "Using fallback GitHub release downloads..."
        log_warn "GITHUB_RELEASE_URL not set. Using legacy download method."

        local darwin_x86="x86_64-darwin"
        local darwin_arm="aarch64-darwin"

        # Download all binaries in parallel for faster builds
        log_info "Starting parallel downloads..."
        download_asset "gnosis_vpn-${darwin_x86}" "$tmp_dir/gnosis_vpn-x86_64" &
        local pid1=$!
        download_asset "gnosis_vpn-${darwin_arm}" "$tmp_dir/gnosis_vpn-aarch64" &
        local pid2=$!
        download_asset "gnosis_vpn-ctl-${darwin_x86}" "$tmp_dir/gnosis_vpn-ctl-x86_64" &
        local pid3=$!
        download_asset "gnosis_vpn-ctl-${darwin_arm}" "$tmp_dir/gnosis_vpn-ctl-aarch64" &
        local pid4=$!

        # Wait for all downloads to complete
        log_info "Waiting for downloads to complete..."
        if ! wait $pid1 || ! wait $pid2 || ! wait $pid3 || ! wait $pid4; then
            log_error "One or more downloads failed"
            exit 1
        fi
        log_success "All downloads completed"

        # Verify checksums for all downloaded binaries (only for GitHub releases)
        log_info "Verifying checksums..."
        verify_checksum "gnosis_vpn-${darwin_x86}" "$tmp_dir/gnosis_vpn-x86_64"
        verify_checksum "gnosis_vpn-${darwin_arm}" "$tmp_dir/gnosis_vpn-aarch64"
        verify_checksum "gnosis_vpn-ctl-${darwin_x86}" "$tmp_dir/gnosis_vpn-ctl-x86_64"
        verify_checksum "gnosis_vpn-ctl-${darwin_arm}" "$tmp_dir/gnosis_vpn-ctl-aarch64"

        # Verify GPG signatures if available (only for GitHub releases)
        log_info "Checking for GPG signatures..."
        verify_gpg_signature "gnosis_vpn-${darwin_x86}" "$tmp_dir/gnosis_vpn-x86_64"
        verify_gpg_signature "gnosis_vpn-${darwin_arm}" "$tmp_dir/gnosis_vpn-aarch64"
        verify_gpg_signature "gnosis_vpn-ctl-${darwin_x86}" "$tmp_dir/gnosis_vpn-ctl-x86_64"
        verify_gpg_signature "gnosis_vpn-ctl-${darwin_arm}" "$tmp_dir/gnosis_vpn-ctl-aarch64"

        # Create universal binaries from separate arch files
        log_info "Creating universal binaries..."
        lipo -create -output "$BUILD_DIR/root/usr/local/bin/gnosis_vpn" \
            "$tmp_dir/gnosis_vpn-x86_64" "$tmp_dir/gnosis_vpn-aarch64"
        chmod 755 "$BUILD_DIR/root/usr/local/bin/gnosis_vpn"

        lipo -create -output "$BUILD_DIR/root/usr/local/bin/gnosis_vpn-ctl" \
            "$tmp_dir/gnosis_vpn-ctl-x86_64" "$tmp_dir/gnosis_vpn-ctl-aarch64"
        chmod 755 "$BUILD_DIR/root/usr/local/bin/gnosis_vpn-ctl"
    fi

    # Verify final binaries
    log_info "Verifying final binaries:"
    lipo -info "$BUILD_DIR/root/usr/local/bin/gnosis_vpn" || true
    lipo -info "$BUILD_DIR/root/usr/local/bin/gnosis_vpn-ctl" || true

    if [[ -f "$BUILD_DIR/root/Applications/GnosisVPN" ]]; then
        lipo -info "$BUILD_DIR/root/Applications/GnosisVPN" || true
    fi

    if [[ -d "$BUILD_DIR/root/Applications/GnosisVPN.app" ]]; then
        log_info "Tauri app bundle installed at /Applications/GnosisVPN.app"
    fi

    # Cleanup handled by trap
    log_success "Binaries embedded"
    echo ""
}

# Copy installation scripts
copy_scripts() {
    log_info "Copying installation scripts..."

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
        --version "$VERSION" \
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
        --version "$VERSION" \
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
    echo "Version:        $VERSION"
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

    echo ""
    echo "Configuration:"
    if [[ -n $GITHUB_RELEASE_URL ]]; then
        echo "  Used GitHub release URL: $GITHUB_RELEASE_URL"
    else
        echo "  Used fallback GitHub releases"
    fi

    echo ""
    echo "Next steps:"
    echo "  1. Test the installer:"
    echo "     open $BUILD_DIR/$PKG_NAME"
    echo ""
    echo "  2. Sign the package for distribution:"
    echo "     ./sign-pkg.sh $BUILD_DIR/$PKG_NAME"
    echo ""
    echo "Environment Variables Usage:"
    echo "  export GITHUB_RELEASE_URL='https://github.com/owner/repo/releases/tag/v1.0.0'"
    echo "  export TAURI_APP_URL='https://example.com/app.tar.gz' # optional"
    echo "  ./build-pkg.sh latest"
    echo ""
    echo "Binary names expected in release:"
    echo "  - ${VPN_SERVICE_BINARY_NAME}-${X86_PLATFORM}"
    echo "  - ${VPN_SERVICE_BINARY_NAME}-${ARM_PLATFORM}"
    echo "  - ${VPN_CLI_BINARY_NAME}-${X86_PLATFORM}"
    echo "  - ${VPN_CLI_BINARY_NAME}-${ARM_PLATFORM}"
    echo "=========================================="
}

# Main build process
main() {
    resolve_version
    print_banner
    check_prerequisites
    validate_environment
    prepare_build_dir
    embed_binaries
    copy_scripts
    build_component_package
    build_distribution_package
    verify_package
    print_summary
}

# Execute main
main

exit 0
