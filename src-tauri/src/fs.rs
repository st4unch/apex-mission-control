//! Scoped filesystem reads for the workspace file tree. Custom commands over
//! `std::fs` (not the fs plugin) so we own the security check: directory listing is
//! only ever lazy and read-only. The frontend feeds these from user-picked workspace
//! roots.

use std::path::Path;
use std::process::Command;

use serde::Serialize;

/// A single directory entry for the file tree.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
}

/// List the immediate children of a directory. Directories first, then files, each
/// alphabetical. Hidden entries (dotfiles) and heavy build dirs are included but the
/// frontend may choose to fold them. Errors (missing dir, permission) return Err.
#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let p = Path::new(&path);
    if !p.is_dir() {
        return Err(format!("not a directory: {path}"));
    }
    let mut entries: Vec<DirEntry> = std::fs::read_dir(p)
        .map_err(|e| format!("read_dir failed: {e}"))?
        .filter_map(|res| res.ok())
        .map(|e| {
            let is_directory = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
            DirEntry {
                name: e.file_name().to_string_lossy().into_owned(),
                path: e.path().to_string_lossy().into_owned(),
                is_directory,
            }
        })
        .collect();
    entries.sort_by(|a, b| {
        b.is_directory
            .cmp(&a.is_directory)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

/// Read a UTF-8 text file for the editor. Rejects very large files to keep the
/// editor responsive.
#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    let meta = std::fs::metadata(p).map_err(|e| format!("stat failed: {e}"))?;
    if meta.len() > 5_000_000 {
        return Err("file too large (>5MB) to open in the editor".into());
    }
    std::fs::read_to_string(p).map_err(|e| format!("read failed: {e}"))
}

/// Write text back to a file (editor save).
#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(Path::new(&path), content).map_err(|e| format!("write failed: {e}"))
}

/// Read a file's committed (HEAD) version for diffing against the working tree.
/// Returns the HEAD content, or an empty string if the file is untracked/new (so the
/// diff shows it as fully added). Errors only if the path isn't inside a git repo.
#[tauri::command]
pub fn read_head_file(path: String) -> Result<String, String> {
    // Canonicalize so it matches git's (also-canonical) toplevel even when the path
    // contains symlinks (e.g. macOS /var → /private/var).
    let canon = Path::new(&path).canonicalize().ok();
    let p = canon.as_deref().unwrap_or_else(|| Path::new(&path));
    let dir = p.parent().ok_or("invalid path")?;
    let root_out = Command::new("git")
        .args(["-C"])
        .arg(dir)
        .args(["rev-parse", "--show-toplevel"])
        .output()
        .map_err(|e| format!("git not found: {e}"))?;
    if !root_out.status.success() {
        return Err("not inside a git repository".into());
    }
    let root = String::from_utf8_lossy(&root_out.stdout).trim().to_string();
    let rel = p
        .strip_prefix(&root)
        .map(|r| r.to_string_lossy().into_owned())
        .map_err(|_| "file outside repo root".to_string())?;
    let show = Command::new("git")
        .args(["-C", &root, "show", &format!("HEAD:{rel}")])
        .output()
        .map_err(|e| format!("git show failed: {e}"))?;
    if !show.status.success() {
        // Untracked / new file → no HEAD version; diff against empty.
        return Ok(String::new());
    }
    Ok(String::from_utf8_lossy(&show.stdout).into_owned())
}

/// Create an isolated git worktree for a new agent branch and copy gitignored env
/// files into it. Returns the worktree path. Requires `repo` to be inside a git repo.
#[tauri::command]
pub fn create_worktree(repo: String, branch: String) -> Result<String, String> {
    let branch = branch.trim();
    if branch.is_empty() {
        return Err("branch name required".into());
    }
    let root_out = Command::new("git")
        .args(["-C", &repo, "rev-parse", "--show-toplevel"])
        .output()
        .map_err(|e| format!("git not found: {e}"))?;
    if !root_out.status.success() {
        return Err("workspace is not a git repository".into());
    }
    let root = String::from_utf8_lossy(&root_out.stdout).trim().to_string();
    let root_path = Path::new(&root);
    let repo_name = root_path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "repo".into());
    let safe_branch = branch.replace('/', "-");
    let wt = root_path
        .parent()
        .ok_or("repo has no parent dir")?
        .join(format!("{repo_name}-worktrees"))
        .join(&safe_branch);
    let wt_str = wt.to_string_lossy().into_owned();

    // Try creating a new branch; if it already exists, attach to it without -b.
    let add = Command::new("git")
        .args(["-C", &root, "worktree", "add", "-b", branch, &wt_str])
        .output()
        .map_err(|e| format!("git worktree add failed: {e}"))?;
    if !add.status.success() {
        let retry = Command::new("git")
            .args(["-C", &root, "worktree", "add", &wt_str, branch])
            .output()
            .map_err(|e| format!("git worktree add failed: {e}"))?;
        if !retry.status.success() {
            return Err(format!(
                "git worktree add failed: {}",
                String::from_utf8_lossy(&add.stderr)
            ));
        }
    }

    // Copy gitignored env files the new worktree won't get from git.
    for f in [".env", ".env.local"] {
        let src = root_path.join(f);
        if src.exists() {
            let _ = std::fs::copy(&src, wt.join(f));
        }
    }
    Ok(wt_str)
}

