#[cfg(target_os = "macos")]
#[macro_use]
extern crate objc;

use tauri::Manager;
use tauri::tray::TrayIconBuilder;
use tokio::sync::Notify;
use tokio::sync::watch;
use tokio_util::sync::CancellationToken;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

mod commands;
mod icons;
mod logging;
mod platform;
pub mod settings;
mod theme;
pub mod tray;
pub mod types;
pub mod update_install;

use commands::{
    check_update, connect, disconnect, export_logs, get_cached_state, get_platform,
    log_from_frontend, run_initialization_loop, set_app_icon, stop_client,
};
use gnosis_vpn_lib::command::InfoResponse;
use gnosis_vpn_lib::{command, socket::root as root_socket};
use icons::{IconState, TrayIconState, determine_tray_icon, start_icon_heartbeat};
use platform::{Platform, PlatformInterface};
use settings::{SettingsStore, get_settings, update_settings};
#[cfg(target_os = "linux")]
use theme::spawn_linux_theme_monitor;
#[cfg_attr(target_os = "macos", allow(unused_imports))]
use theme::{InitialTheme, get_initial_theme, system_theme};
use tray::{
    create_tray_menu, handle_tray_event, show_settings, show_settings_and_check,
    toggle_main_window_visibility,
};
use types::ConnectionState;
use types::{BalanceResponse, StatusResponse};
use update_install::{UpdateInstallState, get_install_status, get_toolkit_version, install_update};

struct HeartbeatHandle(Mutex<Option<tauri::async_runtime::JoinHandle<()>>>);

pub enum PollingExit {
    Cancelled,
    NeedsReinit,
}

pub struct StatusPollingHandle {
    pub cancel: CancellationToken,
    pub handle: Option<tauri::async_runtime::JoinHandle<PollingExit>>,
    pub trigger: Arc<Notify>,
}

pub struct BalancePollingHandle {
    pub cancel: CancellationToken,
    pub handle: Option<tauri::async_runtime::JoinHandle<()>>,
}

pub struct AppStateCache {
    pub status: watch::Sender<Option<Result<Option<StatusResponse>, String>>>,
    pub balance: watch::Sender<Option<Result<Option<BalanceResponse>, String>>>,
    pub service_info: watch::Sender<Option<InfoResponse>>,
}

