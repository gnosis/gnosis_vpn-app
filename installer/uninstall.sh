#!/bin/bash
#
# Gnosis VPN Uninstaller for macOS
#
# This script removes all files installed by the Gnosis VPN installer.
#
# Usage:
#   sudo ./uninstall.sh
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PKG_ID="org.gnosis.vpn.client"
BIN_DIR="/usr/local/bin"
CONFIG_DIR="/etc/gnosisvpn"
LOG_DIR="/Library/Logs/GnosisVPNInstaller"

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

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root"
        echo "Please run: sudo $0"
        exit 1
    fi
}

# Print banner
print_banner() {
    echo "=========================================="
    echo "  Gnosis VPN Uninstaller"
    echo "=========================================="
    echo ""
}

# Confirm uninstallation
confirm_uninstall() {
    echo "This will remove:"
    echo "  - Binaries: $BIN_DIR/gnosis_vpn, $BIN_DIR/gnosis_vpn-ctl, $BIN_DIR/gnosis-vpn-manager"
    echo "  - Launchd service: /Library/LaunchDaemons/org.gnosis.vpn.plist"
    echo "  - Configuration: $CONFIG_DIR/"
    echo "  - Service logs: /var/log/gnosis_vpn/"
    echo "  - Installation logs: $LOG_DIR/"
    echo "  - Package receipt: $PKG_ID"
    echo ""
    read -p "Are you sure you want to uninstall Gnosis VPN? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Uninstallation cancelled"
        exit 0
    fi
    echo ""
}

# Remove launchd service
remove_launchd_service() {
    log_info "Removing launchd service..."

    local plist_path="/Library/LaunchDaemons/org.gnosis.vpn.plist"

    if [[ -f $plist_path ]]; then
        # Stop and unload the service
        if launchctl print system/org.gnosis.vpn >/dev/null 2>&1; then
            log_info "Stopping launchd service..."
            launchctl bootout system "$plist_path" 2>/dev/null || true
            sleep 2
        fi

        # Remove the plist file
        rm -f "$plist_path"
        log_success "Removed launchd service: $plist_path"
    else
        log_info "No launchd service found"
    fi
    echo ""
}

# Remove system user
remove_system_user() {
    log_info "Removing system user..."

    local username="gnosisvpn"

    if dscl . -read "/Users/$username" >/dev/null 2>&1; then
        log_info "Found system user: $username"

        # Get home directory before deletion
        local homedir
        homedir=$(dscl . -read "/Users/$username" NFSHomeDirectory 2>/dev/null | cut -d' ' -f2- || echo "")

        # Delete the user
        dscl . -delete "/Users/$username"
        log_success "Removed system user: $username"

        # Remove home directory if it exists
        if [[ -n $homedir ]] && [[ -d $homedir ]]; then
            log_info "Removing user home directory: $homedir"
            rm -rf "$homedir"
        fi
    else
        log_info "No system user '$username' found"
    fi
}

# Remove system group
remove_system_group() {
    log_info "Removing system group..."

    local groupname="gnosisvpn"

    if dscl . -read "/Groups/$groupname" >/dev/null 2>&1; then
        log_info "Found system group: $groupname"

        # Remove all users from the group first
        local members
        members=$(dscl . -read "/Groups/$groupname" GroupMembership 2>/dev/null | cut -d' ' -f2- || echo "")

        if [[ -n $members ]]; then
            log_info "Removing users from group: $members"
            for member in $members; do
                dseditgroup -o edit -d "$member" -t user "$groupname" 2>/dev/null || true
            done
        fi

        # Delete the group
        dscl . -delete "/Groups/$groupname"
        log_success "Removed system group: $groupname"
    else
        log_info "No system group '$groupname' found"
    fi
}

# Clean up system directories created for the service
cleanup_system_directories() {
    log_info "Cleaning up system directories..."

    local directories=(
        "/var/run/gnosis_vpn"
        # "/var/lib/gnosis_vpn" # should not remove the identity store
        "/var/log/gnosis_vpn"
    )

    for dir in "${directories[@]}"; do
        if [[ -d $dir ]]; then
            log_info "Removing directory: $dir"
            rm -rf "$dir"
        fi
    done

    log_success "System directories cleaned up"
    echo ""
}

# Remove sudo privileges configuration
remove_sudo_privileges() {
    log_info "Removing sudo privileges configuration..."

    local sudoers_file="/etc/sudoers.d/gnosis-vpn"

    if [[ -f $sudoers_file ]]; then
        log_info "Removing sudoers configuration: $sudoers_file"
        rm -f "$sudoers_file"
        log_success "Sudo privileges configuration removed"
    else
        log_info "No sudo privileges configuration found"
    fi
}

