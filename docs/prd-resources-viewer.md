# Mini-PRD: Resources Viewer Tab

- Tarih: 2026-06-22
- Tür: mini-PRD

## 1. Problem

Apex Mission Control, Claude Code'u yönetmek için kullanılıyor ama `~/.claude` altındaki araçlar (skills, agents, MCPs, hooks) görünmüyor. Kullanıcı bunları bulmak için terminal açmak zorunda; içeriklerini okumak için ayrıca editör lazım. Queue yanına bir "Resources" sekmesi bu boşluğu kapatır.

## 2. Scope

**Dahil:**
- Yeni `"tools"` view — header'da Queue'dan sonra 4. nav butonu
- `~/.claude/skills/` — dizin listesi; tıkla → `README.md` / `skill.md` / ilk `.md` okunur
- `~/.claude/agents/` — `.md` dosyaları; tıkla → tam içerik okunur
- `~/.claude/hooks/` — `.sh / .py / .mjs` dosyaları; tıkla → kaynak okunur
- **MCPs** — `~/.claude/.mcp.json` + `~/.claude/claude-config/mcp.json` merge; name + command/url + description satırı
- Üst arama kutusu: tüm sekmelerde isim filtresi (client-side)
- Sağ panel: seçilen kaynağın içeriği (read_file ile)
- Yeni Tauri komutu: `list_claude_resources` (backend)

**Hariç:**
- Dosya düzenleme / kaydetme
- Sessions tab state fix (kullanıcı atladı)
- Proje-scope `.claude/` klasörleri (yalnızca user-scope `~/.claude/`)
- MCP server'ı başlatma / test etme

## 3. Kabul Kriterleri (binary)

- [ ] AC1: Header'da "Resources" butonu görünür; tıklayınca ResourcesPage render edilir, Queue/Control/Sessions etkilenmez.
- [ ] AC2: Skills sekmesi `~/.claude/skills/` içindeki dizinleri listeler (en az 1 kayıt gösterilir); bir skill tıklanınca içeriği sağ panelde görünür.
- [ ] AC3: Agents sekmesi `~/.claude/agents/*.md` dosyalarını listeler; tıklanınca tam içerik sağ panelde görünür.
- [ ] AC4: Hooks sekmesi `~/.claude/hooks/` içindeki çalıştırılabilir dosyaları listeler; tıklanınca kaynak kodu sağ panelde görünür.
- [ ] AC5: MCPs sekmesi `~/.claude/.mcp.json` ve `~/.claude/claude-config/mcp.json`'u merge ederek listeler; her satırda name + command/url + description gösterilir.
- [ ] AC6: Üst arama kutusu aktif sekmeyi isimle filtreler (büyük/küçük harf duyarsız, anlık).
- [ ] AC7: ResourcesPage mount/unmount ederek çalışır (PTY durumu yok); control view'daki PTY tab'ları ResourcesPage'e geçişte hayatta kalır (hidden div mantığı korunur).

## 4. Koruma Listesi (dokunulmayacak)

- `App.tsx` control-plane hidden-div pattern (L1 kuralı): `view !== "control"` → `hidden` class; PTY unmount edilmez (App.tsx:965-968)
- Mevcut Sessions, Queue, Control nav butonları ve davranışları (App.tsx:873-897)
- `fs::read_file` Tauri komutu değiştirilmez; ResourcesPage onu olduğu gibi çağırır
- `src-tauri/src/lib.rs` invoke_handler sırası: mevcut komutların sırası korunur, `list_claude_resources` sona eklenir

## 5. Entegrasyon / Harmony (ZORUNLU)

**View state genişletme:**
```
// App.tsx:274
const [view, setView] = useState<"control" | "sessions" | "queue">("control");
// → "control" | "sessions" | "queue" | "tools"
```
Kanıt: App.tsx:274, App.tsx:873-897 (nav render), App.tsx:947/955 (conditional render).

**Dosya okuma — mevcut komut:**
`fs::read_file(path: String) → Result<String, String>` (fs.rs:52) zaten var.
ResourcesPage bunu `invoke<string>("read_file", { path })` ile çağırır. Yeni komut gerektirmez.

**Yeni Tauri komutu:** `list_claude_resources() → Result<ClaudeResources, String>`
- `fs.rs`'e eklenir, `lib.rs` invoke_handler'a kaydedilir (lib.rs:78-91 arası).
- Struct'lar `fs.rs` içinde tanımlanır, `#[derive(serde::Serialize)]` ile.

**Nav render pattern:**
App.tsx:873-897 arasındaki `<button onClick={() => setView(...)}` bloklarının sonuna kopyalanır.

**Conditional render pattern:**
- Sessions: `{view === "sessions" && ...}` (App.tsx:947) → aynı pattern (stateless bileşen, unmount OK)
- Control: `hidden` div (App.tsx:965-968) → PTY için; Resources'a gerekmez, `{view === "tools" && <ResourcesPage />}` yeterli

**Kırma riski:**
- `view` tip genişletmesi: TS'de `setView("queue")` çağrıları (App.tsx:1235,1283,1341) etkilenmez; string literal tip genişlemesi geriye uyumlu.
- `read_file` komutu paylaşılıyor; ResourcesPage hata durumlarını sessizce handle etmeli (boş içerik veya "okuma hatası" göster).

## 6. Teknik Plan

### Backend (Rust) — `src-tauri/src/fs.rs` sonu

```rust
#[derive(serde::Serialize)]
pub struct ClaudeSkill   { pub name: String, pub path: String }
#[derive(serde::Serialize)]
pub struct ClaudeAgent   { pub name: String, pub path: String }
#[derive(serde::Serialize)]
pub struct ClaudeHook    { pub name: String, pub path: String }
#[derive(serde::Serialize)]
pub struct ClaudeMcp     { pub name: String, pub command: String, pub description: String }
#[derive(serde::Serialize)]
pub struct ClaudeResources {
    pub skills: Vec<ClaudeSkill>,
    pub agents: Vec<ClaudeAgent>,
    pub hooks:  Vec<ClaudeHook>,
    pub mcps:   Vec<ClaudeMcp>,
}

#[tauri::command(async)]
pub fn list_claude_resources() -> Result<ClaudeResources, String> { ... }
```

- Skills: `~/.claude/skills/` alt-dizinleri; `path` = dizin yolu (React'ta ilk `.md` aranır)
- Agents: `~/.claude/agents/*.md` dosyaları
- Hooks: `~/.claude/hooks/` içinde `.sh / .py / .mjs` uzantılı dosyalar
- MCPs: `.mcp.json` + `claude-config/mcp.json` JSON parse → merge → `name / command|url / description`

### Frontend — `src/components/ResourcesPage.tsx`

- `useEffect` ile mount'ta `list_claude_resources()` çağrısı (tek sefer, no reload)
- 4 sekme (Skills/Agents/MCPs/Hooks) — `useState<tab>`
- Arama kutusu: `query` state → filter by `name.toLowerCase().includes(query)`
- Sol liste + sağ içerik paneli — split layout
- Skill tıklandığında: `read_file(path + "/README.md")` → başarısızsa `read_file(firstMdFile)` → fallback "içerik yok"
- Monospace `<pre>` ile içerik render (Monaco değil — bağımlılık eklememek için)

### App.tsx değişiklikleri (minimal)

1. `view` tip + `import ResourcesPage`
2. Nav butonu (1 blok)
3. `{view === "tools" && <ResourcesPage />}` (1 satır)