#[cfg(target_os = "macos")]
fn install_macos_about_panel_override(
    app: &tauri::AppHandle,
    package_version: String,
    icon_path: Option<String>,
) {
    use cocoa::base::{id, nil};
    use cocoa::foundation::NSString;
    use objc::declare::ClassDecl;
    use objc::runtime::{Class, Object, Sel};
    use std::sync::OnceLock;

    static PACKAGE_VERSION: OnceLock<String> = OnceLock::new();
    static ICON_PATH: OnceLock<Option<String>> = OnceLock::new();
    let _ = PACKAGE_VERSION.set(package_version);
    let _ = ICON_PATH.set(icon_path);

    // NSMenuItem stores its target as unsafe_unretained, so the handler must
    // outlive the menu item (i.e. live for the process). Park it in a static
    // OnceLock so it's a deliberate singleton instead of an orphaned pointer.
    struct HandlerPtr(id);
    unsafe impl Send for HandlerPtr {}
    unsafe impl Sync for HandlerPtr {}

    static HANDLER_CLASS: OnceLock<&'static Class> = OnceLock::new();
    static HANDLER: OnceLock<HandlerPtr> = OnceLock::new();
    let cls: &'static Class = HANDLER_CLASS.get_or_init(|| {
        let superclass = class!(NSObject);
        let mut decl = ClassDecl::new("GnosisVpnAboutHandler", superclass)
            .expect("failed to declare GnosisVpnAboutHandler");
        extern "C" fn show_about(_this: &Object, _cmd: Sel, _sender: id) {
            unsafe {
                let version_str = PACKAGE_VERSION.get().map(String::as_str).unwrap_or("");
                // NSString::alloc(...).init_str(...) returns a +1 retained object;
                // balance with autorelease so the AppKit run loop pool drains it.
                let ns_version: id = NSString::alloc(nil).init_str(version_str);
                let ns_version: id = msg_send![ns_version, autorelease];
                // "ApplicationVersion" maps to NSAboutPanelOptionApplicationVersion —
                // the main "Version X" line on the standard About panel (overrides
                // CFBundleShortVersionString). The "Version" key, by contrast,
                // controls the parenthesized build number.
                let ns_app_version_key: id = NSString::alloc(nil).init_str("ApplicationVersion");
                let ns_app_version_key: id = msg_send![ns_app_version_key, autorelease];

                // Build a mutable dictionary so we can also add the icon when available.
                let options: id = msg_send![class!(NSMutableDictionary), dictionary];
                let _: () = msg_send![options, setObject: ns_version forKey: ns_app_version_key];

                if let Some(Some(path)) = ICON_PATH.get() {
                    let ns_path: id = NSString::alloc(nil).init_str(path.as_str());
                    let ns_path: id = msg_send![ns_path, autorelease];
                    let image: id = msg_send![class!(NSImage), alloc];
                    let image: id = msg_send![image, initWithContentsOfFile: ns_path];
                    if image != nil {
                        let image: id = msg_send![image, autorelease];
                        let ns_icon_key: id = NSString::alloc(nil).init_str("ApplicationIcon");
                        let ns_icon_key: id = msg_send![ns_icon_key, autorelease];
                        let _: () = msg_send![options, setObject: image forKey: ns_icon_key];
                    }
                }

                let app: id = msg_send![class!(NSApplication), sharedApplication];
                let _: () = msg_send![app, orderFrontStandardAboutPanelWithOptions: options];
            }
        }
        unsafe {
            decl.add_method(
                sel!(showAbout:),
                show_about as extern "C" fn(&Object, Sel, id),
            );
        }
        decl.register()
    });

    let _ = app.run_on_main_thread(move || unsafe {
        let app_ns: id = msg_send![class!(NSApplication), sharedApplication];
        let main_menu: id = msg_send![app_ns, mainMenu];
        if main_menu == nil {
            return;
        }
        let count: i64 = msg_send![main_menu, numberOfItems];
        if count < 1 {
            return;
        }
        let app_menu_item: id = msg_send![main_menu, itemAtIndex: 0i64];
        if app_menu_item == nil {
            return;
        }
        let app_submenu: id = msg_send![app_menu_item, submenu];
        if app_submenu == nil {
            return;
        }
        let sub_count: i64 = msg_send![app_submenu, numberOfItems];
        if sub_count < 1 {
            return;
        }
        let about_item: id = msg_send![app_submenu, itemAtIndex: 0i64];
        if about_item == nil {
            return;
        }

        let handler: id = HANDLER.get_or_init(|| HandlerPtr(msg_send![cls, new])).0;
        let _: () = msg_send![about_item, setTarget: handler];
        let _: () = msg_send![about_item, setAction: sel!(showAbout:)];
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Fix for the random Ubuntu black screen issuse
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // A second instance was launched — bring the existing window to focus
            tracing::info!("second instance launched, focusing existing window");
            #[cfg(target_os = "macos")]
            {
                let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Logging first so everything below is captured; failure must not block startup.
            match app.path().app_log_dir() {
                Ok(dir) => match logging::init(&dir) {
                    Ok(filter) => {
                        let pkg = app.package_info();
                        tracing::info!(
                            name = %pkg.name,
                            version = %pkg.version,
                            os = std::env::consts::OS,
                            arch = std::env::consts::ARCH,
                            args = ?std::env::args().collect::<Vec<_>>(),
                            log_filter = %filter,
                            log_dir = %dir.display(),
                            "starting",
                        );
                    }
                    Err(e) => eprintln!("failed to initialize file logging: {e}"),
                },
                Err(e) => eprintln!("failed to resolve app log dir: {e}"),
            }

            // Load settings (settings.json) before any UI decisions
            let settings_path = app
                .path()
                .app_data_dir()
                .inspect_err(|e| tracing::error!(error = %e, "cannot resolve app data dir"))?
                .join("settings.json");
            let settings_store = SettingsStore::load(settings_path.clone());
            tracing::info!(target: "settings", path = %settings_path.display(), settings = ?settings_store.current(), "loaded");
            app.manage(settings_store);

            // First step: OS theme for app windows (all OS) and tray icons (non-macOS only)
            let theme = system_theme();
            tracing::info!(target: "theme", theme = ?theme, "initial os theme");
            app.manage(InitialTheme(theme));

            // Create tray menu
            let menu = create_tray_menu(app.handle())
                .inspect_err(|e| tracing::error!(error = %e, "cannot create tray menu"))?;

            let resource_dir = app
                .path()
                .resource_dir()
                .inspect_err(|e| tracing::error!(error = %e, "cannot resolve resource dir"))?;
            let icon_cache = icons::IconCache::load(&resource_dir)
                .inspect_err(|e| tracing::error!(error = %e, "cannot load icon cache"))?;

            let icon_name: &str = determine_tray_icon(
                &ConnectionState::Disconnected,
                icons::FundsLevel::Sufficient,
            );

            let icon = icon_cache.tray_image(icon_name).ok_or_else(|| {
                tracing::error!(icon_name, "missing tray icon");
                format!("Missing tray icon: {icon_name}")
            })?;

            app.manage(icon_cache);

            // Create tray icon
            let builder = TrayIconBuilder::with_id("menu_extra")
                .menu(&menu)
                .icon(icon)
                .icon_as_template(true);
            let tray = builder
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        tracing::info!(target: "tray", "quit requested, disconnecting");
                        let app_clone = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let socket = PathBuf::from(root_socket::DEFAULT_PATH);
                            if let Err(e) =
                                root_socket::process_cmd(&socket, &command::Command::Disconnect)
                                    .await
                            {
                                tracing::warn!(target: "tray", error = %e, "disconnect on quit failed");
                            }
                            app_clone.exit(0);
                        });
                    }
                    "show" => {
                        tracing::info!(target: "tray", "toggle main window");
                        toggle_main_window_visibility(app);
                    }
                    "settings" => {
                        tracing::info!(target: "tray", "settings requested");
                        show_settings(app, "settings");
                    }
                    "usage" => {
                        tracing::info!(target: "tray", "usage requested");
                        show_settings(app, "usage");
                    }
                    "check_update" => {
                        tracing::info!(target: "tray", "update check requested");
                        show_settings_and_check(app);
                    }
                    other => tracing::warn!(target: "tray", id = other, "unknown tray menu item"),
                })
                .on_tray_icon_event(|tray, event| {
                    handle_tray_event(tray.app_handle(), event);
                })
                .show_menu_on_left_click(false)
                .build(app)
                .inspect_err(|e| tracing::error!(error = %e, "cannot create tray icon"))?;

            app.manage(TrayIconState {
                tray: Mutex::new(tray),
                current_icon: Mutex::new(icon_name.to_string()),
            });

            let icon_state = Arc::new(Mutex::new(IconState {
                is_animating: false,
                current_icon: icons::APP_ICON_DISCONNECTED.to_string(),
                funds_level: icons::FundsLevel::Sufficient,
            }));
            app.manage(icon_state.clone());

            let heartbeat_handle = start_icon_heartbeat(app.handle().clone(), icon_state);
            app.manage(HeartbeatHandle(Mutex::new(Some(heartbeat_handle))));

            #[cfg(target_os = "linux")]
            spawn_linux_theme_monitor(app.handle().clone());

            // Setup platform-specific functionality
            if let Err(e) = Platform::setup_system_tray() {
                tracing::warn!(error = %e, "platform tray setup unavailable");
            }

            // Prevent macOS App Nap from throttling the process when backgrounded.
            // The token must stay alive for the process lifetime; Tauri's managed
            // state keeps it until the application exits.
            #[cfg(target_os = "macos")]
            app.manage(platform::macos::disable_app_nap());

            // macOS About menu: replace the default "About" (which shows the app
            // bundle version) with one that shows the gnosis-vpn package version.
            #[cfg(target_os = "macos")]
            {
                let app_handle = app.handle().clone();
                let icon_path: Option<String> = app
                    .path()
                    .resource_dir()
                    .ok()
                    .map(|d| {
                        d.join("icons")
                            .join("app-icons")
                            .join(icons::APP_ICON_DISCONNECTED)
                    })
                    .and_then(|p| p.to_str().map(String::from));
                tauri::async_runtime::spawn(async move {
                    let socket = PathBuf::from(root_socket::DEFAULT_PATH);
                    let fallback = "Version: Something is wrong".to_string();
                    let pkg: String = match root_socket::process_cmd(
                        &socket,
                        &command::Command::Info,
                    )
                    .await
                    {
                        Ok(command::Response::Info(info)) => {
                            // debug: the init loop's "initialized" line already records versions
                            tracing::debug!(
                                target: "about_panel",
                                package_version = ?info.package_version,
                                "daemon info"
                            );
                            info.package_version.unwrap_or_else(|| fallback.clone())
                        }
                        Ok(other) => {
                            tracing::warn!(
                                target: "about_panel",
                                response = ?other,
                                "unexpected daemon response"
                            );
                            fallback.clone()
                        }
                        Err(e) => {
                            tracing::warn!(target: "about_panel", error = %e, "daemon call failed");
                            fallback.clone()
                        }
                    };
                    install_macos_about_panel_override(&app_handle, pkg, icon_path);
                });
            }

            // Intercept window close to hide to tray instead of exiting
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                let app_handle = app.handle().clone();
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        tracing::info!(target: "window", "main window close requested, hiding to tray");
                        api.prevent_close();
                        let _ = window_clone.hide();
                        #[cfg(target_os = "macos")]
                        {
                            let _ = app_handle
                                .set_activation_policy(tauri::ActivationPolicy::Accessory);
                        }
                    }
                });
            }

            // Intercept settings window close to hide instead of destroying the window
            if let Some(settings_window) = app.get_webview_window("settings") {
                let settings_clone = settings_window.clone();
                settings_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        tracing::info!(target: "window", "settings window close requested, hiding");
                        api.prevent_close();
                        let _ = settings_clone.hide();
                    }
                });
            }

            // Decide initial window visibility based on settings
            if let Some(window) = app.get_webview_window("main") {
                let start_minimized = app.state::<SettingsStore>().current().start_minimized;
                tracing::info!(target: "window", start_minimized, "initial window visibility");
                #[cfg(target_os = "macos")]
                {
                    let policy = if start_minimized {
                        tauri::ActivationPolicy::Accessory
                    } else {
                        tauri::ActivationPolicy::Regular
                    };
                    app.set_activation_policy(policy);
                }

                if !start_minimized {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }

            // status polling handle (cancellation token + join handle + trigger)
            app.manage(Mutex::new(StatusPollingHandle {
                cancel: CancellationToken::new(),
                handle: None,
                trigger: Arc::new(Notify::new()),
            }));

            // balance polling handle — started alongside status polling
            app.manage(Mutex::new(BalancePollingHandle {
                cancel: CancellationToken::new(),
                handle: None,
            }));

            // last update-install status: re-hydration + concurrent-install guard
            app.manage(UpdateInstallState::default());

            let (status_tx, _) = watch::channel(None);
            let (balance_tx, _) = watch::channel(None);
            let (service_info_tx, _) = watch::channel(None);
            app.manage(AppStateCache {
                status: status_tx,
                balance: balance_tx,
                service_info: service_info_tx,
            });

            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                run_initialization_loop(app_handle).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            connect,
            disconnect,
            export_logs,
            log_from_frontend,
            set_app_icon,
            get_initial_theme,
            check_update,
            get_cached_state,
            get_settings,
            update_settings,
            get_platform,
            install_update,
            get_install_status,
            get_toolkit_version
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                tracing::info!("shutting down");
                // cancel query status loop and wait for it to finish

                let state = app_handle.state::<Mutex<StatusPollingHandle>>();
                let handle_opt = match state.lock() {
                    Ok(mut guard) => {
                        guard.cancel.cancel();
                        guard.handle.take()
                    }
                    Err(e) => {
                        tracing::warn!(error = %e, "status polling lock poisoned at exit");
                        None
                    }
                };
                if let Some(handle) = handle_opt {
                    let _ = tauri::async_runtime::block_on(handle);
                }

                let bal_state = app_handle.state::<Mutex<BalancePollingHandle>>();
                let bal_handle_opt = match bal_state.lock() {
                    Ok(mut guard) => {
                        guard.cancel.cancel();
                        guard.handle.take()
                    }
                    Err(e) => {
                        tracing::warn!(error = %e, "balance polling lock poisoned at exit");
                        None
                    }
                };
                if let Some(handle) = bal_handle_opt {
                    let _ = tauri::async_runtime::block_on(handle);
                }

                match app_handle.state::<HeartbeatHandle>().0.lock() {
                    Ok(mut guard) => {
                        if let Some(handle) = guard.take() {
                            handle.abort();
                        }
                    }
                    Err(e) => tracing::warn!(error = %e, "heartbeat lock poisoned at exit"),
                }

                // inform the client about the shutdown
                if let Err(reason) = tauri::async_runtime::block_on(async { stop_client().await }) {
                    tracing::warn!(error = %reason, "error stopping client on exit");
                }
                tracing::info!("exit complete");
            }
        });
}
