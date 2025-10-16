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

# Check if running as root
check_permissions() {
    if [[ $EUID -ne 0 ]] && [[ "$1" == "restore" || "$1" == "cleanup" ]]; then
        log_error "This command requires root privileges"
        log_info "Please run with sudo: sudo $0 $1"
        exit 1
    fi
}

# Show current version
show_version() {
    log_info "Gnosis VPN Installation Version"
    echo ""
    
    if [[ -f "$VERSION_FILE" ]]; then
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
    if ls "$CONFIG_DIR"/*.backup 2>/dev/null | head -1 >/dev/null; then
        log_info "Configuration backups:"
        ls -lht "$CONFIG_DIR"/*.backup 2>/dev/null
        echo ""
        found_backups=true
    fi
    
    # Binary backups
    if ls "$BIN_DIR"/*.backup-* 2>/dev/null | head -1 >/dev/null; then
        log_info "Binary backups:"
        ls -lht "$BIN_DIR"/*.backup-* 2>/dev/null
        echo ""
        found_backups=true
    fi
    
    if [[ "$found_backups" != true ]]; then
        log_info "No backup files found"
    fi
}

# Restore configuration from backup
restore_config() {
    log_info "Configuration Restore"
    echo ""
    
    # List available config backups
    local backups
    if ! backups=$(ls -t "$CONFIG_DIR"/*.backup 2>/dev/null); then
        log_error "No configuration backups found"
        exit 1
    fi
    
    echo "Available configuration backups:"
    local i=1
    while IFS= read -r backup; do
        local backup_name
        backup_name=$(basename "$backup")
        local backup_date
        backup_date=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$backup" 2>/dev/null || echo "unknown")
        echo "  $i) $backup_name (created: $backup_date)"
        i=$((i + 1))
    done <<< "$backups"
    
    echo ""
    read -p "Select backup to restore (number): " choice
    
    local selected_backup
    selected_backup=$(echo "$backups" | sed -n "${choice}p")
    
    if [[ -z "$selected_backup" ]]; then
        log_error "Invalid selection"
        exit 1
    fi
    
    # Backup current config before restore
    if [[ -f "$CONFIG_FILE" ]]; then
        local current_backup="${CONFIG_FILE}.pre-restore-$(date +%Y%m%d-%H%M%S)"
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
    if ls "$CONFIG_DIR"/*.backup 2>/dev/null | head -1 >/dev/null; then
        local old_config_backups
        old_config_backups=$(ls -t "$CONFIG_DIR"/*.backup 2>/dev/null | tail -n +6)
        if [[ -n "$old_config_backups" ]]; then
            echo "$old_config_backups" | xargs rm -f
            local count
            count=$(echo "$old_config_backups" | wc -l | tr -d ' ')
            removed_files=$((removed_files + count))
            log_info "Removed $count old configuration backup(s)"
        fi
    fi
    
    # Clean up old binary backups (keep 10 most recent)
    if ls "$BIN_DIR"/*.backup-* 2>/dev/null | head -1 >/dev/null; then
        local old_binary_backups
        old_binary_backups=$(ls -t "$BIN_DIR"/*.backup-* 2>/dev/null | tail -n +11)
        if [[ -n "$old_binary_backups" ]]; then
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
        vpn_version=$("$BIN_DIR/gnosis_vpn" --version 2>/dev/null | head -1 || echo "unknown")
        log_success "gnosis_vpn: installed ($vpn_version)"
    else
        log_error "gnosis_vpn: not found"
    fi
    
    if [[ -f "$BIN_DIR/gnosis_vpn-ctl" ]]; then
        local ctl_version
        ctl_version=$("$BIN_DIR/gnosis_vpn-ctl" --version 2>/dev/null | head -1 || echo "unknown")
        log_success "gnosis_vpn-ctl: installed ($ctl_version)"
    else
        log_error "gnosis_vpn-ctl: not found"
    fi
    
    echo ""
    
    # Configuration status
    log_info "Configuration status:"
    if [[ -f "$CONFIG_FILE" ]]; then
        log_success "Configuration file: $CONFIG_FILE"
        local network
        network=$(grep "# Network:" "$CONFIG_FILE" 2>/dev/null | sed 's/.*Network: //' | tr -d ' ' || echo "unknown")
        log_info "Network: $network"
    else
        log_error "Configuration file not found"
    fi
    
    echo ""
    
    # Service status
    log_info "Service status:"
    if pgrep -f "gnosis_vpn" >/dev/null 2>&1; then
        log_success "VPN service is running"
    else
        log_info "VPN service is not running"
    fi
    
    echo ""
    
    # Backup summary
    local config_backups binary_backups
    config_backups=$(ls "$CONFIG_DIR"/*.backup 2>/dev/null | wc -l | tr -d ' ')
    binary_backups=$(ls "$BIN_DIR"/*.backup-* 2>/dev/null | wc -l | tr -d ' ')
    
    log_info "Backup summary:"
    log_info "  Configuration backups: $config_backups"
    log_info "  Binary backups: $binary_backups"
}

# Show usage
show_usage() {
    echo "Gnosis VPN Installation Manager"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  version     Show current installation version"
    echo "  backups     List available backup files"
    echo "  restore     Restore configuration from backup (requires sudo)"
    echo "  cleanup     Clean up old backup files (requires sudo)"
    echo "  status      Show complete installation status"
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
        "help"|"-h"|"--help")
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