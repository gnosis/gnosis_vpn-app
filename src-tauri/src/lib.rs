#[cfg(target_os = "macos")]
#[macro_use]
extern crate objc;

use serde::Serialize;
use tauri::Manager;
use tauri::tray::TrayIconBuilder;
use tauri_plugin_store::StoreExt;
use tokio::sync::Notify;
use tokio::sync::watch;
use tokio_util::sync::CancellationToken;

use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

mod commands;
mod icons;
mod platform;
mod theme;
pub mod tray;
pub mod types;

use commands::{
    check_update, compress_logs, connect, disconnect, get_cached_state, run_initialization_loop,
    set_app_icon, stop_client,
};
use gnosis_vpn_lib::command::InfoResponse;
use gnosis_vpn_lib::{command, socket::root as root_socket};
use icons::{AppIconState, TrayIconState, determine_tray_icon, start_app_icon_heartbeat};
use platform::{Platform, PlatformInterface};
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

struct HeartbeatHandle(Mutex<Option<tauri::async_runtime::JoinHandle<()>>>);

pub struct StatusPollingHandle {
    pub cancel: CancellationToken,
    pub handle: Option<tauri::async_runtime::JoinHandle<()>>,
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

#[derive(Clone, Serialize, Default)]
struct AppSettings {
    preferred_location: Option<String>,
    connect_on_startup: bool,
    start_minimized: bool,
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
            #[cfg(target_os = "macos")]
            {
                let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Load settings from the shared store (settings.json) before any UI decisions
            let mut loaded: AppSettings = AppSettings::default();
            if let Ok(store) = app.store("settings.json") {
                if let Some(v) = store.get("preferredLocation") {
                    loaded.preferred_location = v.as_str().map(String::from);
                }
                if let Some(v) = store.get("connectOnStartup") {
                    loaded.connect_on_startup = v.as_bool().unwrap_or(false);
                }
                if let Some(v) = store.get("startMinimized") {
                    loaded.start_minimized = v.as_bool().unwrap_or(false);
                }
            }

            // Make settings available as managed state
            app.manage(Mutex::new(loaded.clone()));

            // First step: OS theme for app windows (all OS) and tray icons (non-macOS only)
            let theme = system_theme();
            app.manage(InitialTheme(theme));

            // Create tray menu
            let menu = create_tray_menu(app.handle())?;

            let icon_name: &str = determine_tray_icon(&ConnectionState::Disconnected);

            let tray_icon_path: PathBuf = app
                .path()
                .resource_dir()
                .unwrap()
                .join("icons")
                .join(icon_name);

            let icon = tauri::image::Image::from_path(&tray_icon_path)
                .map_err(|e| format!("Failed to load tray icon: {e}"))?;

            // Create tray icon
            let builder = TrayIconBuilder::with_id("menu_extra")
                .menu(&menu)
                .icon(icon)
                .icon_as_template(true);
            let tray = builder
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        let app_clone = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let socket = PathBuf::from(root_socket::DEFAULT_PATH);
                            let _ = root_socket::process_cmd(&socket, &command::Command::Disconnect).await;
                            app_clone.exit(0);
                        });
                    }
                    "show" => {
                        toggle_main_window_visibility(app);
                    }
                    "settings" => show_settings(app, "settings"),
                    "logs" => show_settings(app, "logs"),
                    "usage" => show_settings(app, "usage"),
                    "check_update" => show_settings_and_check(app),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    handle_tray_event(tray.app_handle(), event);
                })
                .show_menu_on_left_click(false)
                .build(app)?;

            app.manage(TrayIconState {
                tray: Mutex::new(tray),
                current_icon: Mutex::new(icon_name.to_string()),
            });

            let app_icon_state = Arc::new(AppIconState {
                animation_toggle: AtomicBool::new(false),
                is_animating: AtomicBool::new(false),
                current_icon: Mutex::new(icons::APP_ICON_DISCONNECTED.to_string()),
            });
            app.manage(app_icon_state.clone());

            let heartbeat_handle = start_app_icon_heartbeat(app.handle().clone(), app_icon_state);
            app.manage(HeartbeatHandle(Mutex::new(Some(heartbeat_handle))));

            #[cfg(target_os = "linux")]
            spawn_linux_theme_monitor(app.handle().clone());

            // Setup platform-specific functionality
            let _ = Platform::setup_system_tray();

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
                    let pkg: String =
                        match root_socket::process_cmd(&socket, &command::Command::Info).await {
                            Ok(command::Response::Info(info)) => {
                                eprintln!(
                                    "[about-panel] daemon Info.package_version = {:?}",
                                    info.package_version
                                );
                                println!(
                                    "[about-panel] daemon Info: {:?}",
                                    info.package_version.as_deref().unwrap_or("<none>")
                                );
                                info.package_version.unwrap_or_else(|| fallback.clone())
                            }
                            Ok(other) => {
                                eprintln!("[about-panel] unexpected daemon response: {:?}", other);
                                fallback.clone()
                            }
                            Err(e) => {
                                eprintln!("[about-panel] daemon call failed: {:?}", e);
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
                        api.prevent_close();
                        let _ = settings_clone.hide();
                    }
                });
            }

            // Decide initial window visibility based on settings
            if let Some(window) = app.get_webview_window("main") {
                let settings = app.state::<Mutex<AppSettings>>();
                let start_minimized = settings.lock().map(|s| s.start_minimized).unwrap_or(false);
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
            compress_logs,
            set_app_icon,
            get_initial_theme,
            check_update,
            get_cached_state
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                // cancel query status loop and wait for it to finish

                let state = app_handle.state::<Mutex<StatusPollingHandle>>();
                let handle_opt = if let Ok(mut guard) = state.lock() {
                    guard.cancel.cancel();
                    guard.handle.take()
                } else {
                    None
                };
                if let Some(handle) = handle_opt {
                    let _ = tauri::async_runtime::block_on(handle);
                }

                let bal_state = app_handle.state::<Mutex<BalancePollingHandle>>();
                let bal_handle_opt = if let Ok(mut guard) = bal_state.lock() {
                    guard.cancel.cancel();
                    guard.handle.take()
                } else {
                    None
                };
                if let Some(handle) = bal_handle_opt {
                    let _ = tauri::async_runtime::block_on(handle);
                }

                if let Ok(mut guard) = app_handle.state::<HeartbeatHandle>().0.lock() {
                    if let Some(handle) = guard.take() {
                        handle.abort();
                    }
                }

                // inform the client about the shutdown
                if let Err(reason) = tauri::async_runtime::block_on(async { stop_client().await }) {
                    eprintln!("Error stopping client on exit: {reason}");
                }
            }
        });
}
