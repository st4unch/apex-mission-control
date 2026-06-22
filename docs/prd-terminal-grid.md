# PRD: Terminal Grid View

**Feature:** Multi-terminal grid — 4'e kadar terminali aynı anda yan yana göster, sürükle-bırak ile yeniden sırala, paneller arası resize yap.

---

## §1 Problem

Şu an terminaller tab'larla açılıyor; aynı anda sadece biri görünebiliyor. Paralel 4 Claude agent'ı izlerken sürekli tab geçişi yapılıyor. Kullanıcı 4 terminali aynı anda görmek istiyor.

## §2 Çözüm Özeti

Tab bar'ına "⊞ Grid" toggle butonu ekle. Tıklanınca:
- Sidepanel'lar gizlenir, tam ekran terminal alanı açılır
- Açık terminal'lardan ilk 4'ü 2×2 grid içinde yan yana görünür
- Her hücre sürüklenebilir (title bar drag handle), paneller arasında resize yapılabilir
- Tekrar tıklayınca normal tab görünümüne döner

## §3 Kapsam (tek faz)

**In scope:**
- Grid view toggle (tab ↔ grid)
- 1×1 (1), 2×1 (2), 2×2 (3-4) adaptive layout
- Drag-and-drop ile terminal sırası değiştirme
- Paneller arası resize (yatay + dikey)
- Grid'de hangi terminallerin göründüğü (gridKeys) localStorage'da persist
- Tam ekran mod (sidepanel'lar auto-hide)

**Out of scope:**
- Grid açıkken yeni terminal açma
- 4'ten fazla eşzamanlı terminal
- Editor (Monaco) hücreleri — sadece terminal kind

## §4 Acceptance Criteria

- [ ] AC1: Tab bar'ında "⊞ Grid" butonu görünür; tıklanınca grid açılır, tekrar tıklanınca tab'a döner
- [ ] AC2: ≤4 terminal aynı anda görünür; sayıya göre layout otomatik ayarlanır (1→1×1, 2→2×1, 3-4→2×2)
- [ ] AC3: Her hücrenin üstünde title bar var; title bar'a tıklanıp sürüklenince drag başlar
- [ ] AC4: Bırakıldığında iki hücrenin sırası yer değiştirir (swap)
- [ ] AC5: Panel handle'ları ile yatay ve dikey resize yapılabilir; xterm otomatik fit'lenir
- [ ] AC6: Grid modunda sidepanel'lar gizlenir; tab bar sekmeler gizlenir ama grid toggle butonu kalır
- [ ] AC7: Grid açıkken terminal PTY'leri kesilmez (display:none → display:flex geçişi)
- [ ] AC8: `viewMode` + `gridKeys` localStorage'a yazılır; app yeniden açıldığında restore edilir

## §5 Entegrasyon (kanıt)

| Bağlantı noktası | Dosya:satır | Notlar |
|---|---|---|
| `openTerminals` state | `App.tsx:235` | Aynı state kullanılır, yeni state yok |
| Terminal render loop | `App.tsx:1173-1204` | `display:none` pattern korunur, grid'de flex olur |
| `active` prop + resize | `Terminal.tsx:172-179` | RO zaten `fit.fit()` + `pty_resize` yapıyor |
| Tab bar header | `App.tsx:1111` | Grid toggle buraya eklenir |
| Sidebar `leftOpen`/`rightOpen` | `App.tsx` | Grid açınca false yapılır |

**Kütüphaneler (ADR-001 kararı):**
- `@dnd-kit/core` + `@dnd-kit/sortable` — drag-drop (react-beautiful-dnd deprecated)
- `react-resizable-panels` — yüzde-tabanlı resize (RO + PTY zinciri otomatik çalışır)

**Gotcha:** dnd-kit drag overlay × panel resize handle pointer-events çakışır → drag handle'ı sadece title bar'a izole et, panel gövdesine değil.

## §6 Kararlar

| Konu | Karar | Gerekçe |
|---|---|---|
| DnD library | `@dnd-kit/sortable` | react-beautiful-dnd deprecated (2025-08) |
| Resize library | `react-resizable-panels` | Yüzde-based, RO zinciri manuel tetik gerektirmez |
| Layout | CSS Grid `1fr 1fr` | flex-wrap satır yüksekliği belirsiz |
| State | Mevcut `openTerminals` + `viewMode` flag | Tek kaynak-of-truth; dual state drift riski |
| Swap semantiği | Swap (yer değiştir), insert değil | 4 hücre sabiti için daha net |
