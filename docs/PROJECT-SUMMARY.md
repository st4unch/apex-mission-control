# Apex Mission Control — Project & Session Summary

> Bu doküman hem **uygulamayı** hem onu inşa eden **session'ı** özetler.
> Tarih: 2026-06-20 · Repo: https://github.com/st4unch/apex-mission-control · Release: v0.0.1

---

## 1. Uygulama nedir?

Paralel çalışan birden çok **Claude Code agent**'ını tek native pencereden başlatan, izleyen ve yöneten masaüstü kontrol paneli. **Tauri v2 (Rust) + React 19**, ~12 MB, anında açılır, yalnızca senin gösterdiğin proje klasörlerine dokunur.

Başlangıç noktası: tek-dosyalık bir AI Studio UI prototipi (tüm verisi sahte). Bugün her panel, makinedeki gerçek `git` ve `claude` durumunu okuyor.

## 2. Ne yapar? (özellikler)

| Alan | Özellik |
|---|---|
| Canlı oturumlar | `claude agents --json` (interactive + background); attach / stop / resume |
| Gerçek terminaller | PTY (`portable-pty`) + xterm; session başına kalıcı sekme; background'a otomatik `claude attach` |
| Yeni agent | İzole `git worktree` + `claude --dangerously-skip-permissions`; modal: workspace/branch/title/prompt/files/command |
| Editör + diff | Monaco (yerel, CDN yok) + HEAD-vs-çalışma-kopyası diff |
| Dosya ağacı | Lazy, gerçek; dosya değişiminde canlı yenilenir |
| Push/Merge queue | git durumu (ahead/behind/dirty) + trial-merge çakışma kontrolü + onaylı local merge / remote push + merge sonrası worktree temizliği |
| Collision | Aynı repo-relative dosyanın 2+ worktree'de editlenmesi (hook'suz, saf git) |
| Branch topolojisi | Gerçek lineage DAG (her branch'in parent'ı merge-base'den hesaplanır) |
| Metrikler | Uygulamanın kendi CPU/RAM'i (`sysinfo`) |
| Kalıcılık | Workspaces, worktrees, queue, açık sekmeler restart'ta geri yüklenir |

## 3. Mimari

- **Frontend (webview):** React 19 + Vite + Tailwind v4; `@xterm/xterm`, `@monaco-editor/react`, `lucide-react`. View geçişi: Control / Sessions / Queue.
- **Backend (Rust, `src-tauri/src/`):** stateless, compute-on-demand git plumbing — **arka plan daemon yok, makineye-gömülü yol yok, Python bağımlılığı yok.**
  - `agents.rs` — `claude agents --json` okuma + stop/kill
  - `pty.rs` — PTY terminaller (CLAUDE* env temizliği dahil)
  - `fs.rs` — dosya ağacı, read/write, worktree create/remove, branch + parent
  - `pm.rs` — proje durumu, trial-merge, push/merge, collisions
  - `watcher.rs` — `notify` ile dosya izleme (debounce'lı)
  - `metrics.rs` — `sysinfo` ile app CPU/RAM

## 4. Önemli kararlar (neden böyle)

| Karar | Gerekçe |
|---|---|
| **Tauri (Electron değil)** | ~12 MB vs ~80-200 MB; 10 agent + 10 terminal + Monaco'da düşük bellek; capability güvenlik modeli |
| **App-managed PTY (tmux'suz)** | Makinede tmux/claude-bg-spawn yoktu; her makinede çalışsın diye agent'lar uygulamanın kendi PTY'sinde |
| **PM/tracker Rust (Python değil)** | Agnostik — sıfır runtime bağımlılığı; "Python dosyası" isteği taşınabilirlik için Rust'a çevrildi |
| **İmzasız → Developer ID + notarize** | v0.0.1 Apple notarize edildi; her Mac'te uyarısız açılır |

## 5. Test & CI

- **Backend:** 14 hermetik test (her biri kendi temp git repo'sunu kurar — makineden bağımsız) + `cargo clippy -D warnings`. **3 gerçek bug yakaladı:** symlink path (read_head_file), descendant'ı parent sanma (compute_parents), porcelain trim ile dosya adı kayması (pm_collisions).
- **Frontend:** 14 test (vitest) — format util'leri + agent command-build + NewAgentModal.
- **CI:** `.github/workflows/ci.yml` (macOS) — her ikisini push/PR'da koşar.

## 6. Dağıtım

- `npm run tauri build` → `.app` (12 MB) + `.dmg`.
- v0.0.1: **Developer ID Application (7PG95YYJ64) imzalı + Apple notarize + staple** → `spctl: accepted, Notarized Developer ID`. GitHub Release'te `ApexMissionControl-0.0.1-arm64.zip`.
- İmzalama için yeniden kullanılabilir **`app-signing` agent**'ı kuruldu (`~/.claude/agents/app-signing.md`) — masaüstü (Developer ID + notarytool) + mobil (Apple Distribution + ASC upload).

## 7. Bu session'da ne yapıldı (kronoloji)

1. PRD + SYSTEM.md (spec-first pipeline) → prototipi Tauri'ye sardık.
2. Gerçek terminal (PTY + xterm), canlı agent listesi, kalıcı sekmeler.
3. Workspace ekleme + gerçek dosya ağacı; Monaco editör + diff.
4. Sessions sayfası (canlı + geçmiş), stop/kill, isim ayrımı.
5. Push/Merge queue (Rust PM), collision, branch topolojisi, app metrikleri.
6. Panel toggle, last-session memory, worktree lifecycle.
7. Mock temizliği (footer, branch badge'leri, telemetri → gerçek collision).
8. Test suite (P0 backend + P1 frontend) + CI; git init + ilk commit.
9. macOS imzalama: Developer ID sertifikası + notarization; `app-signing` agent.
10. Public repo + README + LICENSE + Release v0.0.1.
11. **Performans:** kasma/donma raporu → polling/watcher fırtınası düzeltildi (§8).

## 8. Bilinen sorun & düzeltme — performans (donma)

**Belirti:** kullanıcı PC'sinde aşırı kasma/donma.

**Kök neden (kod incelemesiyle bulundu):**
1. **`fs-changed` kaskadı** — watcher 400ms'de bir event → frontend anında branch + collision git subprocess'lerini *tüm worktree'lerde* spawn ediyordu → agent dosya editlerken git fırtınası.
2. **`agents` dep'i** — branch poll'u her 3sn'lik agent yenilemesinde boşuna yeniden çalışıyordu.
3. **Arka plan polling** — pencere görünmezken bile tüm poll'lar (agents/branch/collision/metrics/sessions/queue) çalışıyordu.

**Düzeltme (uygulandı, testler yeşil):**
- Watcher debounce **400ms → 1500ms** (kaskad frekansı düştü).
- Tüm git/claude poll'ları `document.hidden` iken **durur**; pencere geri görününce bir kez yenilenir.
- Branch poll'u artık stabil `repo` string'ine bağlı — 3sn'lik agent yenilemesinde yeniden çalışmıyor.

**Durum:** Düzeltmeler kodda + test/build yeşil. **Yeni imzalı sürüm (v0.0.2) yayınlanması gerekiyor** ki PC'ndeki kurulu uygulama düzelsin (mevcut v0.0.1 eski koddan).

**Olası ek iyileştirme (gerekirse):** xterm'e WebGL addon (yoğun terminal çıktısında çizim hızı). Şimdilik eklenmedi.
