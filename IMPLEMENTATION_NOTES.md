# Implementation Notes

Changelog harian untuk perubahan yang sudah benar-benar masuk kode. Untuk arah
arsitektur dan roadmap produk, rujuk:

- [`BUSINESS_PROCESS_BLUEPRINT.md`](./BUSINESS_PROCESS_BLUEPRINT.md) — blueprint
  proses bisnis dan lifecycle `Setting Case` yang jadi acuan target saat ini.
- [`README.md`](./README.md) — MVP roadmap, status implementasi per tahap, dan
  demo flow.

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
