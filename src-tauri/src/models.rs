use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelEntry {
    pub id: &'static str,
    pub name: &'static str,
    pub url: &'static str,
    pub filename: &'static str,
    pub size_bytes: u64,
}

#[derive(Clone, Serialize)]
pub struct DownloadProgress {
    pub model_id: String,
    pub model_name: String,
    pub downloaded: u64,
    pub total: u64,
    pub percent: f32,
    pub status: String,
}

#[derive(Clone, Serialize)]
pub struct ModelsReady {
    pub success: bool,
    pub message: String,
}

pub const REQUIRED_MODELS: &[ModelEntry] = &[
    ModelEntry {
        id: "whisper-tiny",
        name: "Voice Recognition (Whisper Tiny)",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
        filename: "ggml-tiny.bin",
        size_bytes: 77_704_680,
    },
];

pub fn models_dir(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .expect("failed to get app data dir")
        .join("models");
    std::fs::create_dir_all(&dir).ok();
    dir
}

pub fn missing_models(app: &AppHandle) -> Vec<&'static ModelEntry> {
    let dir = models_dir(app);
    REQUIRED_MODELS
        .iter()
        .filter(|m| !dir.join(m.filename).exists())
        .collect()
}

pub async fn download_missing_models(app: AppHandle) -> Result<(), String> {
    let missing = missing_models(&app);

    if missing.is_empty() {
        app.emit("models-ready", ModelsReady {
            success: true,
            message: "All models already downloaded.".into(),
        }).ok();
        return Ok(());
    }

    let dir = models_dir(&app);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| e.to_string())?;

    for model in missing {
        app.emit("download-progress", DownloadProgress {
            model_id: model.id.into(),
            model_name: model.name.into(),
            downloaded: 0,
            total: model.size_bytes,
            percent: 0.0,
            status: "downloading".into(),
        }).ok();

        let dest = dir.join(model.filename);
        let tmp = dir.join(format!("{}.tmp", model.filename));

        let mut response = client
            .get(model.url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch {}: {}", model.name, e))?;

        let total = response
            .content_length()
            .unwrap_or(model.size_bytes);

        let mut file = tokio::fs::File::create(&tmp)
            .await
            .map_err(|e| e.to_string())?;

        let mut downloaded: u64 = 0;
        let mut last_emit: u64 = 0;

        while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
            file.write_all(&chunk).await.map_err(|e| e.to_string())?;
            downloaded += chunk.len() as u64;

            if downloaded - last_emit > 1_000_000 || downloaded == total {
                last_emit = downloaded;
                let percent = (downloaded as f32 / total as f32) * 100.0;
                app.emit("download-progress", DownloadProgress {
                    model_id: model.id.into(),
                    model_name: model.name.into(),
                    downloaded,
                    total,
                    percent,
                    status: "downloading".into(),
                }).ok();
            }
        }

        file.flush().await.map_err(|e| e.to_string())?;
        drop(file);
        tokio::fs::rename(&tmp, &dest)
            .await
            .map_err(|e| e.to_string())?;

        app.emit("download-progress", DownloadProgress {
            model_id: model.id.into(),
            model_name: model.name.into(),
            downloaded: total,
            total,
            percent: 100.0,
            status: "complete".into(),
        }).ok();
    }

    app.emit("models-ready", ModelsReady {
        success: true,
        message: "All models ready.".into(),
    }).ok();

    Ok(())
}
