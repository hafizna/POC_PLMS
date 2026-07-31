# Implementation Notes

Changelog harian untuk perubahan yang sudah benar-benar masuk kode. Untuk arah
arsitektur dan roadmap produk, rujuk:

- [`BUSINESS_PROCESS_BLUEPRINT.md`](./BUSINESS_PROCESS_BLUEPRINT.md) — blueprint
  proses bisnis dan lifecycle `Setting Case` yang jadi acuan target saat ini.
- [`README.md`](./README.md) — MVP roadmap, status implementasi per tahap, dan
  demo flow.

## Update 2026-07-31 — Fix: Audit Zone Dilakukan per Bay-Fisik, Bukan per Baris

**Masalah yang dikoreksi user**: penjelasan awal soal Angke↔Muarakarang Lama
("OHL cuma LCD, UGC baru DIST+LCD, wajar") salah arah — user menunjukkan itu
tidak masuk akal kecuali relainya sendiri memang cuma support diff (mis.
Siemens 7SD). Investigasi ulang dengan dump lengkap kedua sisi record
menemukan akar masalah sebenarnya: **relai fisik yang sama (Siemens 7SL87 —
model yang MEMANG punya elemen distance) dicatat sebagai 2 baris spreadsheet**
(satu dari sudut pandang tiap gardu), dan salah satu baris punya gap input
data — `functionGroup` tertulis `"LCD"` dan `actual.z1PhPh = 0` — padahal
baris pasangannya untuk relai identik yang sama menunjukkan `"DIST+LCD"` dan
`actual.z1PhPh = 2.5`. Ini transcription gap di Excel sumber, bukan
perbedaan kapabilitas relay. Skala: 2 dari 59 dokumen TAP yang punya >1 baris
saling berbeda `functionGroup` seperti ini.

**Fix bertahap (2 langkah, disetujui user secara eksplisit)**:

1. **`buildDistanceCapabilityIndex()`** — record dikelompokkan dulu via
   `tap.document` yang sama (kedua sisi bay fisik biasanya mengutip PDF TAP
   yang sama). Sebuah grup dianggap distance-capable kalau ADA anggota
   dengan `functionGroup` mengandung "dist", ATAU ada anggota dengan
   `actual.z1PhPh` non-zero (bukti langsung elemen distance nyata melapor
   nilai). Ini menaikkan cakupan audit dari 152 → 156 record capable —
   baris Angke-side yang tadinya salah terklasifikasi "LCD-only" sekarang
   ikut teraudit.
