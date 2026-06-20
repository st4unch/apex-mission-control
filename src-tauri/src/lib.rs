// Apex Mission Control — Tauri backend entry point.
mod agents;
mod fs;
mod history;
mod metrics;
mod pm;
mod pty;
#[cfg(test)]
mod testutil;
mod watcher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(pty::PtyManager::default())
        .manage(metrics::Metrics::default())
        .manage(watcher::WatchState::default())
        .invoke_handler(tauri::generate_handler![
            agents::list_agent_sessions,
            agents::stop_agent,
            agents::kill_session,
            history::list_session_history,
            fs::list_dir,
            fs::read_file,
            fs::write_file,
            fs::read_head_file,
            fs::create_worktree,
            fs::remove_worktree,
            fs::list_branches,
            pm::pm_status,
            pm::pm_check_merge,
            pm::pm_merge,
            pm::pm_push,
            pm::pm_collisions,
            metrics::app_metrics,
            watcher::start_watching,
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
