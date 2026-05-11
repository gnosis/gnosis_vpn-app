// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Force XWayland on Linux: native Wayland breaks the WM frame's input
    // region after a hide()->show() cycle, making the titlebar buttons
    // permanently unresponsive after the tray "Show" action.
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("GDK_BACKEND").is_none() {
            std::env::set_var("GDK_BACKEND", "x11");
        }
    }

    gnosis_vpn_app_lib::run()
}