2. **`effectiveSource()`** (fix susulan, per keputusan user "gabungkan jadi 1
   unit perbandingan") — langkah 1 saja belum cukup: tiap record masih
   dibandingkan terhadap sumber `distance`/`tap`/`actual` MILIKNYA SENDIRI,
   jadi baris Angke-side (yang `actual.z1PhPh`-nya genuinely 0 di barisnya
   sendiri) tetap melapor status `"missing"` walau baris pasangannya di sisi
   Muarakarang punya `actual.z1PhPh = 2.5`. `effectiveSource(record, group,
   kind)` sekarang memilih sumber non-kosong milik record sendiri dulu,
   baru fallback ke sumber anggota grup lain kalau punya sendiri kosong —
   diterapkan ke ketiga source (`distance`/`tap`/`actual`) sebelum
   `compareValues` dipanggil, untuk KEDUA baris fisik (Angke-side maupun
   Muarakarang-side) secara simetris.

**Bukti verifikasi** (`gi_150kv_angke_pht_150kv_ugc_muarakarang_lama_1_1_19`
vs `gi_150kv_muarakarang_lama_pht_150kv_ugc_angke_1_1_35`, sama-sama
mengutip `tap.document = "Rev.01 MKLMA-ANGKE dan Sebaliknya.pdf"`): sebelum
fix, baris Angke-side membandingkan `tap.z1PhPh=0` vs `actual.z1PhPh=0` milik
sendiri → `0 === 0` → salah lapor **"match"** (false positive, menyembunyikan
bahwa baris ini sendiri tidak pernah diisi). Sesudah fix, kedua baris
sama-sama membandingkan terhadap `actual.z1PhPh=2.5` (diambil dari sisi
Muarakarang yang punya data) vs `tap.z1PhPh=0`/`distance.z1PhPh=0` (yang
memang kosong di KEDUA sisi — tidak ada referensi tap/distance tercatat sama
sekali untuk sirkuit ini) → status `"missing"` untuk `distance_vs_tap`
(benar — tidak ada apa pun untuk dibandingkan), tapi `tap_vs_actual` dan
`distance_vs_actual` sekarang menunjukkan `leftValue: 0, rightValue: 2.5`
alih-alih `0 vs 0` — nilai actual real sudah ikut terbawa ke kedua sisi.
`bayReadinessByRecordId()` untuk kedua record kini identik:
`{ status: "missing-data", mismatchCount: 0, missingCount: 18 }` — kedua
sisi bay fisik yang sama sekarang selalu mendapat status yang sama,
sesuai prinsip "1 unit perbandingan" yang diminta user.

**Kesimpulan Angke-Muarakarang (belum match/mismatch, masih "missing-data")**:
audit ini TIDAK menyimpulkan setting sirkuit UGC Angke↔Muarakarang Lama
sudah benar atau salah. Nilai `actual.z1PhPh = 2.5 Ω` itu real (terbaca dari
relay), tapi **tidak ada nilai `tap` atau `distance` (reference) tercatat
sama sekali** untuk sirkuit ini di kedua sisi — jadi tidak ada apa pun untuk
dibandingkan terhadap 2.5Ω itu. Fix hari ini menghentikan false-positive
"match" (yang sebelumnya keliru muncul dari `0 vs 0`) dan menggantinya
dengan status yang jujur: "data belum lengkap, perlu dokumen TAP resmi
sirkuit ini di-input dulu sebelum bisa disimpulkan". Ini murni gap data
sumber, bukan sesuatu yang bisa diperbaiki lewat kode.

**Pembanding kasus yang berhasil penuh — Angke↔Ancol#1/#2** (relay GE MICOM
P545, TAP `LCD_546_ANGKE BAY ANCOL 1,2.pdf`, dokumen sama untuk kedua
sirkuit paralel): `distance` vs `tap` match persis (Z1 0.263 / Z2 0.403 /
Z3 0.951 Ω, t2 0.4s / t3 1.6s), dan `tap` vs `actual` **within-tolerance**
(actual Z1 0.264Ω, selisih 0.001Ω vs toleransi ±0.01Ω) — status readiness
`ready` untuk Ancol#1. Ancol#2 punya `actual` kosong (0) di barisnya sendiri,
tapi karena satu dokumen TAP yang sama juga mencakup Ancol#1, `effectiveSource()`
membawa nilai actual Ancol#1 ke perbandingan Ancol#2 juga — readiness-nya ikut
`ready`, bukan `missing-data`. Ini contoh nyata kenapa merge-per-grup relevan
di luar kasus gap data: dua sirkuit paralel yang secara fisik identik (relay
sama, TAP sama) semestinya memang berbagi kesimpulan readiness yang sama.

**Next step yang disepakati** (bukan dashboard dulu — tetap fokus function-wise):
tuntaskan cakupan Z1-Z3/timer dulu (identifikasi/list bay-bay dengan status
`missing-data` seperti Angke-Muarakarang di atas supaya actionable — mis. jadi
daftar prioritas dokumen TAP yang perlu dilengkapi) sebelum melebarkan audit
ke topik lain (OCR/GFR trafo & penghantar, lalu fungsi tambahan seperti
autoreclose/load blinder yang belum ada di model `RelaySetting` sama sekali).

- Regression: seluruh 13 test suite existing + `npm run build` — semua
  lolos tanpa perubahan (tidak ada test lama yang bergantung pada perilaku
  lama `auditRecordPair`/`isSourceEmpty` per-baris).
- **Yang TIDAK dikerjakan**: tidak menambah test otomatis baru untuk modul
  ini (diverifikasi manual via script debug sekali-pakai, dihapus setelah
  pemakaian, mengikuti kasus nyata Angke-Muarakarang di atas) — kandidat
  test regresi permanen untuk `upt-zone-audit.ts` masih backlog kalau modul
  ini terus dipakai. Tidak mengubah UI wizard (`SettingCaseWizard.tsx`) pada
  slice ini — badge readiness sudah otomatis konsisten karena
  `bayReadinessByRecordId()` dipakai apa adanya, tidak perlu perubahan
  pemanggil.

