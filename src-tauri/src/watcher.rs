//! Real-time filesystem watching for tracked projects/worktrees. Emits a debounced
//! `fs-changed` Tauri event so the frontend can refresh PM status / branches / the
//! file tree immediately instead of waiting for the next poll.

use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, State};

pub struct WatchState(pub Mutex<Option<RecommendedWatcher>>);

impl Default for WatchState {
    fn default() -> Self {
        WatchState(Mutex::new(None))
    }
}

fn noisy(ev: &Event) -> bool {
    ev.paths.iter().any(|p| {
        let s = p.to_string_lossy();
        s.contains("/node_modules/") || s.contains("/.git/") || s.contains("/target/")
    })
}

/// (Re)start watching the given paths recursively. Replaces any previous watcher.
#[tauri::command]
pub fn start_watching(
    app: AppHandle,
    state: State<WatchState>,
    paths: Vec<String>,
) -> Result<(), String> {
    let last = Arc::new(Mutex::new(Instant::now() - Duration::from_secs(1)));
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        let Ok(ev) = res else { return };
        if noisy(&ev) {
            return;
        }
        // Debounce: at most one event every 1.5s. The frontend reacts to `fs-changed`
        // by re-running git-backed polls (branch topology, collisions) across every
        // tracked worktree, so a tight debounce would spawn a git storm while agents
        // edit files. 1.5s keeps the UI responsive without freezing the machine.
        let mut l = last.lock().unwrap();
        if l.elapsed() < Duration::from_millis(1500) {
            return;
        }
        *l = Instant::now();
        let _ = app.emit("fs-changed", ());
    })
    .map_err(|e| e.to_string())?;

    for p in &paths {
        let path = Path::new(p);
        if path.exists() {
            let _ = watcher.watch(path, RecursiveMode::Recursive);
        }
    }
    *state.0.lock().unwrap() = Some(watcher);
    Ok(())
}
