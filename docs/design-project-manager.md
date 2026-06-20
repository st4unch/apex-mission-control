# Design / Research — Apex Project Manager (PM tracker + Push/Merge Queue)

> **Durum:** onaylandı — Rust (in-app), stateless compute-on-demand. Üst nav "Queue", push+local merge.
> **Agnostic kuralı:** hiçbir makine-spesifik gömü yok — `$PATH`'ten git, base branch tespit (origin/HEAD→main→master), path'ler frontend'den gelir, arka plan daemon/Python yok. Bu klasör sadece dev ortamı.
> **Karar (2026-06-19):** Tracker Python değil **Rust** (operatör onayı) — sıfır runtime bağımlılığı, en taşınabilir.
> **Tarih:** 2026-06-18 · İlgili: `SYSTEM.md`, `prd-apex-mission-control.md` (Faz 2 watcher, Faz 4 collision)

## 1. İstek (kullanıcı)

- Her projeyi ve oluşan/değişen dosyaları takip eden bir **Python** dosyası.
- Bir proje worktree'ye eklendiğinde **otomatik takibe alınmalı**.
- "Project manager" gibi **durumu kontrol etmeli** (hazır mı, çakışma var mı).
- "Sessions"ın yanına yeni bir menü ile **push/merge queue**.

## 2. Araştırma bulguları

### Merge queue deseni (GitHub Merge Queue, Aviator, Trunk)
FIFO kuyruk. Her aday için **deneme branch** = `base` + öndeki adaylar + bu dal → zorunlu check'ler (CI/test) → hepsi geçerse merge, fail olan kuyruktan çıkarılır ve kalanlar yeniden doğrulanır. Amaç: main asla kırılmasın. Kaynak: docs.github.com/.../managing-a-merge-queue, aviator.co/blog/what-is-a-merge-queue, trunk.io.
**Bize uyarlama (local, solo):** GitHub PR yok; "check" = (a) worktree temiz mi, (b) main'e **trial-merge** çakışmasız mı (`git merge --no-commit --no-ff` deneme), (c) opsiyonel test komutu. Kuyruk sırayla bu kontrolleri yapar, "ready/conflict/failed" işaretler.

### Python ↔ Tauri entegrasyonu
- **localhost HTTP (FastAPI)** önerilen yol (Reddit r/tauri, dieharders/example-tauri-v2-python-server-sidecar). stdin/stdout "janky", kaçınılmalı.
- Dağıtımda: **PyInstaller** ile tek-dosya binary → `tauri.conf.json > bundle.externalBin` → Rust `shell().sidecar()` ile spawn (v2.tauri.app/develop/sidecar). Dev'de düz `python pm_tracker.py` çalıştır.
- Pencere kapanınca sidecar düzgün kapatılmalı (PyInstaller child pid sorunu — bilinen tuzak).

### Dosya takibi
- Python **`watchdog`** — cross-platform dosya olayları (create/modify/delete). Proje başına izleme; `node_modules`/`.git` hariç.

## 3. Önerilen mimari

```
Tauri app (Rust)                Python sidecar (pm_tracker.py)         Disk
  create_worktree ──register──►  /projects (POST)                      worktrees
  frontend ◄── HTTP poll ──────  /status, /queue (GET)        watchdog→ proje dosyaları
                                 trial-merge + git status ───────────► git repos
                                 SQLite/JSON (app data dir)
```

- **`pm_tracker.py`** (FastAPI, `127.0.0.1:8799`):
  - `POST /projects {repo, branch?, worktree}` — takibe al (worktree eklenince Rust çağırır).
  - `GET /status` — proje başına: branch, ahead/behind main, dirty?, conflict?, değişen dosya sayısı, son aktivite.
  - `GET /queue` / `POST /queue/add` / `POST /queue/remove` — push/merge kuyruğu.
  - `POST /queue/process` — sıradakine trial-merge + check; sonucu işaretle.
  - watchdog ile worktree'leri izler; SQLite'a yazar (collision telemetri ile birleşebilir).
- **Rust** (mevcut): `create_worktree` sonrası tracker'a `POST /projects`. Frontend tracker HTTP'sini doğrudan veya Rust proxy üzerinden okur.
- **Frontend**: yeni **"Queue"** görünümü (üst nav: Control | Sessions | **Queue**). Liste: izlenen projeler + PM durumu + "Add to queue"; kuyruk görünümü: sıralı adaylar, check durumu (ready/conflict/failed), aksiyonlar **Push** / **Merge** / **Remove**.

## 4. Mevcut sistemle entegrasyon (SYSTEM.md)
- `create_worktree` (fs.rs) → tracker register (yeni: HTTP çağrısı veya Rust komutu).
- Python tracker, PRD Faz 2'deki Rust `notify` watcher'ın ve Faz 4 collision'ın **yerini alır/üstlenir** (kullanıcı Python istedi). Rust; PTY/agents/git-plumbing'de kalır.
- DAG/Branch matrisi `list_branches` ile zaten gerçek; PM durumu onu ahead/behind + conflict ile zenginleştirir.

## 5. Kritik kararlar (operatör onayı gerek)
1. **"Merge" hedefi:** local `git merge` ile main'e mi, yoksa branch push + PR mı? (Solo local → local merge varsayıyorum; push ayrı.)
2. **Remote push:** Golden Rule §6 — gerçek `git push` her seferinde operatör onayı ister. Queue **hazırlar + kontrol eder**, push/merge'i operatör tetikler (otomatik değil).
3. **Sidecar yaşam döngüsü:** Tauri spawn etsin mi (bundled), yoksa kullanıcı ayrı mı başlatsın? (Dev'de ayrı, prod'da bundled öneririm.)
4. **Menü yeri:** üst nav "Queue" (öneri) mi, sağ panel 3. tab mı?

## 6. Açık sorular
- Test komutu projeye göre değişir — PM nasıl bilsin? (proje başına opsiyonel `test_cmd` config, boşsa atla.)
- Tracker portu sabit mi (8799), çakışırsa? (fallback port + Rust'a bildir.)