## Update 2026-07-31 — Bay Readiness Gate di Setting Case Wizard

**Masalah yang dilaporkan user**: alur pembuatan case terasa berat — pilih GI
Angke di wizard, tidak ketemu (topologi belum di-confirm), diarahkan ke Data
Quality Queue, confirm, balik lagi, lalu ketemu gap serupa di Reference
Setting. Semua UPT/GI seakan harus di-confirm manual dulu sebelum bisa
screening/ubah setting sama sekali.

**Root cause**: `SettingCaseWizard.tsx` Langkah 3 (pilih bay) bersumber dari
`INVENTORY_MASTER_CASE_ID` (`case_ultg_dks_inventory`, `lines: []` murni) +
`networkGraphOverrides` — topologi HANYA muncul kalau sudah di-confirm manual
di Data Quality Queue. Padahal data GI Angke sebenarnya sudah lengkap di
`buildGraphForUltg()` (anchor `digsilentLineDb` + overlay LCD/DIST otomatis,
yang sama dipakai `relay-catalog-builder.ts`/Inbox) — wizard cuma tidak
memakainya.

**Cross-validation massal (ide user)**: daripada mewajibkan confirm manual
per-GI, bandingkan otomatis nilai Z1/Z2/Z3 + timer dari tiga sumber yang
sudah ada di tiap `LcdDistRecord` (`distance` = reference engineering, `tap`
= dokumen resmi, `actual` = pembacaan relay terpasang) — modul baru
`src/domain/upt-zone-audit.ts`:
- `auditUptZoneSettings()` membandingkan ketiganya pairwise per zone/timer,
  tolerance sama dengan verifikasi interaktif (`setting-verification.ts`,
  profil "engineering": ±1%/±0.01Ω untuk reach, ±0.01s untuk timer).
- Dua koreksi domain penting setelah diskusi dengan user: (1) nilai `0` di
  Z1/Z2/Z3 diperlakukan sebagai "data belum diisi", bukan setting valid
  (awalnya salah, menghasilkan 644 "mismatch" palsu — actual/tap
  benar-benar kosong, bukan beda nilai); (2) bay tanpa fungsi distance
  (LCD-only, mis. SKTT/underground) dikecualikan dari audit reach —
  Z1-Z3 memang tidak berlaku untuk fungsi itu, sesuai koreksi user.
  Emptiness dicek per-sumber (`z1PhPh === 0` menandai SELURUH sisi kosong,
  bukan per-metrik — terbukti dari data nyata: `t2S=0` selalu berbarengan
  `z1PhPh=0` di sisi yang sama).
- Hasil audit UPT Durikosambi (152 bay berfungsi distance dari 184 total):
  distance vs tap 100% match (0 mismatch); tap/distance vs actual: 404
  match, 110 dalam toleransi, **148 mismatch nyata** (Z1 38, Z2 40, Z3 44,
  t2 2, t3 24), 324 data belum lengkap.
- `bayReadinessByRecordId()` memetakan tiap `LcdDistRecord.id` ke status
  `ready` / `mismatch` / `missing-data` / `no-distance-function`.

**Wizard sekarang** (`SettingCaseWizard.tsx`):
- Langkah 3 bersumber dari `buildGraphForUltg()` (union semua
  `GraphBuildGroup`), bukan lagi `INVENTORY_MASTER_CASE_ID`/override manual
  — bay yang topologinya sudah resolvable dari DIgSILENT langsung muncul
  dan bisa dipilih.
- Tiap baris bay menampilkan badge readiness inline (dari
  `bayReadinessByRecordId` + `overlaySettingDocs().matchedBayId`): "Siap"
  (hijau), "Mismatch" (kuning), "Data belum lengkap" (abu-abu), atau "Perlu
  mapping" (merah, untuk `needsManualTopology: true` — situs pasca-2021
  tanpa anchor sama sekali).
- Setelah bay dipilih, panel detail menjelaskan status itu secara eksplisit
  (termasuk tombol "Buka Data Quality Queue" untuk kasus `needsManualTopology`)
  — bukan silent fail yang baru terlihat di tahap berikutnya.
