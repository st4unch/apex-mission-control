# PRD — Apex Mission Control

**Status:** Draft v0.1 — Under review
**Owner:** st4unch (güvenlik mühendisi)
**Implementer:** Claude Code (`/prd-run`)
**Drafted with:** claude-opus-4-8 (extended thinking; otonom subagent review/gate'ler Anthropic session limit'i nedeniyle inline yapıldı — bkz. §0)
**Depends on:** `SYSTEM.md` (2026-06-16, Draft)
**Target release:** Faz 0 → Faz 4 (kişisel araç, sabit tarih yok)
**Production-readiness state:** Checklist complete (§16)

---

## §0 Review Log

**Not:** Phase 2c otonom dual-review (Quality + Adversarial subagent) Anthropic **session limit**'ine takıldı (reset 5:40 Europe/Istanbul). Orchestrator (Opus 4.8) review + adversarial pre-mortem + acceptance gate'i **inline** yürüttü. Subagent kotası açılınca ikinci tur dış review önerilir.

| ID | Severity | Title | Status | Notes |
|---|---|---|---|---|
| A1 | FATAL→MED | `state.json` şeması sürümle kırılırsa monitor boşalır | applied | §12 R3 + §12.5; `claude agents --json`'a yaslanma kararı D5 |
| A2 | SERIOUS | Tam orkestrasyon Faz 1'i şişiriyor, PTY+Rust async aynı anda risk | applied | §10 Faz 1'i ikiye böldüm (1a terminal/dosya, 1b orkestrasyon); §12 R1 |
| A3 | SERIOUS | Hook `http` semantiği topluluk-raporlu; sessiz yutarsa collision kaçar | applied | §12.5 + AC-18 gerçek POST inspect; watcher fallback D7 |
| A4 | MED | 10x kota maliyeti kullanıcıyı şaşırtabilir | applied | §14 bütçe + R4; Faz 4 bütçe guard |
| D1 | CONSIDER | Electron'a düşme eşiği net mi | applied | §10 Faz 1a sonunda 3-4 gün eşiği; §15.5 D2 |
| R1 | — | WebKitGTK Linux perf (araştırma) | applied | NG1 ile kapsam dışı; macOS-only |
| R2 | — | Vibe Kanban community-maintained risk | applied | fork yok kararı D8; sadece pattern |

**Review rounds:** 1 (inline — subagent limiti)
**Reviewer model:** claude-opus-4-8 (orchestrator inline)
**Recommend gate pass:** yes — kapsam net, AC'ler binary, riskler sahipli; tek operatör-niyeti açık soru kalmadı (kullanıcı tam vizyon + tam orkestrasyonu onayladı).

---

## 1. Goal (Why)

Birden çok Claude Code agent'ını paralel worktree'lerde çalıştırmak bugün terminal sekmeleri + Warp + `claude` CLI arasında dağınık ve gözlenemez. Apex Mission Control, ~10 agent'ı **tek native pencereden başlatan, izleyen ve kontrol eden** masaüstü uygulamasıdır: hangi agent çalışıyor/input bekliyor, hangi dosyalar çakışıyor, ne kadar kota yandı — hepsi tek ekranda. Mevcut UI prototipi (`SYSTEM.md §1`) bu ekranı tasarladı ama tüm verisi sahte; bu PRD onu gerçek yapar.

## 2. Non-goals

