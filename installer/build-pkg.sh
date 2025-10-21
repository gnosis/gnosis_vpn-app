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
GITHUB_CLIENT_RELEASE_URL="${GITHUB_CLIENT_RELEASE_URL:-}"
GITHUB_UI_RELEASE_URL="${GITHUB_UI_RELEASE_URL:-https://github.com/gnosis/gnosis_vpn-app/releases/tag/v0.1.3}"

# Binary names (can be customized if needed)
VPN_SERVICE_BINARY_NAME="${VPN_SERVICE_BINARY_NAME:-gnosis_vpn}"
VPN_CLI_BINARY_NAME="${VPN_CLI_BINARY_NAME:-gnosis_vpn-ctl}"
UI_APP_BINARY_NAME="${UI_APP_BINARY_NAME:-gnosis_vpn-ui}"

# Platform suffixes for binary names
X86_PLATFORM="${X86_PLATFORM:-x86_64-darwin}"
ARM_PLATFORM="${ARM_PLATFORM:-aarch64-darwin}"

# Fallback GitHub release config (for backward compatibility)
REPO_OWNER="gnosis"
REPO_NAME="gnosis_vpn-client"
FALLBACK_VERSION="v0.50.0"
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

    # Check for optional but recommended tools
    local optional_tools=("shellcheck" "xmllint")
    for cmd in "${optional_tools[@]}"; do
        if ! command -v "$cmd" &>/dev/null; then
            log_warn "Optional tool not found: $cmd (recommended for quality checks)"
            case $cmd in
            shellcheck)
                log_info "Install with: brew install shellcheck"
                ;;
            xmllint)
                log_info "Install with: brew install libxml2"
                ;;
            esac
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
    if [[ -n $GITHUB_CLIENT_RELEASE_URL ]]; then
        log_info "GitHub client release URL detected: $GITHUB_CLIENT_RELEASE_URL"

        # Validate GitHub release URL format
        local download_url
        download_url=$(parse_GITHUB_CLIENT_RELEASE_URL "$GITHUB_CLIENT_RELEASE_URL")

        log_info "Binary configuration:"
        log_info "  Download base URL: $download_url"
        log_info "  VPN Service binary: ${VPN_SERVICE_BINARY_NAME}-${X86_PLATFORM}, ${VPN_SERVICE_BINARY_NAME}-${ARM_PLATFORM}"
        log_info "  VPN CLI binary: ${VPN_CLI_BINARY_NAME}-${X86_PLATFORM}, ${VPN_CLI_BINARY_NAME}-${ARM_PLATFORM}"

        if [[ -n $GITHUB_UI_RELEASE_URL ]]; then
            log_info "GitHub UI release URL detected: $GITHUB_UI_RELEASE_URL"
            local ui_download_url
            ui_download_url=$(parse_GITHUB_CLIENT_RELEASE_URL "$GITHUB_UI_RELEASE_URL")
            local ui_version
            ui_version=$(extract_version_from_url "$GITHUB_UI_RELEASE_URL")
            ui_version="${ui_version#v}" # Remove 'v' prefix
            log_info "  UI App binary: gnosis_vpn-app_${ui_version}_x64.dmg (from separate release: $ui_download_url)"
        else
            log_info "  UI App binary: ${UI_APP_BINARY_NAME}-${X86_PLATFORM} (x86_64 for Rosetta compatibility)"
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

    # Copy sartifacts needed by the application
    if [[ -d "$RESOURCES_DIR/artifacts/" ]]; then
        mkdir -p "BUILD_DIR/root/usr/local/bin/"

        arch=$(uname -m)
        if [ arch = "arm64" ]; then
            cp "$RESOURCES_DIR/artifacts/wg-aarch64-darwin" "$BUILD_DIR/root/usr/local/bin/wg"
            log_info "Copying over aarch64 wireguard binary"
        else
            cp "$RESOURCES_DIR/artifacts/wg-x86_64-darwin" "$BUILD_DIR/root/usr/local/bin/wg"
            log_info "Copying over x86_64 wireguard binary"
        fi

        cp "$RESOURCES_DIR/artifacts/wg-quick" "$BUILD_DIR/root/usr/local/bin/" || true
        log_success "Artifacts copied"
    fi

    log_success "Build directory prepared"
}