- Field `protectedScope.networkCaseId` tetap `INVENTORY_MASTER_CASE_ID` untuk
  kompatibilitas validasi `case-baseline.ts` (yang mengecek terhadap
  `NETWORK_CASES` lama) — perubahan ini murni soal SUMBER bay picker, bukan
  identitas case.
- Verifikasi bundle size: main bundle tetap ~613 kB (tidak regresi) karena
  `SettingCaseWizard` hanya diimpor dari `CaseWorkQueueView` yang sudah
  lazy-loaded — pola sama dengan `InboxView.tsx` yang sudah lebih dulu
  memanggil `buildGraphForUltg()` dengan aman.
- Diverifikasi end-to-end di browser (Playwright): cari "angke" di Langkah 3
  sekarang langsung menampilkan 4 bay dengan badge readiness masing-masing,
  tanpa perlu mampir ke Data Quality Queue dulu.
- Regression baru: seluruh 13 suite existing tetap lolos (tidak ada test
  baru untuk UI wizard — dicek manual via Playwright).
- **Yang TIDAK dikerjakan**: dashboard/halaman ringkasan 148 mismatch
  (sengaja ditunda — fokus sesi ini pada alur gate, bukan pelaporan).
  Gate ini murni informatif (badge + pesan), belum jadi hard block yang
  mencegah `handleCreate` — user tetap bisa lanjut membuat case meski
  statusnya mismatch/missing-data, karena itu sendiri bisa jadi alasan
  valid membuat case (mis. P1 crosscheck untuk menindaklanjuti temuan).

## Update 2026-07-31 — Lapis 3: CoverageView/VerifiedReportView Graph-Aware + Relay Data Nyata

Migrasi consumer (lapis 3 dari 3) yang sebelumnya jadi backlog di lapis 2.
Sekaligus menutup gap "belum ada data relay nyata untuk didemokan" dengan
menyambungkan dua sumber data yang sudah ter-index tapi belum pernah dipakai
untuk mengisi `UnifiedNetwork.relayIeds`/`relaySettings`.

**Migrasi UI:**
- `VerifiedReportView.tsx` — `runCoordinationChecks(topology, corridor, ...)`
  diganti `runGraphCoordinationChecks(networkGraph)`; `networkGraph` (sudah
  dihitung di file ini untuk keperluan lain) dipakai langsung, tidak perlu
  hitung ulang. State `topology`/`corridors`/`activeCorridorId`/
  `getEffectiveRelay` yang tidak lagi dipakai dihapus.
- `CoverageView.tsx` — diagnostics sekarang dari `runGraphCoordinationChecks`
  atas `UnifiedNetwork` yang sama dipakai `CalculationView`, bukan lagi
  `runCoordinationChecks` atas `Topology`/`Corridor` lama. `CorridorDiagram`
  (visual d3, ~630 baris, sumbu-x km linear) **sengaja tidak dimigrasikan**
  sesuai keputusan scope — tetap dipakai apa adanya, dengan label eksplisit
  di UI: *"Diagram visual ini masih pakai model legacy ... belum
  graph-aware. Diagnostics di bawah sudah berjalan di atas
  UnifiedNetwork/RelaySetting"*.
- `DiagnosticsPanel.tsx` — tipe prop diganti dari `Diagnostic` (domain/types.ts)
  ke `GraphDiagnostic` (lib/graph-coordination.ts); field `affected_zones`
  (snake_case) jadi `affectedZones` (camelCase).
- Kedua view menampilkan pesan eksplisit *"Belum ada RelaySetting ... jadi
  coordination diagnostics belum bisa dihitung"* saat `relaySettings` kosong
  — bukan tampilan kosong yang membingungkan.

**Data relay nyata (builder baru):**
- `src/domain/relay-catalog-builder.ts` — `buildRelayIedsFromCatalog()`
  memetakan asset dari relay catalog (555 aset ter-index dari workbook UPT
  Durikosambi) ke `RelayIED`, HANYA untuk asset berstatus
  `digsilentMatch.status === "matched"` (45 dari 555 — sudah dikonfirmasi
  pasti oleh matcher katalog sendiri, bukan `"candidate"` yang masih ambigu).
  Jembatan: `matchedRow` (baris di `digsilentLineDb`) → `LineRelation.id`
  format `anchor_line_{row}`, sisi bay ditentukan dari kecocokan nama
  substation asset vs `LineRelation.fromSubstationId`/`toSubstationId`.
