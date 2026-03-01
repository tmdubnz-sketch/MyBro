#[cfg(desktop)]
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        );

    // Desktop-only plugins (not supported on mobile targets).
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init());

    builder
        .setup(|_app| {
            println!("My Bro starting...");

            #[cfg(desktop)]
            {
                if let Some(window) = _app.get_webview_window("main") {
                    println!("Window created - Tauri will load frontend from dist folder");
                    let _ = window.set_focus();
                } else {
                    println!("ERROR: Could not get main window");
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
