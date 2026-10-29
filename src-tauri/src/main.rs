// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    {
        if std::env::args().nth(1).as_deref() == Some(gnosis_vpn_app_lib::render::PROBE_ARG) {
            std::process::exit(gnosis_vpn_app_lib::render::run_probe());
        }
        // Native Wayland breaks the WM frame's input region after a hide()->show()
        if std::env::var_os("GDK_BACKEND").is_none() {
            std::env::set_var("GDK_BACKEND", "x11");
        }
        // Compositing through a CPU rasterizer costs twice what plain software painting does
        if gnosis_vpn_app_lib::render::init().software_rendering
            && std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none()
        {
            std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        }
        // SHM frame hand-off avoids DMA-BUF black windows (GNO-421) but keeps GPU compositing
        if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none()
            && std::env::var_os("WEBKIT_DMABUF_RENDERER_FORCE_SHM").is_none()
        {
            std::env::set_var("WEBKIT_DMABUF_RENDERER_FORCE_SHM", "1");
        }
    }

    gnosis_vpn_app_lib::run()
}