# Stop running processes
stop_processes() {
    log_info "Checking for running VPN processes..."

    if pgrep -f gnosis_vpn >/dev/null 2>&1; then
        log_warn "Found running gnosis_vpn process(es)"
        log_info "Stopping VPN processes..."

        # Try graceful shutdown first
        pkill -TERM -f gnosis_vpn 2>/dev/null || true
        sleep 2

        # Force kill if still running
        if pgrep -f gnosis_vpn >/dev/null 2>&1; then
            log_warn "Processes still running, forcing shutdown..."
            pkill -KILL -f gnosis_vpn 2>/dev/null || true
            sleep 1
        fi

        # Verify processes stopped
        if pgrep -f gnosis_vpn >/dev/null 2>&1; then
            log_error "Failed to stop VPN processes"
            log_info "Please stop gnosis_vpn manually before uninstalling"
            exit 1
        fi

        log_success "VPN processes stopped"
    else
        log_info "No running VPN processes found"
    fi
    echo ""
}

# Backup configuration
backup_config() {
    if [[ -d $CONFIG_DIR ]]; then
        local timestamp
        timestamp=$(date +%Y%m%d-%H%M%S)
        local backup_dir="${HOME}/gnosis-vpn-config-backup-${timestamp}"

        log_info "Backing up configuration to: $backup_dir"
        if cp -R "$CONFIG_DIR" "$backup_dir"; then
            log_success "Configuration backed up to $backup_dir"
        else
            log_warn "Failed to backup configuration"
        fi
        echo ""
    fi
}

# Remove binaries
remove_binaries() {
    log_info "Removing binaries..."

    local removed=0

    if [[ -f "$BIN_DIR/gnosis_vpn" ]]; then
        rm -f "$BIN_DIR/gnosis_vpn"
        log_success "Removed $BIN_DIR/gnosis_vpn"
        removed=$((removed + 1))
    fi

    if [[ -f "$BIN_DIR/gnosis_vpn-ctl" ]]; then
        rm -f "$BIN_DIR/gnosis_vpn-ctl"
        log_success "Removed $BIN_DIR/gnosis_vpn-ctl"
        removed=$((removed + 1))
    fi

    if [[ -f "$BIN_DIR/gnosis-vpn-manager" ]]; then
        rm -f "$BIN_DIR/gnosis-vpn-manager"
        log_success "Removed $BIN_DIR/gnosis-vpn-manager"
        removed=$((removed + 1))
    fi

    if [[ $removed -eq 0 ]]; then
        log_warn "No binaries found to remove"
    fi

    echo ""
}

# Remove UI application
remove_ui_app() {
    log_info "Removing UI application..."

    local removed=0
    local ui_app_paths=(
        "/Applications/gnosis_vpn-app.app"
        "/Applications/GnosisVPN.app"
        "/usr/local/share/gnosisvpn/gnosis_vpn-app.app"
    )

    for app_path in "${ui_app_paths[@]}"; do
        if [[ -d $app_path ]]; then
            log_info "Removing UI app: $app_path"
            rm -rf "$app_path"
            log_success "Removed $app_path"
            removed=$((removed + 1))
        fi
    done

    # Clean up LaunchServices registrations for the UI app
    log_info "Cleaning up LaunchServices registrations..."
    /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -kill -r -domain local -domain system -domain user 2>/dev/null || true

    # Try to remove any quarantine attributes that might remain
    if command -v xattr >/dev/null 2>&1; then
        for app_path in "${ui_app_paths[@]}"; do
            if [[ -d $app_path ]]; then
                xattr -dr com.apple.quarantine "$app_path" 2>/dev/null || true
            fi
        done
    fi

    if [[ $removed -eq 0 ]]; then
        log_info "No UI application found to remove"
    else
        log_success "Removed $removed UI application(s)"
    fi

    echo ""
}

# Remove configuration
remove_config() {
    log_info "Removing configuration..."

    if [[ -d $CONFIG_DIR ]]; then
        rm -rf "$CONFIG_DIR"
        log_success "Removed $CONFIG_DIR"
    else
        log_warn "Configuration directory not found"
    fi

    echo ""
}

# Remove logs
remove_logs() {
    log_info "Removing installation logs..."

    if [[ -d $LOG_DIR ]]; then
        rm -rf "$LOG_DIR"
        log_success "Removed $LOG_DIR"
    else
        log_warn "Log directory not found"
    fi

    # Also remove service logs
    local service_log_dir="/var/log/gnosis_vpn"
    if [[ -d $service_log_dir ]]; then
        rm -rf "$service_log_dir"
        log_success "Removed service logs: $service_log_dir"
    fi

    echo ""
}

