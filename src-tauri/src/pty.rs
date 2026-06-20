//! Real interactive terminals backed by a PTY (pseudo-terminal). Each spawn opens
//! a login shell via the `portable-pty` crate (wezterm). Output streams to the
//! frontend over a Tauri `Channel`; xterm.js renders it. Input flows back through
//! `pty_write`. This is the hand-rolled alternative to `tauri-plugin-pty` chosen
//! for dependency stability (PRD §15.5 D-pty).

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::ipc::Channel;
use tauri::State;

/// Events streamed from a PTY to the frontend.
#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PtyEvent {
    /// Raw output bytes (frontend wraps in Uint8Array → xterm.write, UTF-8 safe).
    Data { bytes: Vec<u8> },
    /// Process ended.
    Exit { code: Option<i64> },
}

struct PtyHandle {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

#[derive(Default)]
pub struct PtyManager {
    sessions: Mutex<HashMap<String, PtyHandle>>,
    counter: AtomicU64,
}

fn default_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
}

/// Spawn a login shell in a PTY. Returns the session id used by the other commands.
#[tauri::command]
pub fn pty_spawn(
    state: State<PtyManager>,
    on_event: Channel<PtyEvent>,
    cwd: Option<String>,
    shell: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<String, String> {
    let pty_system = native_pty_system();
    let size = PtySize {
        rows: rows.unwrap_or(24),
        cols: cols.unwrap_or(80),
        pixel_width: 0,
        pixel_height: 0,
    };
    let pair = pty_system
        .openpty(size)
        .map_err(|e| format!("openpty failed: {e}"))?;

    let shell = shell.unwrap_or_else(default_shell);
    let mut cmd = CommandBuilder::new(&shell);
    // Login shell so the user's full PATH (incl. ~/.local/bin) is available — `claude`
    // resolves inside the terminal. macOS GUI apps otherwise inherit a minimal PATH.
    cmd.arg("-l");
    cmd.env("TERM", "xterm-256color");
    // The control plane may itself be launched from inside a Claude Code session
    // (notably during dev), which leaks CLAUDE* env vars. Those mark the new process
    // as a *child* session and disable session persistence — so a `claude` started in
    // this terminal can't be backgrounded ("nothing to resume"). Strip them so every
    // spawned shell/`claude` runs as a clean, persistable, top-level session.
    for (k, _) in std::env::vars() {
        if k.starts_with("CLAUDE") || k == "AI_AGENT" {
            cmd.env_remove(&k);
        }
    }
    if let Some(dir) = cwd.as_deref().filter(|d| !d.is_empty()) {
        cmd.cwd(dir);
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("spawn failed: {e}"))?;
    // Drop the slave so the master gets EOF when the child exits.
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("clone reader failed: {e}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("take writer failed: {e}"))?;

    let id = format!("pty-{}", state.counter.fetch_add(1, Ordering::Relaxed));

    // Reader thread: stream output until EOF, then signal exit.
    let ch = on_event.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    if ch
                        .send(PtyEvent::Data {
                            bytes: buf[..n].to_vec(),
                        })
                        .is_err()
                    {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        let _ = ch.send(PtyEvent::Exit { code: None });
    });

    state.sessions.lock().unwrap().insert(
        id.clone(),
        PtyHandle {
            writer,
            master: pair.master,
            child,
        },
    );
    Ok(id)
}

/// Write user input (keystrokes) to a PTY.
#[tauri::command]
pub fn pty_write(state: State<PtyManager>, id: String, data: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    let h = sessions
        .get_mut(&id)
        .ok_or_else(|| format!("no pty {id}"))?;
    h.writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("write failed: {e}"))?;
    h.writer.flush().map_err(|e| format!("flush failed: {e}"))
}

/// Resize a PTY when the xterm viewport changes.
#[tauri::command]
pub fn pty_resize(
    state: State<PtyManager>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    let h = sessions.get(&id).ok_or_else(|| format!("no pty {id}"))?;
    h.master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("resize failed: {e}"))
}

/// Kill a PTY's child process and forget the session.
#[tauri::command]
pub fn pty_kill(state: State<PtyManager>, id: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(mut h) = sessions.remove(&id) {
        let _ = h.child.kill();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Proves the PTY layer works on this machine end to end (without the Tauri
    /// Channel): open a pty, run a command, read its output back.
    #[test]
    fn pty_echo_roundtrip() {
        let sys = native_pty_system();
        let pair = sys
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .expect("openpty");
        let mut cmd = CommandBuilder::new(default_shell());
        cmd.arg("-lc");
        cmd.arg("echo apex-pty-ok");
        let mut reader = pair.master.try_clone_reader().expect("reader");
        let mut child = pair.slave.spawn_command(cmd).expect("spawn");
        drop(pair.slave);
        // Read while the process runs (blocking reads): collect until we see the
        // marker or hit EOF. Reading only after wait() can miss the buffered output.
        let mut out = Vec::new();
        let mut buf = [0u8; 1024];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    out.extend_from_slice(&buf[..n]);
                    if String::from_utf8_lossy(&out).contains("apex-pty-ok") {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        let _ = child.wait();
        let s = String::from_utf8_lossy(&out);
        println!("pty output: {s:?}");
        assert!(
            s.contains("apex-pty-ok"),
            "expected echo output, got: {s:?}"
        );
    }

    /// Proves the CLAUDE* env strip works: a shell spawned with the strip sees an
    /// empty $CLAUDECODE even though the parent process has it set.
    #[test]
    fn pty_strips_claude_env() {
        std::env::set_var("CLAUDECODE", "1");
        let sys = native_pty_system();
        let pair = sys
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .expect("openpty");
        let mut cmd = CommandBuilder::new(default_shell());
        cmd.arg("-lc");
        cmd.arg("printf 'CC=[%s]\\n' \"$CLAUDECODE\"");
        for (k, _) in std::env::vars() {
            if k.starts_with("CLAUDE") || k == "AI_AGENT" {
                cmd.env_remove(&k);
            }
        }
        let mut reader = pair.master.try_clone_reader().expect("reader");
        let mut child = pair.slave.spawn_command(cmd).expect("spawn");
        drop(pair.slave);
        let mut out = Vec::new();
        let mut buf = [0u8; 1024];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    out.extend_from_slice(&buf[..n]);
                    if String::from_utf8_lossy(&out).contains("CC=[") {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        let _ = child.wait();
        let s = String::from_utf8_lossy(&out);
        println!("env output: {s:?}");
        assert!(
            s.contains("CC=[]"),
            "CLAUDECODE should be stripped, got: {s:?}"
        );
    }
}