- `src/domain/relay-setting-builder.ts` — fungsi baru
  `buildRelaySettingsFromOverlays()`, jalur kedua (selain
  `buildRelaySettingsForNetwork` dari lapis 1) yang bekerja dari
  `OverlayRecord[]` hasil `overlaySettingDocs()` — cocok untuk pipeline
  `graph-builder.ts` yang tidak punya representasi `NetworkNode`/`NetworkLine`
  lama. Mencocokkan `RelayIED.bayId` ke `OverlayRecord.matchedBayId`, lalu
  ambil Z1/Z2/Z3 dari `LcdDistRecord` asli via `sourceId`.
- `buildCaseFromGraphGroups()` (`graph-builder.ts`) sekarang memanggil
  keduanya secara berantai: anchor topology → `relayIeds` dari catalog →
  `relaySettings` dari overlay LCD/DIST — bukan lagi `relayIeds: []` statis.
- **Hasil nyata untuk demo seed** (`case_dks_dm_pik_mkb` /
  `study_dksbi_dnmgt`): 10 `RelayIED` (ABB RED670, REF615, MiCOM P142,
  Alsthom LFAA 101 — data asli, bukan sintetis) dan **10/10 RelaySetting**
  dengan Z1/Z2/Z3 dari dokumen TAP resmi (`official tap setting proteksi
  sutt durikosambi - daan mogot ..._rev01.pdf`). Sebelumnya kedua field ini
  selalu 0.
- Regression baru: `scripts/test-relay-catalog-builder.ts` /
  `npm run test:relay-catalog-builder` — membuktikan kasus nyata (ABB RED670
  di `anchor_line_359`) resolve benar, tidak ada dangling reference/id
  duplikat, dan tidak ada asset `"candidate"`/`"unmatched"` yang ikut
  difabrikasi.
- Fix kecil: `network-graph.ts`'s `NETWORK_GRAPH_DKS_PIK` cast diubah dari
  `as UnifiedNetwork` ke `as unknown as UnifiedNetwork` — TypeScript menolak
  cast langsung begitu field `relaySettings` (tuple `zones` 3-elemen ketat)
  masuk ke JSON precompute, karena tipe JSON widened tidak sufficiently
  overlap dengan tipe tuple ketat.
- `npm run generate:demo-seed` dijalankan ulang untuk merefresh
  `demo-corridor-seed.json` dengan builder baru ini.
- **Yang TIDAK dikerjakan**: `CorridorDiagram.tsx` (visual d3) tetap belum
  graph-aware — keputusan scope eksplisit, dicatat di UI. `ZoneParameterPanel.tsx`/
  `RXPlaneModal.tsx` juga belum disentuh (masih baca `Relay`/`getEffectiveRelay`
  lama) — keduanya cukup independen dari model corridor sehingga migrasinya
  terpisah dan lebih kecil, belum diprioritaskan sesi ini. Gate stage
  `coordination` di `setting-case.ts` juga sengaja TIDAK dibuka — beda dari
  `calculation` (Sprint 5), belum ada definisi "exit criteria" yang jelas
  untuk coordination (mis. apakah cukup semua diagnostics `error`-severity
  clear, atau butuh attestation manual) — itu keputusan governance terpisah.
- Regression: seluruh 13 test suite + `npm run build` — semua lolos.

## Update 2026-07-31 — Lapis 2: Algoritma Graph-Aware di graph-coordination.ts

- File baru `src/lib/graph-coordination.ts` — port dari nol atas
  `corridor-math.ts`/`coordination-checks.ts`, beroperasi di `UnifiedNetwork`/
  `RelaySetting` (bukan `Topology`/`Corridor`/`Relay` lama).
- `walkGraphReach(network, startLineId, zoneXReachOhm)` — reach diukur sebagai
  ohm terkonsumsi (bukan posisi km di corridor linear). Ketika reach line
  sendiri habis dan masih tersisa, mencari `RemoteBusBranch[]` di remote bus
  line itu.
