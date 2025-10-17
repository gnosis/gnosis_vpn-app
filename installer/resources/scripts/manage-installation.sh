#!/bin/bash
#
# Gnosis VPN Installation Manager
#
# This utility helps manage Gnosis VPN installations, including:
# - Checking current version
# - Listing backup files
# - Restoring from backups
# - Cleaning up old backups
#
# Usage:
#   ./manage-installation.sh [command]
#
# Commands:
#   version     - Show current installation version
#   backups     - List available backups
#   restore     - Restore configuration from backup
#   cleanup     - Clean up old backup files
#   status      - Show installation status
#

set -euo pipefail

# Configuration
CONFIG_DIR="/etc/gnosisvpn"
VERSION_FILE="${CONFIG_DIR}/version.txt"
CONFIG_FILE="${CONFIG_DIR}/config.toml"
BIN_DIR="/usr/local/bin"

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

# Check if we have proper permissions to manage the service
check_permissions() {
    if [[ $EUID -eq 0 ]]; then
        # Running as root, no issues
        return 0
    fi

    # Check if user is in gnosisvpn group
    local current_user
    local current_user
    current_user=$(id -un)

    if groups "$current_user" | grep -q '\bgnosisvpn\b'; then
        log_info "User '$current_user' is in gnosisvpn group - using sudo privileges"
        return 0
    else
        log_error "This command requires root privileges or membership in 'gnosisvpn' group"
        log_info "Please run with sudo or ask an administrator to add you to the gnosisvpn group:"
        log_info "  sudo dseditgroup -o edit -a $current_user -t user gnosisvpn"
        exit 1
    fi
}

# Execute launchctl command with appropriate privileges
run_launchctl() {
    local cmd="$1"
    shift

    if [[ $EUID -eq 0 ]]; then
        # Already root, run directly
        launchctl "$cmd" "$@"
    else
        # Use sudo with configured privileges
        sudo launchctl "$cmd" "$@"
    fi
}

# Show current version
show_version() {
    log_info "Gnosis VPN Installation Version"
    echo ""

    if [[ -f $VERSION_FILE ]]; then
        local version
        local version
        version=$(cat "$VERSION_FILE" 2>/dev/null || echo "unknown")
        log_success "Installed version: $version"
    else
        log_warn "No version file found"
        if [[ -f "$BIN_DIR/gnosis_vpn" ]] || [[ -f "$BIN_DIR/gnosis_vpn-ctl" ]]; then
            log_info "Legacy installation detected (no version tracking)"
        else
            log_info "No installation found"
        fi
    fi
}

# List available backups
list_backups() {
    log_info "Available Backups"
    echo ""

    local found_backups=false

    # Configuration backups
    if find "$CONFIG_DIR" -name "*.backup-*" -type f 2>/dev/null | head -1 >/dev/null; then
        log_info "Configuration backups:"
        find "$CONFIG_DIR" -name "*.backup-*" -type f -exec ls -lht {} + 2>/dev/null
        echo ""
        found_backups=true
    fi

    # Binary backups
    if find "$BIN_DIR" -name "*.backup-*" -type f 2>/dev/null | head -1 >/dev/null; then
        log_info "Binary backups:"
        find "$BIN_DIR" -name "*.backup-*" -type f -exec ls -lht {} + 2>/dev/null
        echo ""
        found_backups=true
    fi

    if [[ $found_backups != true ]]; then
        log_info "No backup files found"
    fi
}

# Restore configuration from backup
restore_config() {
    log_info "Configuration Restore"
    echo ""

    # List available config backups
    local backups
    if ! backups=$(find "$CONFIG_DIR" -name "*.backup" -type f -exec ls -t {} + 2>/dev/null); then
        log_error "No configuration backups found"
        exit 1
    fi

    echo "Available configuration backups:"
    local i=1
    while IFS= read -r backup; do
        local backup_name
        local backup_name
        backup_name=$(basename "$backup")
        local backup_date
        backup_date=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$backup" 2>/dev/null || echo "unknown")
        echo "  $i) $backup_name (created: $backup_date)"
        i=$((i + 1))
    done <<<"$backups"

    echo ""
    read -r -p "Select backup to restore (number): " choice

    local selected_backup
    local selected_backup
    selected_backup=$(echo "$backups" | sed -n "${choice}p")

    if [[ -z $selected_backup ]]; then
        log_error "Invalid selection"
        exit 1
    fi

    # Backup current config before restore
    if [[ -f $CONFIG_FILE ]]; then
        local current_backup
        current_backup="${CONFIG_FILE}.pre-restore-$(date +%Y%m%d-%H%M%S)"
        cp "$CONFIG_FILE" "$current_backup"
        log_info "Current configuration backed up to: $current_backup"
    fi

    # Restore selected backup
    if cp "$selected_backup" "$CONFIG_FILE"; then
        log_success "Configuration restored from: $(basename "$selected_backup")"
        log_info "Restart the VPN service for changes to take effect"
    else
        log_error "Failed to restore configuration"
        exit 1
    fi
}