# Resolve version (supports "latest")
resolve_version() {
    if [[ $VERSION_ARG == "latest" ]]; then
        log_info "Fetching latest version tag from GitHub..."
        if ! VERSION=$(curl -fsSL "$LATEST_URL" | tr -d '[:space:]'); then
            log_warn "Failed to fetch LATEST version from GitHub"
            log_info "Using fallback version: $FALLBACK_VERSION"
            VERSION="$FALLBACK_VERSION"
        elif [[ -z $VERSION ]]; then
            log_warn "LATEST file is empty"
            log_info "Using fallback version: $FALLBACK_VERSION"
            VERSION="$FALLBACK_VERSION"
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

# Construct UI app URL from GitHub release URL (special naming convention)
construct_ui_app_url() {
    local release_url="$1"
    local version="$2"
    local platform="$3"

    # Remove trailing slash if present
    release_url="${release_url%/}"

    # Convert tag URL to download URL if needed
    if [[ $release_url == *"/tag/"* ]]; then
        release_url="${release_url/\/tag\//\/download\/}"
    fi

    # Remove 'v' prefix from version if present
    version="${version#v}"

    # Extract architecture from platform and convert to UI app format
    local arch="${platform%-darwin}"
    # Convert x86_64 to x64 for UI app naming convention
    if [[ $arch == "x86_64" ]]; then
        arch="x64"
    fi

    # Construct UI app URL: gnosis_vpn-app_VERSION_ARCH.dmg
    echo "${release_url}/gnosis_vpn-app_${version}_${arch}.dmg"
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

# Parse GitHub release URL to extract repo info and tag
parse_GITHUB_CLIENT_RELEASE_URL() {
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

# Extract version tag from GitHub release URL
extract_version_from_url() {
    local url="$1"

    # Expected format: https://github.com/owner/repo/releases/tag/v1.0.0
    if [[ $url =~ https://github\.com/([^/]+)/([^/]+)/releases/(tag|download)/(.+) ]]; then
        local tag="${BASH_REMATCH[4]}"
        echo "$tag"
    else
        log_error "Invalid GitHub release URL format: $url"
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
        log_warn "GPG signature verification failed for $asset"
        log_warn "This could indicate a security issue or missing public key"
        log_warn "Continuing anyway since verification is non-blocking"
        cat /tmp/gpg-verify.log
        rm -f "$sig_file"
        return 0
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
    if [[ -n $GITHUB_CLIENT_RELEASE_URL ]]; then

        log_info "Using GitHub release URL for binary downloads..."

        # Parse GitHub release URL to get download base URL
        local download_base_url
        download_base_url=$(parse_GITHUB_CLIENT_RELEASE_URL "$GITHUB_CLIENT_RELEASE_URL")

        # Construct binary URLs
        local vpn_service_x86_url
        vpn_service_x86_url=$(construct_binary_url "$download_base_url" "$VPN_SERVICE_BINARY_NAME" "$X86_PLATFORM")
        local vpn_service_arm_url
        vpn_service_arm_url=$(construct_binary_url "$download_base_url" "$VPN_SERVICE_BINARY_NAME" "$ARM_PLATFORM")
        local vpn_cli_x86_url
        vpn_cli_x86_url=$(construct_binary_url "$download_base_url" "$VPN_CLI_BINARY_NAME" "$X86_PLATFORM")
        local vpn_cli_arm_url
        vpn_cli_arm_url=$(construct_binary_url "$download_base_url" "$VPN_CLI_BINARY_NAME" "$ARM_PLATFORM")

        # Construct UI app URL - check for separate UI release URL first
        local ui_app_url
        if [[ -n $GITHUB_UI_RELEASE_URL ]]; then
            log_info "Using separate UI release URL: $GITHUB_UI_RELEASE_URL"
            local ui_download_base_url
            ui_download_base_url=$(parse_GITHUB_CLIENT_RELEASE_URL "$GITHUB_UI_RELEASE_URL")
            local ui_version
            ui_version=$(extract_version_from_url "$GITHUB_UI_RELEASE_URL")
            ui_app_url=$(construct_ui_app_url "$ui_download_base_url" "$ui_version" "$X86_PLATFORM")
        else
            # Fallback to using client release URL for UI app (same as VPN binaries)
            ui_app_url=$(construct_binary_url "$download_base_url" "$UI_APP_BINARY_NAME" "$X86_PLATFORM")
        fi

        log_info "Constructed URLs:"
        log_info "  VPN Service (x86_64): $vpn_service_x86_url"
        log_info "  VPN Service (aarch64): $vpn_service_arm_url"
        log_info "  VPN CLI (x86_64): $vpn_cli_x86_url"
        log_info "  VPN CLI (aarch64): $vpn_cli_arm_url"
        log_info "  UI App: $ui_app_url (x86_64 - works on ARM via Rosetta)"

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

        # Download UI app (x86_64 version for Rosetta compatibility)
        download_binary "UI App (x86_64)" "$ui_app_url" "$tmp_dir/ui-app" &
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
            "$tmp_dir/gnosis_vpn-x86_64" "$tmp_dir/gnosis_vpn-aarch64"
        chmod 755 "$BUILD_DIR/root/usr/local/bin/gnosis_vpn"

        lipo -create -output "$BUILD_DIR/root/usr/local/bin/gnosis_vpn-ctl" \
            "$tmp_dir/gnosis_vpn-ctl-x86_64" "$tmp_dir/gnosis_vpn-ctl-aarch64"
        chmod 755 "$BUILD_DIR/root/usr/local/bin/gnosis_vpn-ctl"

        # Handle UI app if downloaded
        if [[ -f "$tmp_dir/ui-app" ]]; then
            log_info "Processing UI app for packaging..."
            local ui_archive_path="$BUILD_DIR/root/usr/local/share/gnosisvpn/gnosis_vpn-app.tar.gz"
            if package_ui_app_archive "$tmp_dir/ui-app" "$ui_archive_path"; then
                log_info "UI app archive prepared for staging directory"
            else
                log_warn "UI app archive could not be prepared; installer will ship without UI application"
            fi
        fi

    else
        log_info "Using fallback GitHub release downloads..."
        log_warn "GITHUB_CLIENT_RELEASE_URL not set. Using legacy download method."

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

        # Download UI app in fallback mode if UI release URL is provided
        if [[ -n $GITHUB_UI_RELEASE_URL ]]; then
            log_info "Downloading UI app from separate release..."
            local ui_download_base_url="$GITHUB_UI_RELEASE_URL"
            local ui_version
            ui_version=$(echo "$ui_download_base_url" | sed -n 's|.*/tag/\(.*\)|\1|p')

            local ui_app_url
            ui_app_url=$(construct_ui_app_url "$ui_download_base_url" "$ui_version" "$X86_PLATFORM")

            log_info "UI app URL: $ui_app_url"
            if curl -fsSL "$ui_app_url" -o "$tmp_dir/ui-app"; then
                log_success "UI app downloaded successfully"

                # Process the downloaded UI app (same logic as above)
                log_info "Processing UI app for packaging..."
                local ui_archive_path="$BUILD_DIR/root/usr/local/share/gnosisvpn/gnosis_vpn-app.tar.gz"
                if package_ui_app_archive "$tmp_dir/ui-app" "$ui_archive_path"; then
                    log_info "UI app archive prepared for staging directory"
                else
                    log_warn "UI app archive could not be prepared; installer will ship without UI application"
                fi
            else
                log_warn "Failed to download UI app from: $ui_app_url"
                log_info "Continuing without UI app installation"
            fi
        else
            log_info "No UI release URL provided, skipping UI app download"
            log_info "Set GITHUB_UI_RELEASE_URL to include UI app in installer"
        fi
    fi

    # Verify final binaries
    log_info "Verifying final binaries:"
    lipo -info "$BUILD_DIR/root/usr/local/bin/gnosis_vpn" || true
    lipo -info "$BUILD_DIR/root/usr/local/bin/gnosis_vpn-ctl" || true

    if [[ -f "$BUILD_DIR/root/Applications/GnosisVPN" ]]; then
        lipo -info "$BUILD_DIR/root/Applications/GnosisVPN" || true
    fi

    local ui_archive="$BUILD_DIR/root/usr/local/share/gnosisvpn/gnosis_vpn-app.tar.gz"
    if [[ -f $ui_archive ]]; then
        log_info "UI app archive included in package staging directory"
        log_info "UI app will be installed to /Applications/ by postinstall script"
    fi

    # Cleanup handled by trap
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
    if [[ -n $GITHUB_CLIENT_RELEASE_URL ]]; then
        echo "  Used GitHub client release URL: $GITHUB_CLIENT_RELEASE_URL"
    else
        echo "  Used fallback GitHub releases"
    fi

    if [[ -n $GITHUB_UI_RELEASE_URL ]]; then
        echo "  Used GitHub UI release URL: $GITHUB_UI_RELEASE_URL"
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
    echo "  export GITHUB_CLIENT_RELEASE_URL='https://github.com/gnosis/gnosis_vpn-client/releases/tag/v0.50.0'"
    echo "  export GITHUB_UI_RELEASE_URL='https://github.com/gnosis/gnosis_vpn-app/releases/tag/v0.1.3'  # default: v0.1.3"
    echo "  ./build-pkg.sh latest"
    echo ""
    echo "Binary names expected in release:"
    echo "  - ${VPN_SERVICE_BINARY_NAME}-${X86_PLATFORM}"
    echo "  - ${VPN_SERVICE_BINARY_NAME}-${ARM_PLATFORM}"
    echo "  - ${VPN_CLI_BINARY_NAME}-${X86_PLATFORM}"
    echo "  - ${VPN_CLI_BINARY_NAME}-${ARM_PLATFORM}"
    echo "  - ${UI_APP_BINARY_NAME}-${X86_PLATFORM} (used for both x86_64 and ARM64 via Rosetta)"
    echo "=========================================="
}

# Run linting checks on scripts
run_lint_checks() {
    log_info "Running lint checks..."

    local errors=0
    local warnings=0

    # Check if shellcheck is available
    if ! command -v shellcheck >/dev/null 2>&1; then
        log_warn "shellcheck not found, skipping shell script linting"
        log_info "Install shellcheck for better code quality: brew install shellcheck"
    else
        log_info "Running shellcheck on installer scripts..."

        # Check main build script
        if shellcheck "$0" 2>/dev/null; then
            log_success "✓ build-pkg.sh passed shellcheck"
        else
            log_error "✗ build-pkg.sh failed shellcheck"
            errors=$((errors + 1))
        fi

        # Check installer scripts
        local script_files=(
            "$RESOURCES_DIR/scripts/preinstall"
            "$RESOURCES_DIR/scripts/postinstall"
            "$SCRIPT_DIR/uninstall.sh"
        )

        for script in "${script_files[@]}"; do
            if [[ -f $script ]]; then
                local script_name
                script_name=$(basename "$script")
                if shellcheck "$script" 2>/dev/null; then
                    log_success "✓ $script_name passed shellcheck"
                else
                    log_warn "⚠ $script_name has shellcheck warnings"
                    warnings=$((warnings + 1))
                fi
            fi
        done
    fi

    # Check for common issues in scripts
    log_info "Checking for common script issues..."

    # Check for hardcoded paths
    if grep -r "/usr/local/bin" "$RESOURCES_DIR/scripts/" >/dev/null 2>&1; then
        if grep -r '$BIN_DIR' "$RESOURCES_DIR/scripts/" >/dev/null 2>&1; then
            log_success "✓ Scripts use BIN_DIR variable instead of hardcoded paths"
        else
            log_warn '⚠ Found hardcoded /usr/local/bin paths, consider using $BIN_DIR variable'
            warnings=$((warnings + 1))
        fi
    fi

    # Check for proper error handling
    local scripts_with_set_e=0
    for script in "$RESOURCES_DIR/scripts/"*; do
        if [[ -f $script ]] && grep -q "set -e" "$script"; then
            scripts_with_set_e=$((scripts_with_set_e + 1))
        fi
    done

    if [[ $scripts_with_set_e -gt 0 ]]; then
        log_success "✓ Scripts use proper error handling (set -e)"
    else
        log_warn "⚠ Consider adding 'set -e' to scripts for better error handling"
        warnings=$((warnings + 1))
    fi

    echo ""
    if [[ $errors -eq 0 ]] && [[ $warnings -eq 0 ]]; then
        log_success "All lint checks passed!"
    elif [[ $errors -eq 0 ]]; then
        log_warn "Lint completed with $warnings warning(s)"
    else
        log_error "Lint failed with $errors error(s) and $warnings warning(s)"
        return 1
    fi
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

    echo ""
    echo "=========================================="
    echo "  Post-Build Quality Checks"
    echo "=========================================="
    echo ""

    # Run linting
    if ! run_lint_checks; then
        log_warn "Lint checks failed, but build will continue"
        log_info "Consider fixing lint issues for better code quality"
    fi

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
main

exit 0