- `selectGoverningBranch(branches, network)` — memilih cabang dengan `xOhm`
  **terbesar** (bukan cabang pertama), sesuai prinsip zone-3 setting practice
  yang sudah dicatat di komentar `RemoteBusBranch` (`unified.ts`): cabang yang
  paling mungkin under-covered adalah yang harus jadi acuan. Walk lanjut
  menembus (multi-hop) sampai reach habis, kandidat itu sendiri habis, atau
  tidak ada data topologi lebih jauh (`ranOutOfData: true` — dibedakan
  eksplisit dari `exhausted: true`, tidak lagi diam-diam clamp ke 0 seperti
  versi lama).
- `runGraphCoordinationChecks(network)` — port kelima check dari
  `coordination-checks.ts`: Z1 under/over-reach, Z2 short/over-reach, Z2 timer
  sanity, Z2/Z3 margin (semua murni per-relay/per-line-sendiri, tidak butuh
  traversal), plus backup-gap dan time-race lintas relay (butuh
  `selectGoverningBranch` untuk menemukan relay downstream yang relevan).
- Regression baru: `scripts/test-graph-coordination.ts` /
  `npm run test:graph-coordination` — fixture bercabang nyata (line A→B 5 ohm,
  remote bus B punya 2 kandidat: line lanjutan B→C 3 ohm dan trafo 15 ohm).
  Membuktikan: governing branch memilih trafo bukan cabang pertama/array
  order; multi-hop reach menembus dari line ke trafo; `ranOutOfData`
  terdeteksi benar saat reach melebihi total data yang diketahui atau saat
  tidak ada `RemoteBusBranch` sama sekali; diagnostics Z1_OVERREACH dan
  BACKUP_GAP muncul sesuai skenario.
- **Belum disambungkan ke UI apa pun.** `CoverageView.tsx`, `CorridorDiagram.tsx`,
  `VerifiedReportView.tsx` semuanya tidak diubah — masih membaca
  `Relay.zones`/`Corridor` lama seperti sebelumnya. Tidak ada builder yang
  mem-populate `relaySettings` dari data nyata (LCD/DIST import, dsb).
  Migrasi consumer (lapis 3) masih pekerjaan terpisah.
- Regression: `npm run build`, `npm run test:graph-coordination`, plus seluruh
  suite lama (`test:reference`, `test:verification`, `test:vendor-import`,
  `test:relay-catalog`, `test:engineering-data`, `test:engineering-change`,
  `test:setting-case`, `test:p545-input-contract`) — tidak ada regresi.

## Update 2026-07-31 — Fix: GI/GISTET Multi-Level-Tegangan Hilang di Graph Builder

- **Temuan**: relasi Durikosambi-Kembangan seharusnya ada 4 raw record di
  `digsilentLineDb` (2×150kV kabel `KBNGN-DKSBI-1/2`, 2×500kV OHL
  `DKSBI-KMBGN1/2`), tapi graph builder sebelumnya cuma menghasilkan
  sebagian atau nol — DIgSILENT menamai bagian per-level-tegangan suatu GI
  dengan suffix angka tunggal di akhir nama (`DKSBI7` = sisi 500kV
  Durikosambi, `KEMBANGAN5` = sisi 150kV Kembangan), dan
  `stationNameMatches`/`buildAnchorTopology` tidak punya penanganan untuk
  pola ini — nama itu gagal token-match ke scope SLD manapun (`GISTET
  DURIKOSAMBI`, `GISTET KEMBANGAN`), sehingga line yang kedua ujungnya sama
  sekali tidak match discope di-skip total.
- **Root cause voltase**: awalnya dicoba memetakan digit suffix langsung ke
  kV (7→500, 5→150, 4→70) berdasar pola nama — tapi ini rapuh untuk
  disambiguasi scope (shortcode heuristik `extractDigsilentShortCodes` tidak
  stabil untuk semua GI). Pendekatan final: baca voltase langsung dari
  `record.type` tiap line (mis. `"OHL-500kV-ACSR..."` — 1180/1183 record
  parseable) sebagai fakta teknis dari sumber data, bukan tebakan dari nama.
  `parseLineVoltageKv()` di `graph-builder.ts`.