/// A git branch mapped onto the frontend `GitBranchState` contract.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchState {
    pub name: String,
    /// PRD (main/release) | WIP (feature/fix) | OPEN (everything else)
    #[serde(rename = "type")]
    pub kind: String,
    pub last_commit: String,
    pub author: String,
    /// synced | ahead | diverged
    pub status: String,
    /// Branch this most likely forked from (closest divergence); None for the root.
    pub parent: Option<String>,
}

fn branch_kind(name: &str) -> &'static str {
    if name == "main" || name == "master" || name.starts_with("release/") {
        "PRD"
    } else if name.starts_with("feature/")
        || name.starts_with("fix/")
        || name.starts_with("bugfix/")
        || name.starts_with("hotfix/")
    {
        "WIP"
    } else {
        "OPEN"
    }
}

fn track_to_status(track: &str) -> &'static str {
    let ahead = track.contains("ahead");
    let behind = track.contains("behind");
    if ahead && behind {
        "diverged"
    } else if ahead {
        "ahead"
    } else {
        "synced"
    }
}

/// List local branches of a repo for the topology view. Returns empty if not a git
/// repo (UI just shows nothing rather than erroring).
#[tauri::command]
pub fn list_branches(repo: String) -> Result<Vec<GitBranchState>, String> {
    let fmt = "%(refname:short)\x1f%(upstream:track)\x1f%(authorname)\x1f%(subject)";
    let out = Command::new("git")
        .args(["-C", &repo, "for-each-ref", "--format", fmt, "refs/heads/"])
        .output()
        .map_err(|e| format!("git not found: {e}"))?;
    if !out.status.success() {
        return Ok(vec![]); // not a git repo
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let mut branches = Vec::new();
    for line in text.lines().filter(|l| !l.is_empty()) {
        let parts: Vec<&str> = line.split('\x1f').collect();
        let name = parts.first().copied().unwrap_or("").to_string();
        if name.is_empty() {
            continue;
        }
        let track = parts.get(1).copied().unwrap_or("");
        branches.push(GitBranchState {
            kind: branch_kind(&name).to_string(),
            status: track_to_status(track).to_string(),
            author: parts.get(2).copied().unwrap_or("").to_string(),
            last_commit: parts.get(3).copied().unwrap_or("").to_string(),
            name,
            parent: None,
        });
    }
    compute_parents(&repo, &mut branches);
    Ok(branches)
}

fn git_capture(repo: &str, args: &[&str]) -> Option<String> {
    let out = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Real lineage: for each branch, parent = the other branch it most recently diverged
/// from (fewest commits on this branch since their merge-base), preferring the base
/// branch on ties. Capped for cost on big repos.
fn compute_parents(repo: &str, branches: &mut [GitBranchState]) {
    if branches.len() > 40 {
        return;
    }
    let names: Vec<String> = branches.iter().map(|b| b.name.clone()).collect();
    let base = names
        .iter()
        .find(|n| n.as_str() == "main")
        .or_else(|| names.iter().find(|n| n.as_str() == "master"))
        .cloned();
    for b in branches.iter_mut() {
        if Some(&b.name) == base.as_ref() {
            continue;
        }
        let mut best: Option<(String, u32)> = None;
        for cand in &names {
            if cand == &b.name {
                continue;
            }
            let Some(mb) = git_capture(repo, &["merge-base", &b.name, cand]) else {
                continue;
            };
            let count = git_capture(repo, &["rev-list", "--count", &format!("{mb}..{}", b.name)])
                .and_then(|s| s.parse::<u32>().ok())
                .unwrap_or(u32::MAX);
            // count == 0 means this branch's tip IS the merge-base → the candidate is a
            // descendant (child), not a parent. Skip it.
            if count == 0 {
                continue;
            }
            let cand_is_base = Some(cand) == base.as_ref();
            let better = match &best {
                None => true,
                Some((bn, bc)) => {
                    count < *bc || (count == *bc && cand_is_base && Some(bn) != base.as_ref())
                }
            };
            if better {
                best = Some((cand.clone(), count));
            }
        }
        b.parent = best.map(|(n, _)| n);
    }
}

/// Remove a git worktree (and its directory). Destructive — operator-confirmed in UI.
/// Runs from the main repo so it can remove a linked worktree by path.
#[tauri::command]
pub fn remove_worktree(worktree: String) -> Result<String, String> {
    // The shared git dir lives in the main repo; derive the main worktree from it.
    let common = Command::new("git")
        .args([
            "-C",
            &worktree,
            "rev-parse",
            "--path-format=absolute",
            "--git-common-dir",
        ])
        .output()
        .map_err(|e| format!("git not found: {e}"))?;
    if !common.status.success() {
        return Err("not inside a git repository".into());
    }
    let common_dir = String::from_utf8_lossy(&common.stdout).trim().to_string();
    let main_repo = Path::new(&common_dir)
        .parent()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|| worktree.clone());
    let out = Command::new("git")
        .args(["-C", &main_repo, "worktree", "remove", "--force", &worktree])
        .output()
        .map_err(|e| format!("git worktree remove failed: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(format!("removed worktree {worktree}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testutil::*;

    // ----- pure-function unit tests (no I/O) -----

    #[test]
    fn branch_kind_classifies() {
        assert_eq!(branch_kind("main"), "PRD");
        assert_eq!(branch_kind("release/1.0"), "PRD");
        assert_eq!(branch_kind("feature/x"), "WIP");
        assert_eq!(branch_kind("fix/y"), "WIP");
        assert_eq!(branch_kind("random"), "OPEN");
    }

    #[test]
    fn track_to_status_maps() {
        assert_eq!(track_to_status(""), "synced");
        assert_eq!(track_to_status("[ahead 2]"), "ahead");
        assert_eq!(track_to_status("[behind 1]"), "synced");
        assert_eq!(track_to_status("[ahead 1, behind 3]"), "diverged");
    }

    // ----- hermetic git integration tests (temp repos) -----

    #[test]
    fn list_dir_sorts_dirs_first() {
        let r = init_repo();
        std::fs::create_dir(Path::new(&r.path).join("zdir")).unwrap();
        put_file(&r.path, "afile.txt", "x");
        let entries = list_dir(r.path.clone()).unwrap();
        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
        assert!(names.contains(&"zdir") && names.contains(&"afile.txt"));
        let first_file = entries.iter().position(|e| !e.is_directory).unwrap();
        let dirs_before = entries[..first_file].iter().all(|e| e.is_directory);
        assert!(dirs_before, "dirs should precede files: {names:?}");
    }

    #[test]
    fn list_branches_and_parents() {
        let r = init_repo();
        // main → feature/a (1 commit) → feature/b (1 commit)
        run_git(&r.path, &["switch", "-c", "feature/a"]);
        commit_file(&r.path, "a.txt", "a", "a1");
        run_git(&r.path, &["switch", "-c", "feature/b"]);
        commit_file(&r.path, "b.txt", "b", "b1");
        run_git(&r.path, &["switch", "main"]);

        let bs = list_branches(r.path.clone()).unwrap();
        let by = |n: &str| bs.iter().find(|b| b.name == n).unwrap();
        assert_eq!(bs.len(), 3);
        assert_eq!(by("feature/a").kind, "WIP");
        assert_eq!(by("main").parent, None);
        assert_eq!(by("feature/a").parent.as_deref(), Some("main"));
        assert_eq!(by("feature/b").parent.as_deref(), Some("feature/a"));
    }

    #[test]
    fn read_head_file_returns_committed_then_empty_for_untracked() {
        let r = init_repo();
        commit_file(&r.path, "f.txt", "committed\n", "c");
        put_file(&r.path, "f.txt", "working changes\n"); // dirty
        let head =
            read_head_file(Path::new(&r.path).join("f.txt").to_string_lossy().into()).unwrap();
        assert_eq!(head, "committed\n");
        // untracked file → empty HEAD
        put_file(&r.path, "new.txt", "x");
        let none =
            read_head_file(Path::new(&r.path).join("new.txt").to_string_lossy().into()).unwrap();
        assert_eq!(none, "");
    }

    #[test]
    fn create_and_remove_worktree() {
        let r = init_repo();
        let wt = create_worktree(r.path.clone(), "feature/wt".into()).unwrap();
        assert!(Path::new(&wt).exists(), "worktree dir exists");
        // listed by git
        let list = Command::new("git")
            .args(["-C", &r.path, "worktree", "list"])
            .output()
            .unwrap();
        assert!(String::from_utf8_lossy(&list.stdout).contains(&wt));
        remove_worktree(wt.clone()).unwrap();
        assert!(!Path::new(&wt).exists(), "worktree dir removed");
    }
}