- Çapraz platform piksel-uyumu — yalnızca macOS/Apple Silicon (Linux/Windows test edilmez).
- Çoklu makine / uzak agent yönetimi.
- Code signing / notarization (sonraya; Gatekeeper'ı bir kez geçmek yeterli).
- Uygulama içi LLM sohbeti / kendi model çağrısı; prototipin `@google/genai` bağımlılığı **kaldırılır** (`SYSTEM.md §13`).
- Claude Code'un kendi davranışını değiştirmek — sadece onun yerel modelini okur/yazar, fork etmez.

## 3. Background and context

Bugün repo'da yalnızca bir UI prototipi var: tek-dosya React 19 + Vite 6 + Tailwind v4 SPA (`SYSTEM.md §1, §6`), üç panelli IDE düzeni (`SYSTEM.md §6` render tablosu), tüm verisi in-memory mock (`SYSTEM.md §4`). Gerçek terminal, dosya sistemi, `~/.claude` entegrasyonu yok. Kullanıcı şu an agent'ları elle `tmux` + `claude` ile açıp ayrı terminallerde takip ediyor — gözlemlenebilirlik ve çakışma kontrolü yok.

Eksik olan: native bir kabuk (gerçek PTY, scoped dosya erişimi, `~/.claude` okuma, hook alıcı, orkestrasyon). Prototipin TypeScript arayüzleri (`AgentSession`/`GitBranchState`/`FileItem`, `SYSTEM.md §4`) bu backend'in dolduracağı **kontratı** zaten tanımlıyor.

## 3.5 Industry context & benchmark

Kaynak: `compass_artifact_wf-bcd30118-...md` (kullanıcı tarafından sağlanan araştırma dokümanı). Doküman içi sayısal iddialar bağımsız fetch edilemediğinden (subagent web araçları rate-limit'te) `[NEEDS-WEB-VERIFY]` ile işaretli.

### Masaüstü kabuğu — üretim sistemleri bu sınıfı nasıl çözüyor

| Yaklaşım | Kullanan | Pro | Con | Kaynak |
|---|---|---|---|---|
| **Tauri v2** (Rust core + sistem webview) | Terax, Terminon (terminal app'leri) | Bellek ~30-50MB, bundle ~2-10MB, capability/scope güvenlik modeli, frontend yeniden-yazımsız | Rust compile adımı, custom feature = Rust, eksik-permission sessiz fail | compass doc §1 `[NEEDS-WEB-VERIFY]` |
| **Electron** (Node main + Chromium) | VS Code, çok sayıda IDE | Olgun, Rust yok, garantili render | Bellek ~150-300MB, bundle ~80-200MB, `node-pty` native rebuild | compass doc §1 `[NEEDS-WEB-VERIFY]` |
| **Wails (Go)** / Neutralino | — | Tauri benzeri, Go biliniyorsa | Go codebase yok; PTY/plugin ekosistemi ince; Neutralino PTII+SQLite+watcher için fazla zayıf | compass doc §1 |

### Seçilen yaklaşım + gerekçe (karar doktrini uygulandı)

**Tauri v2.** ≥3 gerçek seçenek üretildi (Tauri, Electron, Wails/Neutralino), her biri pre-mortem ile çürütüldü:
- *Electron'u çürüt:* "100x'te 10 agent + 10 xterm + Monaco'da bellek 1.5-3GB'a tırmanır, always-open kontrol panelinde sürdürülemez" → Tauri'nin Rust core'u PTY I/O + watcher'ı çok daha ucuz taşır → Tauri kazanır (dayanıklılık + ölçek ekseni).
- *Tauri'yi çürüt:* "Rust async PTY shared-state borrow-checker'da takılırsan haftalar kaybedersin" → gerçek; **mitigasyon:** Faz 1a sonunda 3-4 gün eşiği, takılırsak `electron-vite`+`node-pty`'ye pivot (mimari diyagram aynı, sadece backend dili) → risk sınırlı, kabul edilebilir.
- *Wails/Neutralino'yu çürüt:* Go codebase yok + PTY ekosistemi ince → elenir.
"5 kez prod'da terminal app kurmuş senior" lens'i: PTY + scoped FS + SQLite + watcher ihtiyacı olan, güvenlik sınırı isteyen tek-makine aracında Tauri seçer. Sağ kalan: **Tauri v2.**

### İlgili standartlar / advisory

- Tauri capability/permission/scope (ACL) modeli — path traversal (`../`) bloklu, scope per-command — güvenlik sınırı için doğru primitive. compass doc §1c.
- xterm.js + WebGL addon + `portable-pty` (wezterm projesi) — kanıtlanmış terminal pattern (Terax, Terminon). compass doc §4.
- `claude agents --json` resmi makine-okunur arayüz; `state.json` iç şema resmi değil (sadece dosyanın amacı belgeli). compass doc §6, Caveats.

### Compliance constraints

| Rejim | Geçerli? | Burada ne gerektirir | Kaynak |
|---|---|---|---|
| KVKK / GDPR | **Hayır** | Tek makine, kişisel araç; veri makineden dışarı çıkmıyor (hook receiver yalnızca `127.0.0.1`). İşlenen "kişisel veri" yok. | `SYSTEM.md §8`; bu PRD §9 |
| SOC2 | Hayır | Dağıtılan/çok-kiracılı servis değil. | — |
| PCI / HIPAA | Hayır | Ödeme/sağlık verisi yok. | — |

## 4. User flow

1. **Actor: kullanıcı** — uygulamayı açar → System response: tek pencere, activity-bar, `/control` sayfası; backend `claude agents --json` + `roster.json` okuyup mevcut agent'ları listeler.
2. **Actor: kullanıcı** — "Yeni agent" → bir branch adı + base verir → **Gate-1 (yok, geri-alınabilir):** System response: `git worktree add` → env kopyala → `tmux new -A -s claude-<hash> 'claude'` → yeni agent kartı belirir.
3. **Actor: kullanıcı** — agent kartına tıklar → System response: `/control` ortada o agent'ın xterm tab'ı `tmux attach` ile canlı oturuma bağlanır.
4. **Actor: agent (Claude Code)** — bir dosya editler → System response: PostToolUse `http` hook → backend receiver → SQLite telemetri → file tree'de `isModified` rozeti; iki agent aynı repo-relative dosyaya dokunursa `hasConflict` rozeti + monitor uyarısı.
5. **Actor: agent** — input/permission bekler → Notification hook → System response: kart `waiting-for-input` durumuna geçer.
6. **Actor: kullanıcı** — agent'ı durdurur → **Gate-2 (geri-alınamaz uyarı):** worktree silinmeden önce "commit/push edildi mi?" uyarısı → `claude stop <id>`.

## 4.5 Use cases — concrete scenarios

### Use case 1: Sabah paralel başlatma
- **Persona:** st4unch — güvenlik mühendisi, CLI rahat, 8-10 agent'ı aynı anda koşturuyor.
- **Trigger:** "5 ayrı feature'a aynı anda agent koşturayım."
- **Pre-conditions:** Apex repo klonlu; `claude` CLI kurulu; tmux var.
- **Happy path:** Uygulamayı aç → "Yeni agent" ×5 (her biri branch adıyla) → her biri worktree+tmux+claude ile ayağa kalkar → control sayfasında 5 terminal tab'ı.
- **Success outcome:** `claude agents --json` 5 aktif oturum döndürüyor, 5 kart `working`, 5 xterm canlı attach.
- **Failure path & recovery:** worktree zaten varsa → backend `git worktree add` hatasını yakalar, kartta kırmızı "worktree mevcut" + mevcut olana attach öner.

### Use case 2: Çakışma yakalama
- **Persona:** aynı kullanıcı, gün ortası.
- **Trigger:** "İki agent yanlışlıkla aynı dosyaya yazıyor mu?"
- **Pre-conditions:** ≥2 agent çalışıyor, user-scope hook'lar kurulu.
- **Happy path:** agent-A `src/api/stripe.ts` editler, agent-B aynı repo-relative path'i editler → PostToolUse hook'ları SQLite'a düşer → backend pencere içinde collision flag → monitor paneli kırmızı satır + file tree `hasConflict` rozeti.
- **Success outcome:** kullanıcı çakışmayı 5 sn içinde görür, bir agent'ı durdurur.
- **Failure path & recovery:** hook POST sessizce başarısızsa → `notify` watcher worktree'lerdeki dosya mtime değişimini yakalar (yedek sinyal), collision yine de flag'lenir (gecikmeli).

### Use case 3: Kota şaşkınlığını önleme
- **Persona:** aynı kullanıcı, fatura kaygısı.
- **Trigger:** "10 agent açtım, ne kadar yakıyorum?"
- **Pre-conditions:** monitor sayfası, agent'lar çalışıyor.
- **Happy path:** monitor tablosu her agent için `quotaBurn $` + global toplam gösterir; eşik aşılınca uyarı bandı.
- **Success outcome:** kullanıcı toplam $X'i görür, gerekirse agent durdurur.
- **Failure path & recovery:** transcript jsonl token alanı parse edilemezse → "tahmini" etiketi + en son bilinen değer; sıfır göstermez.

## 5. Architecture

Greenfield Tauri v2 app; prototip frontend'i (`SYSTEM.md §6`) webview'de yeniden-yazımsız host edilir, mock veri katmanı `invoke()` çağrılarıyla değişir.

**Yeni bileşenler:**
- **Frontend kabuk** (`src/`) — React 19 + Vite 6 + Tailwind v4 (prototipten taşınır), **TanStack Router** ile 3 sayfa, activity-bar (Allotment/react-resizable-panels), `/control`'da **dockview**. Prototipin `App.tsx` (1061 satır, `SYSTEM.md §6`) bileşenlere bölünür.
- **Backend (Rust core, `src-tauri/`)** modülleri (`SYSTEM.md §7` entegrasyon hedefleri):
  - **PTY bridge** — `portable-pty`/`tauri-plugin-pty`, Channel-stream I/O, tmux attach-or-create.
  - **FS/git bridge** — scoped `read_dir`/`read_file`/`write_file`, `git diff`/`git show HEAD:`.
  - **Claude readers** — `roster.json`/`jobs/state.json`/`tasks/*`/jsonl parse + `claude agents --json` shell.
  - **Hook receiver** — Axum local HTTP `127.0.0.1:8787`, hook POST → SQLite → Tauri event.
  - **Watchers** — `notify` crate, `~/.claude/*` + worktree ağaçları (debounce).
  - **Orchestrator** — worktree create/remove, tmux+claude spawn/stop/respawn.
  - **SQLite** — `tauri-plugin-sql` (SQLx); collision log + telemetri + snapshot cache.

**Değiştirilen bileşenler:** prototipin mock state'i (`SYSTEM.md §4` — `agents`/`branchList`/`files`/`terminalHistory`) → `invoke()` + Tauri event aboneliği. Çoğaltılmış domain tipleri (`SYSTEM.md §12`) → tek kaynak: **ts-rs** ile Rust struct'tan üretilir.

**Entegrasyon noktaları:** webview ↔ Rust IPC (`invoke`/`Channel`/event); Rust ↔ `~/.claude` dosyaları; Rust ↔ `claude`/`git`/`tmux` CLI; Claude Code hooks → Axum receiver.

**Veri akışı (prose):** Agent dosya editler → Claude Code PostToolUse hook → POST `127.0.0.1:8787` → Axum receiver → SQLite yaz + Tauri event emit → frontend listener file tree/monitor günceller. Paralel: `notify` watcher dosya değişimini, `claude agents --json` polling'i durum değişimini besler (push + pull hibrit).

## 6. Data model

Kalıcı depo: **SQLite** (yeni; prototipte yoktu — `SYSTEM.md §4`). `tauri-plugin-sql` / SQLx.

- **`file_edits`** — collision telemetri. Alanlar: `id INTEGER PK`, `session_id TEXT`, `branch TEXT`, `worktree TEXT`, `file_path TEXT` (**repo-relative**, normalize edilmiş), `tool TEXT`, `ts INTEGER`. İndeks: `(file_path, ts)`. Çakışma sorgusu bu indeksi kullanır.
- **`collisions`** — türetilmiş/önbellek. Alanlar: `id`, `file_path`, `session_a`, `session_b`, `first_seen_ts`, `resolved INTEGER`.
- **`session_snapshots`** — `claude agents --json` cache. `session_id`, `payload_json`, `fetched_ts`.

**Status enum'ları** (prototipten korunur, `SYSTEM.md §4`): `AgentSession.status`: `working → waiting-for-input → working`, `working → idle`, `* → stopped`. `GitBranchState.status`: `synced|ahead|diverged|conflict`.

**Retention / TTL:** `file_edits` ve `session_snapshots` 7 gün sonra purge (local disk, owner: kullanıcı). `collisions.resolved=1` olanlar 24 saat sonra silinir. Migration: additive-only; SQLx migration dosyaları `src-tauri/migrations/`.

## 7. API contracts

Geleneksel HTTP API yok; iki yüzey var.

**Tauri IPC komutları** (frontend `invoke()` → Rust `#[tauri::command]`):
| Komut | Girdi | Çıktı | Hata |
|---|---|---|---|
| `list_agent_sessions` | — | `Vec<AgentSession>` | `claude` yoksa `Err("claude CLI not found")` |
| `spawn_agent` | `{branch, base, repo_root}` | `AgentSession` | worktree mevcut / git hata |
| `stop_agent` | `{session_id}` | `()` | — |
| `pty_spawn`/`write`/`resize`/`kill` | tmux/pty params | `Channel<PtyEvent>` | spawn hata |
| `read_dir`/`read_file`/`write_file` | scoped path | içerik | scope dışı → `Err` |
| `git_diff` | `{worktree, file}` | diff metni | — |
| `list_tasks` | `{list_id?}` | `Vec<Task>` | dosya yoksa boş |

**Hook receiver (consumed webhook)** — kaynak: Claude Code `http` hook. Method POST, path `127.0.0.1:8787/hook/<event>`. Payload: hook event JSON (`session_id`, `transcript_path`, `cwd`, `hook_event_name`, tool event'lerde `tool_name`/`tool_input`/`tool_response`). Doğrulama: yalnızca `127.0.0.1` bind (dış erişim yok); ek imza yok (local trust). Yanıt: `200 {}` (Claude Code yanıt gövdesini command-hook formatında bekler).

**Outbound CLI çağrıları:** `claude agents --json` (timeout 5s, hata → son snapshot), `git -C <wt> ...` (timeout 10s), `tmux ...`. Retry: idempotent okumalarda 1 retry; spawn'da retry yok (yan etkili).

## 8. Frontend

3 route (TanStack Router); prototip kabuğu taşınır (`SYSTEM.md §6`).

- **`/control`** — activity-bar | sol: react-arborist dosya ağacı (lock/conflict/modified rozetleri, `FileItem` modeli `SYSTEM.md §4`) | orta: dockview = tab'lı Monaco editör (+DiffEditor: HEAD vs worktree) + alt panel xterm terminaller (agent başına tab) | sağ: BranchDAG (`SYSTEM.md §1`) + WIP matrisi. Data: `list_agent_sessions`, `git_diff`, PTY channel. States: loading (spinner), empty (agent yok → "Yeni agent" CTA), error (claude yoksa banner), partial (bazı oturum verisi eksik → "tahmini"). 
- **`/kanban`** — `list_tasks`'ten kolonlar (pending/in_progress/completed) + `blockedBy`/`blocks` kenarları. States: empty (görev yok), error (tasks dizini yok → jsonl fallback uyarısı).
- **`/monitor`** — agent tablosu + collision paneli + global kota bandı. Data: `list_agent_sessions` + SQLite collisions + jsonl token. States: loading/empty/error.

State yönetimi: prototipteki component state korunur + Tauri event listener'ları. Erişilebilirlik: durum rozetleri renk+ikon (sadece renk değil); xterm klavye-odaklı.

## 9. Auth, secrets, security

- **Authentication/Authorization:** yok — tek makine, tek kullanıcı (`SYSTEM.md §8`). Güvenlik sınırı **kimlik değil, FS kapsamı**.
- **FS kapsamı:** Tauri capabilities (`src-tauri/capabilities/*.json`) ile `fs` plugin scope'u **yalnızca** Apex repo kökü + `.claude/worktrees/**`. Path traversal (`../`) plugin'de bloklu. Geniş erişim gerekirse custom `#[tauri::command]` + `std::fs` (scope dışı — güvenlik kontrolü kodda açıkça yapılır ve belgelenir).
- **Hook receiver:** yalnızca `127.0.0.1:8787` bind; loopback dışı erişim yok. Port çakışması → alternatif port + settings.json güncelle.
- **Secrets:** prototipin `GEMINI_API_KEY`/`@google/genai` **kaldırılır** (`SYSTEM.md §9, §13`). Yeni secret yok.
- **Audit logging:** `file_edits` tablosu hangi session hangi dosyaya ne zaman dokundu — yerel denetim izi.
- **Prompt injection:** uygulama LLM çağırmaz (NG); agent'ların kendi izolasyonu Claude Code sorumluluğunda. Uygulama yalnızca okur/gösterir.
- **Threat model (top 3):**
  1. *Kötü niyetli hook POST'u (loopback'e erişen local malware)* → receiver yalnızca telemetri yazar, kod çalıştırmaz; payload şema-valide edilir.
  2. *Path traversal ile repo dışı dosya okuma* → Tauri scope + custom komutlarda explicit kök kontrolü.
  3. *Worktree silme ile veri kaybı* → Gate-2 commit/push uyarısı (geri-alınamaz aksiyon onayı).

## 10. Phases

- **Faz 0 — Sarma** · Scope: `create-tauri-app`, prototipi `src/`'e taşı, Tailwind/Vite carry-over, HMR doğrula, `@google/genai`/scaffolding çıkar. Out: gerçek veri. AC: AC-1,2,3. Effort: S.
- **Faz 1a — Gerçek terminal + dosya/editör** · Scope: `tauri-plugin-pty` + xterm tab (tmux attach-or-create), react-arborist + scoped `read_dir`, Monaco + DiffEditor (`git show HEAD:`). Out: orkestrasyon, canlı status. AC: AC-4..8. Effort: L. **Electron pivot eşiği bu fazın sonunda.**
- **Faz 1b — Orkestrasyon** · Scope: worktree create/remove, tmux+claude spawn/stop/respawn, env-kopyalama. Out: hook'lar. AC: AC-9..12. Effort: M.
- **Faz 2 — Canlı status + hooks** · Scope: Claude readers, `notify` watcher, Axum hook receiver, user-scope `http` hook'lar, mock→canlı `AgentSession`. AC: AC-13..18. Effort: L.
- **Faz 3 — Kanban** · Scope: `tasks/` oku, kolon+bağımlılık, TaskCreated/Completed canlı. AC: AC-19..21. Effort: M.
- **Faz 4 — Monitor + collision + kota guard** · Scope: monitor tablosu, PostToolUse collision→SQLite→repo-relative overlap→rozet, global bütçe guard. AC: AC-22..26. Effort: M.

## 11. Acceptance criteria

1. **AC-1:** `npm run tauri dev` native pencere açar; prototip üç-panel UI render olur (ekran görüntüsü).
2. **AC-2:** Tailwind v4 stilleri + Google fontlar webview'de uygulanır; HMR bir `App.tsx` düzenlemesinde çalışır.
3. **AC-3:** `@google/genai`, `express`, `dotenv`, `.env.example` kaldırılmış; `npm run build` (tsc) temiz.
4. **AC-4:** Bir xterm tab `tmux attach -t <session>` ile canlı oturuma bağlanır; klavye girdisi PTY'ye gider, çıktı ekranda.
5. **AC-5:** Aynı anda ≥3 xterm tab bağımsız PTY ile çalışır; tab değişiminde oturum kopmaz (canvas hide).
6. **AC-6:** react-arborist ağacı scoped `read_dir` ile gerçek worktree dosyalarını listeler.
7. **AC-7:** Monaco bir dosyayı `read_file` ile açar; düzenleme `write_file` ile diske yazılır.
8. **AC-8:** DiffEditor `git show HEAD:<path>` vs worktree içeriğini yan yana gösterir.
9. **AC-9:** "Yeni agent" → `git worktree add <path> -b <branch>` gerçekten çalışır; `git worktree list` worktree'yi gösterir.
10. **AC-10:** Worktree oluşturulunca `.env`/`.env.local` hedef worktree'ye kopyalanır (WorktreeCreate/`.worktreeinclude`).
11. **AC-11:** Spawn `tmux new -A -s claude-<hash> -c <wt> 'claude'` ile oturum başlatır; `claude agents --json` yeni oturumu döndürür.
12. **AC-12:** "Durdur" → Gate-2 commit/push uyarısı gösterilir; onayla → `claude stop <id>`; oturum `claude agents --json`'dan düşer.
13. **AC-13:** Backend `claude agents --json` çıktısını parse edip `AgentSession[]` döndürür; UI tablosuna yansır (mock kalkar).
14. **AC-14:** `roster.json` + `jobs/<id>/state.json` okunur; parse hatası uygulamayı düşürmez (best-effort, "tahmini" etiketi).
15. **AC-15:** `notify` watcher `~/.claude/jobs/` değişiminde Tauri event emit eder; UI <2s günceller.
16. **AC-16:** Axum receiver `127.0.0.1:8787/hook/post-tool-use` POST'unu 200 ile yanıtlar; gövde SQLite `file_edits`'e yazılır.
17. **AC-17:** User-scope `~/.claude/settings.json` `http` hook'ları kuruludur ve farklı worktree'lerden ateşlenir.
18. **AC-18:** Notification hook geldiğinde ilgili agent kartı `waiting-for-input` rozetine geçer (gerçek POST ile doğrulanır).
19. **AC-19:** `~/.claude/tasks/<list>/` görev dosyaları okunur; Kanban kolonlarına status'a göre düşer.
20. **AC-20:** `tasks/` boş/`.lock`-only ise jsonl fallback ile TaskCreate/Update parse edilir; UI boş-durum göstermez.
21. **AC-21:** TaskCreated/Completed hook'u kolonu canlı günceller (<2s).
22. **AC-22:** Monitor tablosu her agent için status, aktif tool/dosya, token, `quotaBurn $`, süre gösterir.
23. **AC-23:** İki farklı session aynı repo-relative dosyaya `file_edits` yazınca backend collision flag'ler.
24. **AC-24:** Collision file tree'de `hasConflict` + monitor'da kırmızı satır gösterir.
25. **AC-25:** `file_path` worktree öneki strip edilip repo-relative normalize edilir (iki worktree'den aynı dosya çakışır).
26. **AC-26:** Global kota bandı tüm agent'ların `quotaBurn` toplamını gösterir; eşik aşımında uyarı.

## 12. Risk register

| # | Risk | Severity | Likelihood | Mitigation | Owner | Trigger to revisit |
|---|---|---|---|---|---|---|
| R1 | Rust async PTY shared-state borrow-checker'da takılma | HIGH | MED | Faz 1a sonu 3-4 gün eşiği → Electron pivot (diyagram aynı) | kullanıcı | 4 gün geçti hâlâ bloklu |
| R2 | `state.json` iç şeması Claude Code sürümüyle kırılır | HIGH | HIGH | `claude agents --json`'a yaslan; `state.json` best-effort; sürüm pin | kullanıcı | Claude Code upgrade |
| R3 | Hook `http` semantiği topluluk-raporlu, sessiz yutabilir | MED | MED | AC-18 gerçek POST inspect; `notify` watcher yedek sinyal | kullanıcı | collision kaçırma gözlemi |
| R4 | 10 agent → ~10x kota + Haiku özet maliyeti | MED | HIGH | §14 bütçe guard (Faz 4); per-agent `quotaBurn` görünür | kullanıcı | aylık fatura sıçraması |
| R5 | Tauri eksik-permission sessiz IPC fail (DX papercut) | MED | MED | devtools console + `tauri dev` terminal kontrol; capability checklist | impl | yeni komut eklerken |
| R6 | Worktree silme → commit edilmemiş iş kaybı | HIGH | LOW | Gate-2 commit/push uyarısı (geri-alınamaz onay) | kullanıcı | her stop/remove |
| R7 | HMR/watcher fırtınası UI flicker (agent editleri) | LOW | MED | `DISABLE_HMR` koru (`SYSTEM.md §13`); notify debounce; node_modules/.git exclude | impl | flicker gözlemi |
| R8 | Agent view research-preview; format GA öncesi değişir | MED | MED | Claude Code sürümü pin; upgrade sonrası şema re-verify | kullanıcı | yeni Claude Code sürümü |

## 12.5 Failure modes & recovery playbook

| Component | Failure type | Symptom | Detection | Recovery | Customer impact |
|---|---|---|---|---|---|
| `claude agents --json` | CLI yok / timeout | boş/exception | exit code, 5s timeout | son `session_snapshots` cache göster + "stale" etiketi | degraded |
| `state.json` parse | şema değişti | serde hata | parse Err | best-effort, eksik alan "tahmini" | degraded |
| Hook receiver | sessiz fail / port dolu | collision gelmiyor | yok→watcher yakalar | `notify` watcher yedek; port fallback | degraded |
| tmux | session yok / attach fail | xterm boş | exit code | attach-or-create retry; kullanıcıya hata | blocked (o agent) |
| git worktree | worktree mevcut/lock | spawn hata | git exit code | mevcuda attach öner | blocked (o spawn) |
| SQLite | lock/corrupt | yazma hata | SQLx Err | WAL mode; corrupt→yeniden oluştur (telemetri kaybı kabul) | degraded |
| `notify` watcher | event storm | CPU spike/flicker | yük | debounce + exclude globs | degraded |
| Monaco/xterm | webview render | beyaz panel | console error | bileşen remount | degraded |

## 13. Edge cases and error handling

- **Validation:** geçersiz branch adı → spawn reddi + mesaj; oversized dosya → Monaco read limiti, uyarı.
- **Downstream:** `claude`/`git`/`tmux` yoksa → başlangıçta "bağımlılık eksik" banner, hangi komut eksik.
- **Concurrency:** iki spawn aynı worktree path → git hata yakalanır; aynı dosyaya iki edit → collision (özellik, hata değil).
- **State machine:** `stopped` agent'a stop → no-op; çalışmayan oturuma attach → attach-or-create.
- **Rollback:** worktree create yarıda kalırsa (env kopya fail) → worktree kaldır, temiz state.
- **Resource:** çok agent → kota bandı; disk dolu → SQLite yazma hata graceful.
- **Idempotency:** aynı hook event iki kez → `(session_id, file_path, ts)` ile dedupe.

## 14. Performance & cost budget

| Metrik | Hedef | Hard cap | Ölçüm |
|---|---|---|---|
| İdle bellek (10 agent) | <600MB | 1GB | Activity Monitor |
| Pencere açılış | <2s | 4s | manuel |
| Hook→UI gecikmesi | <500ms | 2s | event timestamp |
| `claude agents --json` poll | 3s aralık | 5s timeout | — |
| Watcher debounce | 200ms | — | — |
| Kota (10 agent, kullanıcı bilgisi) | — | aylık fatura eşiği (kullanıcı belirler) | monitor toplam |

LLM: uygulama doğrudan LLM çağırmaz. Arka plan agent'ları ~10x kota + Haiku-class özet (≤15s'de bir yenilenir) — `[NEEDS-WEB-VERIFY]` compass doc §6.

## 15. Out of scope

- Çoklu makine / uzak agent — gelecek PRD.
- Tear-off ikinci pencere (terminali ayrı monitöre) — backlog.
- Code signing / dağıtım — sonraya.
- Windows/Linux desteği (ConPTY mutex, WebKitGTK perf) — backlog.

## 15.5 Decision log

| # | Decision | Alternatives | Why this one | Related AC |
|---|---|---|---|---|
| D1 | Tam vizyon Phase 0-4 tek PRD (user-approved) | Phase 0-1 odaklı dilim | Kullanıcı bütünsel istedi; fazlı milestone'larla uygulanır | tümü |
| D2 | Tam orkestrasyon baştan (user-approved) | Önce izleme, sonra spawn | Kullanıcı app'in worktree+tmux+claude başlatmasını istedi | AC-9..12 |
| D3 | Tauri v2 (Electron değil) | Electron, Wails/Neutralino | Doktrin: bellek/ölçek + güvenlik scope; Electron eşiği R1 | AC-1 |
| D4 | ts-rs ile tek-kaynak tip üretimi | elle senkron | Prototip tipleri çoğaltılmış (`SYSTEM.md §12`); drift önle | AC-13 |
| D5 | `claude agents --json` birincil, `state.json` best-effort | state.json'a güven | Resmi stabil şema vs sürüm-oynak | AC-13,14 |
| D6 | dockview (control) + Allotment/react-resizable-panels (shell) | tek lib | dockview IDE-grade docking; shell hafif | AC- (frontend) |
| D7 | Hook (push) + watcher (pull) hibrit | sadece biri | Hook semantic event, watcher dosya değişimi; biri kaçarsa diğeri yakalar | AC-15,16 |
| D8 | Vibe Kanban fork YOK, sadece pattern al | fork | Community-maintained risk; web-server grain webview'e ters | — |
| D9 | SQLite (SQLx) collision/telemetri | JSONL append | Sorgu + indeks; repo-relative çakışma sorgusu | AC-23 |

## 16. Production-readiness checklist

- [x] Risk Register ≥5 (8 risk, hepsi mitigasyon+owner)
- [x] Failure Modes her external dep + kritik bileşen için satır
- [x] ≥3 use case (3 concrete persona)
- [x] SYSTEM.md referansları doğrulandı (§1,4,6,7,8,9,12,13)
- [x] Industry claim'leri kaynaklı veya `[NEEDS-WEB-VERIFY]` etiketli (operatör onayı bekliyor)
- [x] Compliance: KVKK/GDPR/SOC2/PCI n/a — gerekçeli (§3.5)
- [x] Threat model top-3 (§9)
- [x] Cost & perf budget somut sayılarla (§14)
- [x] Breaking change migration: prototip mock→IPC (additive); SQLx migration
- [x] Decision Log tüm otonom + user-approved kararlar (D1-D9)
- [x] Open Questions numaralı + sahipli (§17)
- [x] P0/P1 risk owner'sız yok
- [x] Destructive op rollback: worktree silme Gate-2 (§4, R6)

## 17. Open questions

1. **`/control` dış kabuk: Allotment mı react-resizable-panels mi?** — Owner: impl. Status: deferred (Faz 1a spike). Faz 1'i bloklamaz.
2. **Kanban board: dnd-kit mi basit flex mi?** — Owner: impl. Status: deferred (Faz 3).
3. **Orkestrasyon `claude`'u doğrudan mı tmux içinden mi spawn etsin?** — Owner: impl. Status: deferred (Faz 1b spike; AC-11 her ikisiyle de sağlanabilir).
4. **`motion` (framer-motion) prototipte kullanılıyor mu?** — Owner: impl. Status: open (Faz 0'da grep ile netleşir; kullanılmıyorsa kaldır).
5. **Hedef Claude Code sürümü pin'i?** — Owner: kullanıcı. Status: open (Faz 2 öncesi; Agent view research-preview, R8).

## 18. Appendix — Research log

- `compass_artifact_wf-bcd30118-...md` (kullanıcı sağladı, erişim 2026-06-16) — Tauri vs Electron 6-eksen analizi, PTY/Monaco/file-tree/docking lib seçimi, `~/.claude` model + hooks + collision tasarımı, fazlı plan, gotcha/caveat'lar. Bu PRD'nin Phase 2a araştırma temeli.
- Doküman içi `[NEEDS-WEB-VERIFY]` iddialar: OpenReplay 2026 bellek benchmark, PkgPulse bundle, Tech-Insider/Nickel suite, RaftLabs "%35 YoY", Haiku özet 15s aralığı, `tauri-plugin-pty` 0.1.1 (2025-08-22). Subagent web doğrulaması rate-limit kalkınca yapılmalı.
- Postmortem/incident pattern (compass doc'tan): ConPTY Windows spawn-mutex (Terax), worktree env-dosyası kopyalanmaması, user-scope vs project-scope hook tutarlılığı.
