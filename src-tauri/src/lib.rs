mod models;

use models::{missing_models, download_missing_models};
use tauri::Manager;

#[tauri::command]
fn check_models(app: tauri::AppHandle) -> Vec<String> {
    missing_models(&app)
        .iter()
        .map(|m| m.id.to_string())
        .collect()
}

#[tauri::command]
async fn start_model_downloads(app: tauri::AppHandle) -> Result<(), String> {
    download_missing_models(app).await
}

#[tauri::command]
fn get_model_path(app: tauri::AppHandle, filename: String) -> Option<String> {
    let path = models::models_dir(&app).join(&filename);
    if path.exists() {
        path.to_str().map(|s| s.to_string())
    } else {
        None
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            check_models,
            start_model_downloads,
            get_model_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