# Clean up old backups
cleanup_backups() {
    log_info "Cleaning up old backup files..."

    local removed_files=0

    # Clean up old config backups (keep 5 most recent)
    if find "$CONFIG_DIR" -name "*.backup" -type f 2>/dev/null | head -1 >/dev/null; then
        local old_config_backups
        local old_config_backups
        old_config_backups=$(find "$CONFIG_DIR" -name "*.backup" -type f -exec ls -t {} + 2>/dev/null | tail -n +6)
        if [[ -n $old_config_backups ]]; then
            echo "$old_config_backups" | xargs rm -f
            local count
            count=$(echo "$old_config_backups" | wc -l | tr -d ' ')
            removed_files=$((removed_files + count))
            log_info "Removed $count old configuration backup(s)"
        fi
    fi

    # Clean up old binary backups (keep 10 most recent)
    if find "$BIN_DIR" -name "*.backup-*" -type f 2>/dev/null | head -1 >/dev/null; then
        local old_binary_backups
        local old_binary_backups
        old_binary_backups=$(find "$BIN_DIR" -name "*.backup-*" -type f -exec ls -t {} + 2>/dev/null | tail -n +11)
        if [[ -n $old_binary_backups ]]; then
            echo "$old_binary_backups" | xargs rm -f
            local count
            count=$(echo "$old_binary_backups" | wc -l | tr -d ' ')
            removed_files=$((removed_files + count))
            log_info "Removed $count old binary backup(s)"
        fi
    fi

    if [[ $removed_files -eq 0 ]]; then
        log_info "No old backup files to clean up"
    else
        log_success "Cleaned up $removed_files backup files"
    fi
}

# Show installation status
show_status() {
    log_info "Gnosis VPN Installation Status"
    echo ""

    # Version info
    show_version
    echo ""

    # Binary status
    log_info "Binary status:"
    if [[ -f "$BIN_DIR/gnosis_vpn" ]]; then
        local vpn_version
        local vpn_version
        vpn_version=$("$BIN_DIR/gnosis_vpn" --version 2>/dev/null | head -1 || echo "unknown")
        log_success "gnosis_vpn: installed ($vpn_version)"
    else
        log_error "gnosis_vpn: not found"
    fi

    if [[ -f "$BIN_DIR/gnosis_vpn-ctl" ]]; then
        local ctl_version
        local ctl_version
        ctl_version=$("$BIN_DIR/gnosis_vpn-ctl" --version 2>/dev/null | head -1 || echo "unknown")
        log_success "gnosis_vpn-ctl: installed ($ctl_version)"
    else
        log_error "gnosis_vpn-ctl: not found"
    fi

    echo ""

    # Configuration status
    log_info "Configuration status:"
    if [[ -f $CONFIG_FILE ]]; then
        log_success "Configuration file: $CONFIG_FILE"
        local network
        local network
        network=$(grep "# Network:" "$CONFIG_FILE" 2>/dev/null | sed 's/.*Network: //' | tr -d ' ' || echo "unknown")
        log_info "Network: $network"
    else
        log_error "Configuration file not found"
    fi

    echo ""

    # Service status
    log_info "Service status:"
    if run_launchctl print system/org.gnosis.vpn >/dev/null 2>&1; then
        log_success "Launchd service is loaded"
        if pgrep -f "gnosis_vpn" >/dev/null 2>&1; then
            local pid
            local pid
            pid=$(pgrep -f "gnosis_vpn")
            log_success "VPN process is running (PID: $pid)"
        else
            log_warn "Service is loaded but process is not running"
        fi
    else
        log_error "Launchd service is not loaded"
        if pgrep -f "gnosis_vpn" >/dev/null 2>&1; then
            log_warn "VPN process is running manually"
        else
            log_info "VPN service is not running"
        fi
    fi

    echo ""

    # System user and group status
    log_info "System user and group status:"
    if dscl . -read "/Users/gnosisvpn" >/dev/null 2>&1; then
        local uid gid
        local uid
        uid=$(dscl . -read "/Users/gnosisvpn" UniqueID 2>/dev/null | awk '{print $2}' || echo "unknown")
        local gid
        gid=$(dscl . -read "/Users/gnosisvpn" PrimaryGroupID 2>/dev/null | awk '{print $2}' || echo "unknown")
        log_success "System user 'gnosisvpn' exists (UID: $uid, GID: $gid)"
    else
        log_warn "System user 'gnosisvpn' not found (service runs as root)"
    fi

    if dscl . -read "/Groups/gnosisvpn" >/dev/null 2>&1; then
        local group_gid members
        local group_gid
        group_gid=$(dscl . -read "/Groups/gnosisvpn" PrimaryGroupID 2>/dev/null | awk '{print $2}' || echo "unknown")
        local members
        members=$(dscl . -read "/Groups/gnosisvpn" GroupMembership 2>/dev/null | cut -d' ' -f2- || echo "none")
        log_success "System group 'gnosisvpn' exists (GID: $group_gid)"
        log_info "  Group members: $members"
    else
        log_warn "System group 'gnosisvpn' not found"
    fi

    echo ""

    # Backup summary
    local config_backups binary_backups
    local config_backups
    config_backups=$(find "$CONFIG_DIR" -name "*.backup" -type f 2>/dev/null | wc -l | tr -d ' ')
    binary_backups=$(find "$BIN_DIR" -name "*.backup-*" -type f 2>/dev/null | wc -l | tr -d ' ')

    log_info "Backup summary:"
    log_info "  Configuration backups: $config_backups"
    log_info "  Binary backups: $binary_backups"
}

