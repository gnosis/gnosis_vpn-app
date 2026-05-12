// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    {
        // Native Wayland breaks the WM frame's input region after a hide()->show()
        // cycle, making titlebar buttons unresponsive after the tray "Show" action.
        // Prefer XWayland and let GDK fall back to native Wayland when X is
        // unavailable. Note: if x11 init fails partway (rather than being
        // cleanly absent) GDK may print a confusing error before the wayland
        // fallback kicks in. Users can override via GDK_BACKEND.
        if std::env::var_os("GDK_BACKEND").is_none() {
            std::env::set_var("GDK_BACKEND", "x11");
        }
    }

    gnosis_vpn_app_lib::run()
}