- **`resolveScopedForRecord()`** (baru, `graph-builder.ts`): coba token-match
  dulu (`stationNameMatches`, dengan suffix di-strip), fallback ke
  pencocokan shortcode (`DKSBI` → shortcode GI Durikosambi) kalau token match
  gagal total; kalau voltase record != 150kV dan scope hasil match bukan
  GISTET, redirect ke scope GISTET yang berbagi kata signifikan dengan scope
  hasil match — itu level-tegangan lain di situs fisik yang sama.
- **Bug turunan yang ditemukan & diperbaiki selama proses**:
  - Dedup key `ensureSubstation` diganti dari `normalizeStationName` (fuzzy,
    bisa collision antara GI 150kV dan GISTET 500kV yang fuzzyKey-nya sama)
    ke `scoped.identityKey` (mempertahankan token GI/GIS/GISTET, jadi tetap
    unik).
  - **Bug kritis**: `isAliased` (cek `DIGSILENT_TO_SLD_ALIAS`) sempat
    dicek terhadap `key` yang baru (`scoped.identityKey`), padahal alias
    table diindeks oleh `normalizeStationName(digsilentName)` — ini membuat
    SEMUA alias (termasuk yang sudah lama ada: "M. KARANG LAMA", "M. KARANG
    BARU", "GROGOL II") diam-diam berhenti ter-redirect ke nama tampilan SLD
    yang benar, menampilkan nama mentah DIgSILENT 2021 alih-alih. Diperbaiki
    dengan mengecek `normalizeStationName(digsilentName)` langsung, bukan
    `key`.
  - `voltageKv` di `UnifiedSubstation` sebelumnya hardcode `150` untuk semua
    substation; sekarang diambil dari voltase yang benar-benar teramati pada
    record yang menyentuhnya (`observedVoltageKv` map).
- Regression baru: `scripts/test-graph-builder-voltage-suffix.ts` /
  `npm run test:graph-builder-voltage-suffix` — memverifikasi 4 record
  Durikosambi-Kembangan-Gandul dengan voltase benar, dan GI 150kV vs GISTET
  500kV tetap 2 substation terpisah.
- `npm run generate:demo-seed` dijalankan ulang untuk merefresh
  `demo-corridor-seed.json` dengan perbaikan ini (4 substation demo seed
  kembali resolve dengan benar, termasuk "GIS Muarakarang Baru" yang sempat
  ikut kena bug `isAliased` di atas).
- **Yang TIDAK dikerjakan**: Muarakarang (GI Muarakarang Baru — situs ketiga
  hasil migrasi) tetap `needsManualTopology: true` karena memang belum ada
  di snapshot digsilentLineDb 2021 — ini bukan bug, sesuai catatan README
  soal 6 site pasca-2021 yang butuh input topologi manual.
- Regression: seluruh 12 test suite + `npm run build` — semua lolos.

## Update 2026-07-31 — Fondasi Tipe RelaySetting (lapis 1 migrasi Coverage)

- Menambahkan `RelaySetting`, `DistanceZoneSetting`, `LoadEncroachmentSetting`
  ke `src/domain/unified.ts`, plus field opsional `relaySettings?` di
  `UnifiedNetwork` — rumah bertipe pertama untuk Z1/Z2/Z3 reach/timer yang
  terikat ke `RelayIED.id`, mengikuti pola `transformers?`/`remoteBusBranches?`
  yang sudah ada.
- Alasan: sebelum `corridor-math.ts`/`coordination-checks.ts` (masih 1D linear,
  model `domain/types.ts`) bisa di-port jadi graph-aware, tidak ada tempat
  bertipe untuk data zone di model graph baru — `RelayIED` tidak punya field
  zone, `SettingRecord.values` adalah bag untyped. Ini prasyarat, bukan
  penyelesaian: belum ada builder yang mem-populate `relaySettings`, dan
  `CoverageView.tsx`/`CorridorDiagram.tsx`/`VerifiedReportView.tsx` semuanya
  masih membaca `Relay.zones` (tipe lama) seperti sebelumnya — tidak berubah
  sama sekali pada slice ini.
- Sengaja dipisah jadi lapis kecil: lapis 2 (port algoritma branching-aware di
  corridor-math) dan lapis 3 (migrasi consumer) adalah pekerjaan besar
  terpisah, dicatat sebagai backlog di README.
- Regression: `npm run build`, `npm run test:engineering-data`,
  `npm run test:engineering-change`, `npm run test:vendor-import`.

## Update 2026-07-31 — Sprint 5: Buka Gate Calculation di Setting Case

- `calculation` ditambahkan ke `EXECUTABLE_SETTING_CASE_STAGES`
  (`src/domain/setting-case.ts`); `stageGate` sekarang menolak lanjut ke
  `coordination` sampai minimal satu Calculation Run ter-link ke case.
- `SettingCaseDetail.tsx` menambahkan `STAGE_TOOL.calculation`, membuka
  Calculation Workbook dari dalam case dengan line context (`protectedScope.subjectLineId`)
  otomatis ter-set lewat `selectLine()`.
- `CalculationView.tsx` mendeteksi Setting Case yang `protectedScope.subjectLineId`-nya
  cocok dengan line aktif, menampilkan badge case tersebut, dan memanggil
  `linkToSettingCase(caseId, { kind: "calculation", refId })` setelah snapshot
  disimpan — berlaku untuk distance workbook maupun OCR/GFR workbook.
- Navigasi: `AppShell.tsx` menampilkan breadcrumb "Dibuka dari Case ..." saat
  tool POC dibuka lewat tombol case, dengan tombol kembali; navigasi sidebar
  manual clear breadcrumb ini (`openedFromCaseId` di store, transient/tidak
  di-persist).
- Yang TIDAK berubah: formula kalkulasi itu sendiri masih POC lama (distance +
  OCR/GFR); MVP 2B.2 formula parity P545 masih pekerjaan terpisah. Coordination
  dan tahap setelahnya masih locked.
- Regression: `npm run build`.

## Update 2026-07-30 - Cek Setting: Bay Context & Scanned TAP OCR

- OCR/GFR penghantar sekarang wajib memilih bay setting dari database UPT, bukan hanya memilih GI dan jenis bay.
- Registry OCR dan LCD/DIST diregenerasi dari `Data Setting Penghantar UPT DKSBI (1).xlsx`: 183 record OCR/GFR dan 184 record LCD/DIST.
- Cek Setting dapat memilih baseline `Setting database` atau `Engineering calculation`; baseline database menyimpan row sumber, relay, dan status issued/installed.
- PDF scan memakai OCR 3x dengan crop, contrast normalization, sparse-text pass, dan table pass. Line break dipertahankan untuk semantic parsing.
- Heuristik MiCOM membaca distance reach/timer serta format P142 `I>1 Current Set`, `I>1 TMS`, `IN1>1 Current`, dan `IN1>1 TMS`.
- `Bay Angke arah Ancol.PDF` tervalidasi terhadap database:
  - OCR/GFR database: `5.150 A / 0.420` dan `0.850 A / 0.685`.
  - Distance database: `Z1 0.263`, `Z2 0.403`, `Z3 0.951 ohm`; timer `0 / 0.4 / 1.6 s`.
- Document identity review menampilkan nomor dokumen, GI/bay, model relay, fungsi proteksi, dan warning bila model PDF berbeda dari aset database terpilih.
- Regression: `npm run test:verification`, `npm run test:reference`, `npm run test:relay-catalog`, dan `npm run build`.

## Update 2026-07-30 — MVP 2B.1 P545 Input Contract

- Menambahkan `plms.p545-input-contract.v1` untuk pilot Ciledug → Alam Sutera #1.
- Input memiliki tipe, unit primary/secondary yang eksplisit, source reference, locator, capture timestamp, snapshot/scenario id bila tersedia, dan status `resolved/conflict/missing/blocked/overridden`.
- Fault lookup wajib melalui `StudyScenario`; tanpa scenario, input gangguan diblokir.
- Konflik relay MiCOM P543 vs label XMCD P545 serta `Ihs3f` Mathcad 26,24 kA vs historical IHS 33,22 kA dipertahankan sebagai kandidat terpisah.
- CCC 1.428 A dan rating konduktor 1.860 A dimodelkan sebagai dua parameter berbeda, bukan false conflict.
- Calculation UI menampilkan source/gap matrix dan justified override session dengan actor/timestamp; formula calculation belum dijalankan pada slice ini.
- Regression: `npm run test:p545-input-contract`.
