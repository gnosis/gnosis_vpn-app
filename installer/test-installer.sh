#!/bin/bash
#
# Test script for Gnosis VPN macOS installer
#
# This script validates the installer structure and components
# without requiring actual installation or network access.
#
# Usage:
#   ./test-installer.sh
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $*"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $*"
}

log_test() {
    echo -e "${YELLOW}[TEST]${NC} $*"
}

# Test helper
run_test() {
    local test_name="$1"
    local test_command="$2"

    TESTS_RUN=$((TESTS_RUN + 1))
    log_test "$test_name"

    if eval "$test_command"; then
        log_success "$test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        log_error "$test_name"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# Print banner
print_banner() {
    echo "=========================================="
    echo "  Gnosis VPN Installer Test Suite"
    echo "=========================================="
    echo ""
}

# Test: Required files exist
test_required_files() {
    log_info "Testing required files..."

    run_test "build-pkg.sh exists" "[[ -f '$SCRIPT_DIR/build-pkg.sh' ]]"
    run_test "sign-pkg.sh exists" "[[ -f '$SCRIPT_DIR/sign-pkg.sh' ]]"
    run_test "uninstall.sh exists" "[[ -f '$SCRIPT_DIR/uninstall.sh' ]]"
    run_test "Distribution.xml exists" "[[ -f '$SCRIPT_DIR/Distribution.xml' ]]"
    run_test "README.md exists" "[[ -f '$SCRIPT_DIR/README.md' ]]"

    echo ""
}

# Test: Scripts are executable
test_script_permissions() {
    log_info "Testing script permissions..."

    run_test "build-pkg.sh is executable" "[[ -x '$SCRIPT_DIR/build-pkg.sh' ]]"
    run_test "sign-pkg.sh is executable" "[[ -x '$SCRIPT_DIR/sign-pkg.sh' ]]"
    run_test "uninstall.sh is executable" "[[ -x '$SCRIPT_DIR/uninstall.sh' ]]"

    echo ""
}

# Test: Resource files exist
test_resource_files() {
    log_info "Testing resource files..."

    run_test "resources directory exists" "[[ -d '$SCRIPT_DIR/resources' ]]"
    run_test "welcome.html exists" "[[ -f '$SCRIPT_DIR/resources/welcome.html' ]]"
    run_test "readme.html exists" "[[ -f '$SCRIPT_DIR/resources/readme.html' ]]"
    run_test "conclusion.html exists" "[[ -f '$SCRIPT_DIR/resources/conclusion.html' ]]"

    echo ""
}

# Test: Installation scripts exist
test_installation_scripts() {
    log_info "Testing installation scripts..."

    run_test "scripts directory exists" "[[ -d '$SCRIPT_DIR/resources/scripts' ]]"
    run_test "preinstall exists" "[[ -f '$SCRIPT_DIR/resources/scripts/preinstall' ]]"
    run_test "postinstall exists" "[[ -f '$SCRIPT_DIR/resources/scripts/postinstall' ]]"
    run_test "installationCheck.js exists" "[[ -f '$SCRIPT_DIR/resources/scripts/installationCheck.js' ]]"
    run_test "preinstall is executable" "[[ -x '$SCRIPT_DIR/resources/scripts/preinstall' ]]"
    run_test "postinstall is executable" "[[ -x '$SCRIPT_DIR/resources/scripts/postinstall' ]]"

    echo ""
}

# Test: Configuration files exist
test_config_templates() {
    log_info "Testing configuration files..."

    run_test "config directory exists" "[[ -d '$SCRIPT_DIR/resources/config' ]]"
    run_test "config templates directory exists" "[[ -d '$SCRIPT_DIR/resources/config/templates' ]]"
    run_test "config system directory exists" "[[ -d '$SCRIPT_DIR/resources/config/system' ]]"
    run_test "rotsee.toml.template exists" "[[ -f '$SCRIPT_DIR/resources/config/templates/rotsee.toml.template' ]]"
    run_test "dufour.toml.template exists" "[[ -f '$SCRIPT_DIR/resources/config/templates/dufour.toml.template' ]]"
    run_test "launchd plist exists" "[[ -f '$SCRIPT_DIR/resources/config/system/org.gnosis.vpn.plist' ]]"

    echo ""
}

# Test: Plist file validation
test_plist_configuration() {
    log_info "Testing plist configuration..."

    local plist_file="$SCRIPT_DIR/resources/config/system/org.gnosis.vpn.plist"

    run_test "plist syntax is valid" "plutil -lint '$plist_file' >/dev/null 2>&1"
    run_test "plist has Label key" "grep -q '<key>Label</key>' '$plist_file'"
    run_test "plist has ProgramArguments" "grep -q '<key>ProgramArguments</key>' '$plist_file'"
    run_test "plist has RunAtLoad" "grep -q '<key>RunAtLoad</key>' '$plist_file'"
    run_test "plist has KeepAlive" "grep -q '<key>KeepAlive</key>' '$plist_file'"
    run_test "plist references correct binary" "grep -q '/usr/local/bin/gnosis_vpn' '$plist_file'"
    run_test "plist references correct config" "grep -q '/etc/gnosisvpn/config.toml' '$plist_file'"
    run_test "plist uses system user" "grep -A1 '<key>UserName</key>' '$plist_file' | grep -q '<string>gnosisvpn</string>'"
    run_test "plist uses system group" "grep -A1 '<key>GroupName</key>' '$plist_file' | grep -q '<string>gnosisvpn</string>'"
    run_test "plist uses correct working directory" "grep -A1 '<key>WorkingDirectory</key>' '$plist_file' | grep -q '<string>/var/lib/gnosisvpn</string>'"

    echo ""
}

# Test: System user and group functions
test_system_user_functions() {
    log_info "Testing system user and group functions..."

    local postinstall="$SCRIPT_DIR/resources/scripts/postinstall"

    run_test "postinstall has create_system_user function" "grep -q 'create_system_user()' '$postinstall'"
    run_test "postinstall has create_system_group function" "grep -q 'create_system_group()' '$postinstall'"
    run_test "postinstall has update_user_group function" "grep -q 'update_user_group()' '$postinstall'"
    run_test "postinstall has setup_user_permissions function" "grep -q 'setup_user_permissions()' '$postinstall'"
    run_test "postinstall uses dscl commands" "grep -q 'dscl .' '$postinstall'"
    run_test "postinstall uses dseditgroup" "grep -q 'dseditgroup' '$postinstall'"

    local uninstall="$SCRIPT_DIR/uninstall.sh"
    run_test "uninstall has remove_system_user function" "grep -q 'remove_system_user()' '$uninstall'"
    run_test "uninstall has remove_system_group function" "grep -q 'remove_system_group()' '$uninstall'"
    run_test "uninstall has cleanup_system_directories function" "grep -q 'cleanup_system_directories()' '$uninstall'"

    # Test sudo privileges configuration
    run_test "postinstall has configure_sudo_privileges function" "grep -q 'configure_sudo_privileges()' '$postinstall'"
    run_test "uninstall has remove_sudo_privileges function" "grep -q 'remove_sudo_privileges()' '$uninstall'"
    run_test "sudoers file exists" "[[ -f '$SCRIPT_DIR/resources/config/system/gnosis-vpn-sudoers' ]]"
    run_test "sudoers file has gnosisvpn group permissions" "grep -q '%gnosisvpn' '$SCRIPT_DIR/resources/config/system/gnosis-vpn-sudoers'"
    run_test "sudoers file allows launchctl commands" "grep -q 'launchctl' '$SCRIPT_DIR/resources/config/system/gnosis-vpn-sudoers'"
    run_test "management script has run_launchctl function" "grep -q 'run_launchctl()' '$SCRIPT_DIR/resources/scripts/manage-installation.sh'"

    echo ""
}

# Test: Template files are valid TOML
test_template_syntax() {
    log_info "Testing template syntax..."

    # Check for basic TOML structure
    local rotsee_template="$SCRIPT_DIR/resources/config/templates/rotsee.toml.template"
    local dufour_template="$SCRIPT_DIR/resources/config/templates/dufour.toml.template"

    run_test "rotsee template has destinations section" "grep -q '\\[destinations\\.' '$rotsee_template'"
    run_test "dufour template has destinations section" "grep -q '\\[destinations\\.' '$dufour_template'"
    run_test "rotsee template has meta fields" "grep -q 'meta.*=' '$rotsee_template'"
    run_test "dufour template has meta fields" "grep -q 'meta.*=' '$dufour_template'"

    echo ""
}

# Test: Script syntax (bash -n)
test_script_syntax() {
    log_info "Testing script syntax..."

    run_test "build-pkg.sh syntax valid" "bash -n '$SCRIPT_DIR/build-pkg.sh'"
    run_test "sign-pkg.sh syntax valid" "bash -n '$SCRIPT_DIR/sign-pkg.sh'"
    run_test "uninstall.sh syntax valid" "bash -n '$SCRIPT_DIR/uninstall.sh'"
    run_test "preinstall syntax valid" "bash -n '$SCRIPT_DIR/resources/scripts/preinstall'"
    run_test "postinstall syntax valid" "bash -n '$SCRIPT_DIR/resources/scripts/postinstall'"

    echo ""
}

# Test: Distribution.xml is valid XML
test_distribution_xml() {
    log_info "Testing Distribution.xml..."

    if command -v xmllint &>/dev/null; then
        run_test "Distribution.xml is valid XML" "xmllint --noout '$SCRIPT_DIR/Distribution.xml' 2>/dev/null"
    else
        log_info "Skipping XML validation (xmllint not available)"
    fi

    run_test "Distribution.xml has title" "grep -q '<title>' '$SCRIPT_DIR/Distribution.xml'"
    run_test "Distribution.xml has organization" "grep -q '<organization>' '$SCRIPT_DIR/Distribution.xml'"
    run_test "Distribution.xml has pkg-ref" "grep -q '<pkg-ref' '$SCRIPT_DIR/Distribution.xml'"

    echo ""
}

# Test: HTML files are valid
test_html_files() {
    log_info "Testing HTML files..."

    run_test "welcome.html has DOCTYPE" "grep -q '<!DOCTYPE' '$SCRIPT_DIR/resources/welcome.html'"
    run_test "readme.html has DOCTYPE" "grep -q '<!DOCTYPE' '$SCRIPT_DIR/resources/readme.html'"
    run_test "conclusion.html has DOCTYPE" "grep -q '<!DOCTYPE' '$SCRIPT_DIR/resources/conclusion.html'"

    echo ""
}

# Test: Scripts have proper error handling
test_error_handling() {
    log_info "Testing error handling in scripts..."

    run_test "build-pkg.sh has set -euo pipefail" "grep -q 'set -euo pipefail' '$SCRIPT_DIR/build-pkg.sh'"
    run_test "preinstall has set -euo pipefail" "grep -q 'set -euo pipefail' '$SCRIPT_DIR/resources/scripts/preinstall'"
    run_test "postinstall has set -euo pipefail" "grep -q 'set -euo pipefail' '$SCRIPT_DIR/resources/scripts/postinstall'"

    echo ""
}

# Test: Security features present
test_security_features() {
    log_info "Testing security features..."

    run_test "build-pkg.sh has checksum verification" "grep -q 'verify_checksum' '$SCRIPT_DIR/build-pkg.sh'"
    run_test "build-pkg.sh has GPG verification" "grep -q 'verify_gpg_signature' '$SCRIPT_DIR/build-pkg.sh'"
    run_test "build-pkg.sh uses mktemp" "grep -q 'mktemp' '$SCRIPT_DIR/build-pkg.sh'"
    run_test "postinstall validates network input" "grep -q 'rotsee|dufour' '$SCRIPT_DIR/resources/scripts/postinstall'"

    echo ""
}

# Test: Required tools check
test_required_tools() {
    log_info "Testing for required tools..."

    run_test "pkgbuild available" "command -v pkgbuild &>/dev/null"
    run_test "productbuild available" "command -v productbuild &>/dev/null"
    run_test "curl available" "command -v curl &>/dev/null"
    run_test "lipo available" "command -v lipo &>/dev/null"

    echo ""
}

# Print test summary
print_summary() {
    echo "=========================================="
    echo "  Test Summary"
    echo "=========================================="
    echo "Total tests:  $TESTS_RUN"
    echo "Passed:       $TESTS_PASSED"
    echo "Failed:       $TESTS_FAILED"
    echo ""

    if [[ $TESTS_FAILED -eq 0 ]]; then
        log_success "All tests passed!"
        echo "=========================================="
        return 0
    else
        log_error "$TESTS_FAILED test(s) failed"
        echo "=========================================="
        return 1
    fi
}

# Main test execution
main() {
    print_banner

    test_required_files
    test_script_permissions
    test_resource_files
    test_installation_scripts
    test_config_templates
    test_plist_configuration
    test_system_user_functions
    test_template_syntax
    test_script_syntax
    test_distribution_xml
    test_html_files
    test_error_handling
    test_security_features
    test_required_tools

    print_summary
}

# Run tests
main

exit $?