# Start VPN service
start_service() {
    log_info "Starting Gnosis VPN service..."

    local plist_path="/Library/LaunchDaemons/org.gnosis.vpn.plist"

    if [[ ! -f $plist_path ]]; then
        log_error "Launchd service not installed"
        log_info "Please reinstall the application to create the service"
        exit 1
    fi

    if run_launchctl print system/org.gnosis.vpn >/dev/null 2>&1; then
        log_info "Service is already loaded, restarting..."
        run_launchctl kickstart system/org.gnosis.vpn
    else
        log_info "Loading service..."
        run_launchctl bootstrap system "$plist_path"
    fi

    # Wait and check status
    sleep 3
    if pgrep -f "gnosis_vpn" >/dev/null 2>&1; then
        log_success "Service started successfully"
    else
        log_error "Service failed to start"
        log_info "Check logs: tail -f /var/log/gnosis_vpn/gnosis_vpn.error.log"
        exit 1
    fi
}

# Stop VPN service
stop_service() {
    log_info "Stopping Gnosis VPN service..."

    local plist_path="/Library/LaunchDaemons/org.gnosis.vpn.plist"

    if run_launchctl print system/org.gnosis.vpn >/dev/null 2>&1; then
        run_launchctl bootout system "$plist_path"
        log_success "Service stopped"
    else
        log_info "Service was not running"
    fi

    # Kill any remaining processes
    if pgrep -f "gnosis_vpn" >/dev/null 2>&1; then
        log_info "Terminating remaining VPN processes..."
        pkill -f "gnosis_vpn" || true
        sleep 2
        if pgrep -f "gnosis_vpn" >/dev/null 2>&1; then
            log_warn "Some VPN processes may still be running"
        else
            log_success "All VPN processes terminated"
        fi
    fi
}

# Restart VPN service
restart_service() {
    log_info "Restarting Gnosis VPN service..."
    stop_service
    sleep 2
    start_service
}

# Show service logs
show_logs() {
    local log_type="${1:-service}"

    case "$log_type" in
    "service" | "info")
        log_info "Showing service logs (last 50 lines):"
        echo ""
        tail -n 50 /var/log/gnosis_vpn/gnosis_vpn.log 2>/dev/null || {
            log_error "Service log file not found"
            exit 1
        }
        ;;
    "error" | "errors")
        log_info "Showing error logs (last 50 lines):"
        echo ""
        tail -n 50 /var/log/gnosis_vpn/gnosis_vpn.error.log 2>/dev/null || {
            log_error "Error log file not found"
            exit 1
        }
        ;;
    "follow" | "tail")
        log_info "Following service logs (Ctrl+C to stop):"
        echo ""
        tail -f /var/log/gnosis_vpn/gnosis_vpn.log 2>/dev/null || {
            log_error "Service log file not found"
            exit 1
        }
        ;;
    *)
        log_error "Unknown log type: $log_type"
        log_info "Available options: service, error, follow"
        exit 1
        ;;
    esac
}

# Show usage
show_usage() {
    echo "Gnosis VPN Installation Manager"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  version     Show current installation version"
    echo "  status      Show complete installation status"
    echo "  backups     List available backup files"
    echo "  restore     Restore configuration from backup (requires sudo)"
    echo "  cleanup     Clean up old backup files (requires sudo)"
    echo ""
    echo "Service Management:"
    echo "  start       Start the VPN service (requires sudo)"
    echo "  stop        Stop the VPN service (requires sudo)"
    echo "  restart     Restart the VPN service (requires sudo)"
    echo "  logs        Show service logs"
    echo ""
    echo "Log Options:"
    echo "  logs service    Show service logs (default)"
    echo "  logs error      Show error logs"
    echo "  logs follow     Follow logs in real-time"
    echo ""
    echo "  help        Show this help message"
    echo ""
}

# Main execution
main() {
    local command="${1:-status}"

    case "$command" in
    "version")
        show_version
        ;;
    "backups")
        list_backups
        ;;
    "restore")
        check_permissions "$command"
        restore_config
        ;;
    "cleanup")
        check_permissions "$command"
        cleanup_backups
        ;;
    "status")
        show_status
        ;;
    "start")
        check_permissions "$command"
        start_service
        ;;
    "stop")
        check_permissions "$command"
        stop_service
        ;;
    "restart")
        check_permissions "$command"
        restart_service
        ;;
    "logs")
        local log_type="${2:-service}"
        show_logs "$log_type"
        ;;
    "help" | "-h" | "--help")
        show_usage
        ;;
    *)
        log_error "Unknown command: $command"
        echo ""
        show_usage
        exit 1
        ;;
    esac
}

# Execute main function
main "$@"

exit 0
