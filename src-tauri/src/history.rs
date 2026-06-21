//! Session history reader. Every past Claude Code session leaves a transcript at
//! `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`. This scans those files so
//! the Sessions page can show full history, not just what the live daemon retains.

use std::io::Read;
use std::path::Path;
use std::time::UNIX_EPOCH;

use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionHistoryEntry {
    pub session_id: String,
    /// Real working directory (read from the transcript), best-effort.
    pub cwd: String,
    /// Last activity, ms epoch (transcript file mtime).
    pub last_modified: i64,
    pub size_bytes: u64,
}

/// Pull `"cwd":"..."` from the first chunk of a JSONL transcript (cheap — no full parse).
fn cwd_from_transcript(path: &Path) -> Option<String> {
    let mut f = std::fs::File::open(path).ok()?;
    let mut buf = vec![0u8; 8192];
    let n = f.read(&mut buf).ok()?;
    let head = String::from_utf8_lossy(&buf[..n]);
    let key = "\"cwd\":\"";
    let start = head.find(key)? + key.len();
    let rest = &head[start..];
    let end = rest.find('"')?;
    Some(rest[..end].replace("\\/", "/"))
}

/// Enumerate all past sessions from `~/.claude/projects/*/*.jsonl`, newest first.
#[tauri::command(async)]
pub fn list_session_history() -> Result<Vec<SessionHistoryEntry>, String> {
    let home = std::env::var_os("HOME").ok_or("HOME not set")?;
    let projects = Path::new(&home).join(".claude/projects");
    if !projects.is_dir() {
        return Ok(vec![]);
    }
    let mut out = Vec::new();
    let project_dirs = std::fs::read_dir(&projects).map_err(|e| format!("read_dir: {e}"))?;
    for proj in project_dirs.filter_map(|r| r.ok()) {
        let pdir = proj.path();
        if !pdir.is_dir() {
            continue;
        }
        let files = match std::fs::read_dir(&pdir) {
            Ok(f) => f,
            Err(_) => continue,
        };
        for entry in files.filter_map(|r| r.ok()) {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }
            let session_id = path
                .file_stem()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_default();
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            let last_modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            let cwd = cwd_from_transcript(&path).unwrap_or_else(|| {
                // Fall back to the encoded directory name.
                pdir.file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default()
            });
            out.push(SessionHistoryEntry {
                session_id,
                cwd,
                last_modified,
                size_bytes: meta.len(),
            });
        }
    }
    out.sort_by(|a, b| b.last_modified.cmp(&a.last_modified));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "machine-specific: reads ~/.claude"]
    fn history_smoke() {
        let h = list_session_history().expect("ok");
        println!("history entries: {}", h.len());
        for e in h.iter().take(5) {
            println!(
                "  {} cwd={} size={}",
                &e.session_id[..e.session_id.len().min(8)],
                e.cwd,
                e.size_bytes
            );
        }
    }
}