# Forget package receipt
forget_package() {
    log_info "Removing package receipt..."

    if pkgutil --pkgs | grep -q "^${PKG_ID}$"; then
        pkgutil --forget "$PKG_ID"
        log_success "Forgot package: $PKG_ID"
    else
        log_warn "Package receipt not found: $PKG_ID"
    fi

    echo ""
}

# Verify uninstallation
verify_uninstall() {
    log_info "Verifying uninstallation..."

    local errors=0

    if [[ -f "$BIN_DIR/gnosis_vpn" ]]; then
        log_error "Binary still exists: $BIN_DIR/gnosis_vpn"
        errors=$((errors + 1))
    fi

    if [[ -f "$BIN_DIR/gnosis_vpn-ctl" ]]; then
        log_error "Binary still exists: $BIN_DIR/gnosis_vpn-ctl"
        errors=$((errors + 1))
    fi

    if [[ -f "$BIN_DIR/gnosis-vpn-manager" ]]; then
        log_error "Management script still exists: $BIN_DIR/gnosis-vpn-manager"
        errors=$((errors + 1))
    fi

    if [[ -f "/Library/LaunchDaemons/org.gnosis.vpn.plist" ]]; then
        log_error "Launchd service still exists: /Library/LaunchDaemons/org.gnosis.vpn.plist"
        errors=$((errors + 1))
    fi

    if launchctl print system/org.gnosis.vpn >/dev/null 2>&1; then
        log_error "Launchd service is still loaded"
        errors=$((errors + 1))
    fi

    if [[ -d $CONFIG_DIR ]]; then
        log_error "Configuration directory still exists: $CONFIG_DIR"
        errors=$((errors + 1))
    fi

    if pkgutil --pkgs | grep -q "^${PKG_ID}$"; then
        log_error "Package receipt still exists: $PKG_ID"
        errors=$((errors + 1))
    fi

    # Check system user removal
    if dscl . -read "/Users/gnosisvpn" >/dev/null 2>&1; then
        log_error "System user still exists: gnosisvpn"
        errors=$((errors + 1))
    fi

    # Check system group removal
    if dscl . -read "/Groups/gnosisvpn" >/dev/null 2>&1; then
        log_error "System group still exists: gnosisvpn"
        errors=$((errors + 1))
    fi

    # Check system directories removal
    local system_dirs=("/var/run/gnosis_vpn" "/var/lib/gnosis_vpn" "/var/log/gnosis_vpn")
    for dir in "${system_dirs[@]}"; do
        if [[ -d $dir ]]; then
            log_error "System directory still exists: $dir"
            errors=$((errors + 1))
        fi
    done

    # Check sudo privileges removal
    if [[ -f "/etc/sudoers.d/gnosis-vpn" ]]; then
        log_error "Sudo privileges configuration still exists: /etc/sudoers.d/gnosis-vpn"
        errors=$((errors + 1))
    fi

    if [[ $errors -eq 0 ]]; then
        log_success "Uninstallation verified successfully"
    else
        log_warn "Uninstallation completed with $errors warning(s)"
    fi

    echo ""
}

# Print summary
print_summary() {
    echo "=========================================="
    echo "  Uninstallation Summary"
    echo "=========================================="
    echo ""
    echo "Gnosis VPN has been uninstalled from your system."
    echo ""
    echo "What was removed:"
    echo "  ✓ Binaries"
    echo "  ✓ UI Application (if installed)"
    echo "  ✓ Launchd service"
    echo "  ✓ System user and group (gnosisvpn)"
    echo "  ✓ Sudo privileges configuration"
    echo "  ✓ System directories (/var/lib/gnosis_vpn, /var/run/gnosis_vpn)"
    echo "  ✓ Configuration (backed up to ~/gnosis-vpn-config-backup-*)"
    echo "  ✓ Service logs"
    echo "  ✓ Installation logs"
    echo "  ✓ Package receipt"
    echo "  ✓ LaunchServices registrations"
    echo ""
    echo "To reinstall, download and run the installer again."
    echo "=========================================="
}

# Main uninstallation process
main() {
    print_banner
    check_root
    confirm_uninstall
    remove_launchd_service
    stop_processes
    backup_config
    remove_binaries
    remove_ui_app
    remove_config
    remove_logs
    cleanup_system_directories
    remove_sudo_privileges
    remove_system_user
    remove_system_group
    forget_package
    verify_uninstall
    print_summary
}

# Execute main
main

exit 0
