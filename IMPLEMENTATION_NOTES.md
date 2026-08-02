# Implementation Notes

Changelog harian untuk perubahan yang sudah benar-benar masuk kode. Untuk arah
arsitektur dan roadmap produk, rujuk:

- [`BUSINESS_PROCESS_BLUEPRINT.md`](./BUSINESS_PROCESS_BLUEPRINT.md) — blueprint
  proses bisnis dan lifecycle `Setting Case` yang jadi acuan target saat ini.
- [`README.md`](./README.md) — MVP roadmap, status implementasi per tahap, dan
  demo flow.

Documentation ownership:

- `BUSINESS_PROCESS_BLUEPRINT.md` is normative: target process, authority,
  invariants, lifecycle, roles, and staged architecture.
- `README.md` is navigational: product boundary, current status, demo scope, and
  the next ordered slices. It must not duplicate detailed transaction rules.
- `IMPLEMENTATION_NOTES.md` is evidentiary: chronological code changes, tests,
  migrations, limitations, and defects that actually exist. Planned behavior is
  recorded here only when explicitly labelled as not implemented.

## Update 2026-08-03 - SSOT-2A governed data contract

- `src/domain/ssot-governance.ts` introduces the persistence-neutral contract
  that future local repositories and backend databases must preserve. It covers
  stable canonical entity references, explicit authority domains, source
  observations, typed line/CT-VT/relay-installation/topology/setting payloads,
  immutable governed revisions, field-level Data Change Proposal, and atomic
  activation outcomes.
- `DEFAULT_DATA_AUTHORITY_MATRIX` distinguishes external asset identity,
  validated topology, approved electrical data, reviewed vendor capability,
  PLMS-issued setting, physical relay readback, and controlled source documents.
  Evidence/extraction never promotes itself into active data.
- `resolveEffectiveRevision()` fails closed when more than one active revision
  applies to the same entity and instant. It does not use array order or a
  latest-row heuristic.
- Approval now has an executable contract separate from activation. The creator
  cannot approve their own proposal; approval produces `approved`/`scheduled`
  state while the prior active revision remains effective.
- `activateApprovedProposal()` validates proposal/revision/entity binding,
  activation-policy trigger, commissioning evidence, planned effective time,
  and active-baseline drift. Success activates the new revision, closes and
  supersedes the former revision, and emits a `DataActivationEvent` in one
  returned transaction payload.
- Regression `test:ssot-governance` covers reconductoring and relay replacement.
  Relay replacement versions the stable bay/role installation position; the old
  and new physical `RelayIED` identities are retained rather than overwritten.
- This slice is not yet wired into Zustand or Asset Explorer and does not create
  a production database. SSOT-2B will create governed proposals from the case/UI;
  SSOT-2C adds the repository boundary; SSOT-2D implements backend persistence,
  locking, migration, API, and RBAC after those contracts stabilize.

## Update 2026-08-02 - SSOT-1 Asset & Setting Explorer

- Menu `Data Teknis` direstruktur menjadi read-only `Asset & Setting Explorer`.
  Dense line/bay grid mempertahankan kemampuan scan/filter ala spreadsheet,
  sedangkan panel Asset 360 menggabungkan identity, endpoint, relay/CT-VT,
  typed setting, normalized SettingRecord, provenance, quality issue, dan open
  Setting Case dalam satu konteks.
- Explorer bukan database kedua. `buildAssetSettingExplorer()` adalah read model
  deterministik dari confirmed `UnifiedNetwork`, store override, governed case,
  dan source intake. Tidak ada edit active master dari workspace ini.
- ANGKE–ANCOL circuit 1 dipakai sebagai production vertical slice pertama dan
  diselesaikan dari confirmed master, bukan fixture UI. Regression mengunci
  stable LineRelation ID, dua endpoint, relay/setting, evidence, quality, search,
  dan case linkage.
- Geographic map dan full-network SLD belum dibuka. Tahap berikutnya setelah
  projection parity adalah controlled data update; topology neighborhood view
  baru dibangun dari authority yang sama setelah itu.

## Update 2026-08-02 - Baseline freeze tidak lagi mengunci audit/readback

- Model evidence dipisah menjadi dua lifecycle: `baseline evidence` yang ikut
  snapshot dan immutable setelah freeze, serta `change evidence` yang boleh
  ditautkan setelah freeze untuk mendukung Proposed Data Revision. Penambahan
  change evidence tidak menulis ulang fingerprint atau isi frozen baseline.
- Source Index kini menjelaskan bahwa upload saat Scoping bersifat opsional,
  memberi label/lock pada source yang sudah menjadi baseline evidence, dan
  memperlakukan source baru setelah freeze sebagai change evidence. Proposed
  Data Revision membaca seluruh source yang ter-link ke case, bukan hanya source
  yang kebetulan sudah tersedia sebelum freeze.
- `Scoping -> Baseline Frozen` sekarang membekukan current working network dan
  technical data tanpa mensyaratkan TAP/readback lebih awal. Dokumen tersebut
  merupakan input stage `Document Audit` atau `Actual Readback Intake`, bukan
  prasyarat transaksi freeze.
- Register setting yang sudah tersedia di scoped relay dipakai sebagai binding
  issued setting case-local. Bila belum ada register maupun TAP, freeze tetap
  berhasil dengan warning `issued-setting-evidence-missing`; hasil expected vs
  actual belum boleh dinyatakan lengkap sampai authority setting tersedia.
- Baseline kini ikut menyimpan scoped `relaySettings`, `settingRecords`, trafo,
  dan remote-bus branch. Network dan technical revision POC yang belum punya
  backend revision diberi ID case-local eksplisit dan tidak dibiarkan kosong.
- UI preflight memisahkan blocker transaksi dari warning readiness. Missing TAP,
  multiple evidence, atau topology master yang belum sempurna tidak lagi membuat
  tombol freeze mati tanpa mencoba working network; error subject konkret tetap
  ditampilkan oleh transaksi domain.
- Regression `test:case-baseline-flow` mengunci jalur nyata store:
  `scoping -> baseline_frozen -> document_audit -> verification` tanpa
  pre-freeze TAP, termasuk attach/unlink change evidence setelah freeze tanpa
  memutasi baseline.

## Update 2026-08-02 - Live P545 Targeted Calculation Run (2B.4 pilot)

- Frozen baseline network diperluas sampai dua-hop secara deterministik agar
  kebutuhan adjacent dan second-forward Distance tidak membaca topology live
  setelah baseline dibekukan.
- Adapter P545 me-resolve input dari frozen baseline, latest proposed revision,
  compatible scenario, versioned policy, dan justified engineering override.
  Missing/conflict critical input tetap fail-closed.
- Reason-driven matrix menentukan block yang benar-benar dieksekusi. Auxiliary
  calculation mengisolasi input per affected block sehingga carry-forward kZ0,
  misalnya pada CT replacement, tidak memerlukan R0/X0 atau menghasilkan output
  residual baru.
- Immutable `TargetedCalculationRun` menyimpan baseline/proposal/scenario
  fingerprint, rule version, input provenance, override evidence, output,
  before/proposed comparison, trace, actor, timestamp, dan content fingerprint.
- Store mengaitkan run ke Setting Case dan Audit Trail. Gate Calculation hanya
  menerima targeted run; snapshot formula-lab legacy tetap reference evidence.
  Run yang valid membuka stage Coordination.
- Calculation UI menampilkan input-resolution contract, blocker, field override
  beserta reason/evidence, tombol proposed run, fingerprint, dan output per
  affected block. Legacy snapshot tetap disabled.
- Regression `test:p545-case-execution` mencakup fail-closed input, lima affected
  block rekonduktoring, CT carry-forward isolation, immutable store link, dan
  pelepasan gate `Calculation -> Coordination`.

## Update 2026-08-01 — Active Study mengikuti bay/line, tanpa fallback demo

- Data Quality Queue dari sidebar sekarang berhenti di landing Case/Study cards;
  HEL mapping, functional drift, dan row registry global hanya dimuat secara
  visual setelah user memilih drill-down `Registry queues`. Badge topology
  menyebut eksplisit jumlah yang `perlu keputusan`, bukan angka tanpa konteks.
- Scoping case menyediakan CTA `Dokumen Sumber`. Source yang di-stage dari
  konteks tersebut otomatis memakai id Setting Case dan langsung ditautkan ke
  `sourceIntakeIds`; topology-ready tetapi evidence kosong ditampilkan sebagai
  dua status berbeda agar gate baseline tidak terlihat kontradiktif.
- Topology Remediation menutup loop dengan CTA kembali ke Case Gate dan
  menjelaskan bahwa freeze baseline memang tetap menjadi transaksi Setting
  Case. Bay picker mengoleksi graph entity unik berdasarkan id (bukan flat-map
  duplikat dari kedua endpoint group) serta menampilkan `sirkit #N` dan relation
  id; regression mengunci pemisahan ANGKE–ANCOL #1 dan #2.
- Data Quality Queue tidak lagi merender bulk-confirm seluruh GI. Topology
  Remediation sekarang dikelompokkan sebagai card per Setting Case/Study,
  kemudian card per kandidat `LineRelation`; approve/reject disimpan dengan
  key case/study + relation dan hanya payload endpoint/bay relation tersebut
  yang dipromosikan. Membuka remediation dari Setting Case otomatis membatasi
  queue ke scope case itu. Jika tidak ada kandidat, UI meminta source endpoint
  + circuit dan tidak menawarkan relasi tebakan.
- Detail Setting Case menampilkan `Topology readiness` sebelum stage chain:
  siap bila subject/endpoint sudah berada pada confirmed master dan tidak ada
  candidate card pending/rejected; selain itu tombol membawa engineer langsung
  ke remediation workspace yang terisolasi untuk case tersebut.
- Runtime engineering sekarang punya satu authority: confirmed master graph
  (`getConfirmedMasterNetwork`). Demo `case_dks_dm_pik_mkb` tetap boleh hidup
  sebagai fixture/historical benchmark, tetapi tidak lagi menjadi default atau
  fallback untuk Home, Master Data, Setting Register, Working Network,
  Calculation, Coverage, dan Verified Report.
- `selectLine` hanya menerima `LineRelation` yang ada di confirmed master.
  `ensureStudyForLine` mengaktifkan Study existing atau membuat Study baru dari
  subject line X–Y dengan scope satu-hop. Bila relasi belum tersedia, UI
  meminta konfirmasi/update melalui Graph Builder dan tidak memilih koridor
  lain secara diam-diam.
- `deriveStudyNetwork` memproyeksikan frozen Study scope dari master graph,
  mempertahankan provenance/fingerprint, dan mengeluarkan blocker untuk Study
  tanpa subject, relation yang hilang/rejected/superseded, atau impedansi yang
  belum tersedia.
- Store baru mulai tanpa seeded Active Study. Migrasi v25 menghapus seed Study
  demo lama dari persisted state dan mengembalikan network context ke master.
- Coverage legacy 1D corridor dilepas dari jalur kerja utama; diagnostics kini
  hanya berjalan atas graph Study yang dipilih user.
- Regression baru `test:study-network` mengunci tiga hal: master tidak boleh
  resolve ke demo corridor, arbitrary confirmed line menghasilkan graph Study,
  dan missing relation harus fail closed. Build produksi serta regression
  graph-coordination, graph-builder, dan Setting Case lulus.

## Update 2026-08-01 — D1/O1 takeover: confidence, HEL population, dan closed-loop crosscheck

- Confidence Graph Builder dipisah menjadi indikator topology authority,
  electrical completeness, setting-overlay coverage, evidence count,
  reciprocal evidence, dan freshness. Dadap serta Ulujami menjadi
  `corroborated_candidate`; keduanya tetap di luar live graph sampai engineer
  menekan confirm. GI Muarakarang Baru tetap `identity_conflict` dan tidak
  dapat dipromosikan sambil menunggu topology resmi/TAP baru.
- Foundation-health backlog ditutup: Active Study membaca Zustand Studies,
  Source Index merge inventory master, scope Study berubah hanya melalui
  revision eksplisit, dan SLD Endpoint menjadi evidence-only menuju Graph
  Builder (tidak lagi menjadi topology authority kedua).
- HEL_PHT_TAP kini punya consumer UI dan typed population. Mapping yang valid
  membentuk `SettingRecord` dan `RelaySetting`; record hanya dibuat bila
  LineRelation, RelayIED, dan ProtectionFunction DIST konkret tersedia sehingga
  tidak ada dangling reference.
- Adapter RIO/XRIO tersambung ke Vendor Import dan semantic crosscheck.
  Authority actual readback membutuhkan device identity, active setting group,
  official vendor tool + version, waktu Read from IED, dan SHA-256 file.
  File tanpa manifest tetap `derived_candidate`.
- Crosscheck case sekarang menjalankan gate `document_audit` atau
  `actual_readback_intake`, lalu `verification` sampai `closed`. Mismatch dan
  missing actual wajib mendapat disposition sebelum Verification Run dapat
  disimpan dan ditautkan ke case.
- Regression: seluruh 14 `test:*` script dan `npm run build` lolos.

## Update 2026-08-01 — Fix: Konteks GI Tidak Mengikuti Kerja User (Study/Network Builder Nyangkut ke Demo Case)

**Konteks**: menindaklanjuti temuan sesi sebelumnya (entri "Batch-confirm" di
bawah) bahwa Study/Working Network selalu balik ke demo case lama
("DKS-DM-PIK-MKB") walau user sedang mengecek GI lain. Riset arsitektur
menyeluruh (subagent Explore + verifikasi manual per file) menemukan bahwa
ini BUKAN dua sistem topologi yang terpisah total — 8 dari 10 view consumer
(`NetworkModelView`/Working Network, `StudyDashboardView`, `StudyWizard`,
`CalculationView`, `CoverageView`, `VerifiedReportView`, `LineRegistryView`,
`MasterDataView`) sudah benar melakukan merge `getEffectiveNetworkGraph` +
`mergeMasterRelationsIntoCase` terhadap `INVENTORY_MASTER_CASE_ID`. Masalah
sebenarnya adalah 4 celah propagasi konkret:

1. **`NetworkGraphEditorView.tsx` ("Network Builder")** tidak pernah
   memanggil `mergeMasterRelationsIntoCase` sama sekali — satu-satunya view
   yang tidak melihat hasil konfirmasi Graph Builder yang tersimpan di
   master inventory override. Case-picker-nya juga di-filter ke
   `scope === "corridor"`, yang secara struktural mengeklusi
   `INVENTORY_MASTER_CASE_ID` dari daftar pilihan.
2. **`createStudy` (`useProsetStore.ts`)** unconditionally hardcode
   `activeNetworkCaseId: "case_dks_dm_pik_mkb"` pada setiap Study baru,
   apa pun GI/line yang sebenarnya jadi subjek Study itu. Self-correct hanya
   terjadi kalau `subjectLineId` diisi (lewat `selectLine`), dan bahkan itu
   race dengan `set({ currentTab: ... })` yang jalan sinkron tepat sesudahnya
   karena `selectLine`'s fallback branch (`import()` dinamis) bersifat async
   sementara pemanggilnya fire-and-forget.
3. **`SettingCaseDetail.tsx`'s `openTool()`** hanya memanggil `selectLine`
   kalau `protectedScope.subjectLineId` terisi. Untuk tipe case tanpa
   subject line wajib (`new_gi_insertion`, `topology_change`,
   `policy_revision`, `data_correction`, `other`) — justru tipe case yang
   paling berkaitan dengan "sedang kerja di topology GI ini" — membuka
   Working Network/Network Builder dari case itu tidak menyentuh
   `activeNetworkCaseId`/`activeNetworkLineId` sama sekali.
4. **`confirmGraphBuildGroup`/`confirmGraphBuildGroupsBatch`** tidak pernah
   men-set `activeNetworkCaseId`/`activeNetworkLineId` — confirm GI cuma
   menulis ke `networkGraphOverrides`/`graphBuildDecisions`. Tidak ada
   langkah "user baru confirm GI X, maka context kerja sekarang GI X" di
   mana pun.

**Fix**:
- `NetworkGraphEditorView.tsx`: tambah merge master inventory (pola identik
  `NetworkModelView.tsx:75-89`, bukan diimplementasi ulang), dan case-picker
  sekarang menampilkan semua `NETWORK_CASES` termasuk
  `INVENTORY_MASTER_CASE_ID` (diberi label eksplisit "(master inventory)").
- `selectLine` (`useProsetStore.ts`) diubah signature-nya jadi
  `Promise<void>` (dari `void`) — fallback branch (`import()` dinamis ke
  `graph-builder.ts`, sengaja dinamis demi bundle size, lihat komentar di
  atas import) sekarang di-`await`, bukan fire-and-forget. Semua 8+ caller
  existing aman karena tidak ada satupun yang menggunakan return value-nya.
- `createStudy`: hardcode dihapus. Kalau `subjectLineId` diisi, `await
  selectLine(...)` dulu sebelum pindah tab (tidak ada lagi flash-of-wrong-case).
  Kalau tidak (`manualSubstationIds` path), resolve case yang benar dari
  `substationIds` lewat pencarian yang meniru logic `selectLine` (cek
  `NETWORK_CASES` + merged master graph), bukan dibiarkan di case
  sebelumnya begitu saja.
- `SettingCaseDetail.tsx`'s `openTool`: tambah fallback — kalau
  `subjectLineId` kosong tapi `protectedScope.substationIds` ada isinya,
  cari `LineRelation` pertama yang menyentuh salah satu substation itu
  lewat `buildGraphForUltg()` (sudah dipakai `SettingCaseWizard.tsx`, bukan
  import baru yang aneh), lalu `selectLine` ke situ.
- `confirmGraphBuildGroup` (bukan versi batch — confirm 24 GI sekaligus
  tidak punya satu "GI mana yang harus dipilih" yang jelas): setelah commit
  override, kalau grup itu punya line relation, langsung set
  `activeNetworkCaseId`/`activeNetworkLineId` ke situ.

**Verifikasi**: browser (Playwright) — confirm GI ANGKE (bukan bagian
demo corridor) di Data Quality Queue, lalu cek Working Network dan Network
Builder. Working Network menampilkan baris relasi baru (ANGKE↔sub_ancol,
ANGKE↔sub_karet, ANGKE↔sub_ketapang, ANGKE↔sub_gi_muarakarang) dan section
"NETWORK GRAPH" baru "ANGKE - GI ANGKE" dengan 8 relasi bay/terminal nyata.
Network Builder (sebelumnya sama sekali tidak melihat data ini) sekarang
menampilkan GI ANGKE di dropdown FROM/TO SUBSTATION dan opsi "Sisipkan GI ke
Line Existing", serta case-picker menampilkan opsi "ULTG Durikosambi
Inventory (master inventory)". Regression 15 test suite + `npm run build`
semua lolos, ukuran bundle utama stabil (import `graph-builder.ts` baru di
`SettingCaseDetail.tsx` tidak menambah bundle utama karena
`SettingCaseDetail` sendiri sudah lazy-loaded via `CaseWorkQueueView`).

**Yang TIDAK dikerjakan (backlog terpisah, disebutkan di riset tapi di luar
scope 4 fix ini)**:
- Dropdown "Active Study" di `NetworkModelView.tsx` (Working Network)
  masih di-filter ke `STUDY_CASE_IDS = {"case_dks_dm_pik_mkb"}` — jadi
  meski data-nya sudah benar ter-merge (dikonfirmasi di atas), label
  dropdown itu sendiri belum bisa menampilkan/memilih
  `INVENTORY_MASTER_CASE_ID` sebagai "Study" bernama. Ini kosmetik/labeling
  gap, bukan data gap.
- `SourceIndexView.tsx` juga belum melakukan merge master inventory (sama
  seperti Network Builder sebelum fix ini) — tidak disebut di audit README
  sebelumnya, kemungkinan luput. Belum diperbaiki di update ini.
- `Study.substationIds` tetap snapshot statis saat Study dibuat — Study yang
  sudah ada tidak otomatis "tumbuh" cakupannya kalau GI baru dikonfirmasi
  setelah Study itu dibuat. `StudyDashboardView`'s row-filtering
  (`buildStudyScopeKeys`/`isSubstationInScope`) akan tetap mengeklusi GI
  yang baru dikonfirmasi dari tabel Study yang sudah ada, walau graph yang
  mendasarinya sudah benar. Backlog terpisah.
- Status "SLD Endpoint Candidates/Promote to master" (matcher per-record
  lama) relatif terhadap Graph Builder (per-GI baru) — user sempat
  menanyakan apakah itu masih relevan, belum dijawab dengan perubahan kode.

## Update 2026-08-01 — Fix: Batch-confirm untuk GI High-Confidence di Graph Builder

**Konteks**: user melaporkan alur konfirmasi topology terasa "nyangkut" —
tiap kali masuk ke Study, konteksnya selalu balik ke Study demo lama
("DKS-DM-PIK-MKB") walau sedang mengecek GI lain (mis. Grogol), dan
menanyakan kenapa Graph Builder masih minta konfirmasi manual satu-satu
padahal networknya "sudah di-build". Investigasi menemukan dua masalah
struktural berbeda:

1. **Study/`activeNetworkCaseId` statis, tidak mengikuti bay yang sedang
   dikerjakan** — `NETWORK_CASES` cuma berisi 1 demo case hardcoded; GI lain
   di luar situ tidak punya Study sendiri, jadi Working Network selalu jatuh
   balik ke default lama. `buildGraphForUltg()` (SLD scope → digsilentLineDb
   anchor → setting-doc overlay) sudah ada dan sudah generate network penuh
   se-ULTG, tapi belum jadi satu-satunya sumber — jalur lama (`NETWORK_CASES`
   + matcher per-record + "SLD Endpoint Candidates/Promote to master") masih
   co-exist berdampingan. **Ini backlog struktural besar, belum dikerjakan
   pada update ini** — didiskusikan tapi disepakati dibahas terpisah,
   scope-nya lebih besar dari satu slice.
2. **Konfirmasi Graph Builder tidak membedakan GI yang genuinely butuh
   keputusan manusia vs yang cuma formalitas** — `GraphBuildGroup.confidence`
   sudah ada (`"high"` kalau anchor `digsilentLineDb` match persis, `"low"`/
   `needsManualTopology` kalau butuh disambiguasi nama/alias), tapi UI
   memperlakukan semua GI sama: satu tombol expand+confirm per GI, tanpa
   bedanya. Untuk 24 dari 27 GI di ULTG Durikosambi yang high-confidence,
   ritual itu terasa seperti friksi kosong, bukan diligence — inilah yang
   diperbaiki di update ini.

**Fix**: `confirmGraphBuildGroupsBatch` (baru, `useProsetStore.ts`) — commit
banyak `GraphBuildGroup` dalam satu state update (satu entry undo, satu
audit event), memakai logic upsert yang identik dengan
`confirmGraphBuildGroup` yang sudah ada, bukan reimplementasi terpisah.
`GraphBuilderSection` (`InboxView.tsx`) menghitung `highConfidencePending`
(grup `!needsManualTopology` dengan bay/relasi > 0) dan menampilkan tombol
"Confirm N GI high-confidence sekaligus" terpisah dari daftar per-GI di
bawahnya — GI `needsManualTopology` tetap wajib direview satu-satu seperti
sebelumnya (tombol Confirm-nya tetap gated di belakang "sudah expand
detail"), karena itu genuinely butuh keputusan manusia (alias/nama
konflik, anchor topology hilang).

**Verifikasi**: diuji end-to-end di browser (Playwright) — tombol
"Confirm 24 GI high-confidence sekaligus" muncul di Data Quality Queue
(nama baru untuk "Data Mapping Inbox"), diklik, dan setelahnya tombol
menghilang (tidak ada lagi grup high-confidence pending). Regression
`test:setting-case`, `test:relay-catalog-builder`, `test:graph-coordination`,
`test:relay-setting-builder`, dan `npm run build` semua lolos tanpa
regresi.

**Yang TIDAK dikerjakan (dicatat sebagai backlog terpisah, scope lebih
besar)**:
- Menyatukan `NETWORK_CASES`/Working Network/Study dengan
  `buildGraphForUltg()` sebagai satu-satunya sumber topologi — ini yang
  akan menyelesaikan akar masalah "Study selalu DKS-MKB walau cek GI lain".
- Mempensiunkan atau menjelaskan status "SLD Endpoint Candidates/Promote to
  master" (jalur matcher per-record lama) relatif terhadap Graph Builder
  (jalur per-GI baru) — user eksplisit bertanya apakah itu masih relevan,
  belum dijawab dengan perubahan kode.
- Upload dokumen sumber langsung dari layar Setting Case Detail (root cause
  terpisah: tombol "Buka Working Network" di panel Bukti Sumber mengarah ke
  tool yang salah, dan tidak ada cara upload source-intake record tanpa
  pindah ke menu Dokumen Sumber) — didiskusikan, root cause dikonfirmasi,
  belum diimplementasikan.
- Database sungguhan untuk state ini (confirm/approve saat ini hanya
  tersimpan di localStorage per-browser, bukan shared) — user eksplisit
  menunda ini sampai flow inti (case lifecycle + calculation) solid.

## Update 2026-08-01 — D1 Slice 2: Importer HEL_PHT_TAP Selesai untuk Seluruh 13 Model Relay

**Konteks**: melanjutkan D1 Slice 1 (MICOM P545 saja, 52/184 baris) sampai
mencakup seluruh 13 model relay penghantar yang ada di sheet `HEL_PHT_TAP`
(184/184 baris real). User eksplisit membatasi scope ke 13 model penghantar
ini dulu — model/vendor lain (Toshiba GRZ 200, NR, Xifang di luar PCS-931,
format `.urs` lama) belum ada di sheet ini sama sekali dan bukan bagian
dari slice ini.

- **13 model kolase jadi 7 layout kolom berbeda, bukan 13 mapping
  terpisah** — beberapa sub-keluarga MiCOM berbagi posisi kolom identik:
  - **Layout A** (MICOM P545/P546/P543/P521): PP/PE-split distance,
    Scheme Logic (Aid1/Aid2), SOTF/TOR status+tripping bitmask, AR, sync
    checks — sama persis dengan mapping P545 dari Slice 1.
  - **Layout B** (MICOM P443/P442/P446): distance flat Z1/R1G/R1Ph/tZ1
    (tanpa split PP/PE), field `SOTF/TOR Mode` gabungan, GFR pakai `Ie>`.
  - **L90** (GE): Current Differential (87L) + Phase/Ground Distance Mho
    penuh dengan quadrilateral blinder, Pilot Scheme.
  - **7SL87/7SD61** (Siemens, layout identik): 87 Line Differential,
    distance flat + varian Mho terpisah, carrier/aided scheme.
  - **RED670** (ABB): Diff Mode (IdMin/EndSection slope), Zone 1 PP/PE-split
    (mencerminkan struktur XRIO ZMFPDIS yang ditemukan saat kerja parser
    .rio/XRIO), Zone 2/3 reach bersama, Autorecloser + Synchronizing.
  - **PCS-931** (NR): penamaan gaya IEC-61850 (`87L.*`, `21M1-3.ZG/ZP.*`),
    Pilot Mode eksplisit (`85.Opt_PilotMode` = POTT/PUTT).
  - **GRL 200** (Toshiba): karakteristik phase (Mho) dan ground (Quad)
    terpisah per zone, Carrier Distance/DEF, Differential (`DIFL.*`).
- **Setiap layout diverifikasi terhadap baris data nyata** sebelum ditulis
  ke extractor — bukan ditebak dari header row saja. Ditemukan bahwa MICOM
  P521 punya 2 baris di workbook, satu benar-benar kosong (identitas bay
  saja) dan satu punya data OCR/GFR backup nyata — extractor tidak
  memfabrikasi nilai untuk baris kosong tsb, sesuai prinsip no-fabrication
  yang sudah dipakai builder lain di proyek ini.
- **`parseQuantity` diperbaiki** untuk menangani suffix parenthetical
  deskriptif yang muncul di beberapa model (`"0,819 A (sec)"`,
  `"1 A (0,2xIn)"`) — sebelumnya gagal parse (return null) karena regex
  cuma menerima angka+unit tanpa teks tambahan setelahnya.
- **`PromotedHelPhtTapBay` (`hel-pht-tap-import.ts`) didesain ulang** —
  awalnya (Slice 1) meniru bentuk P545 secara flat (`distance`,
  `currentDiff`, `scheme`, dst di top level). Begitu 12 model lain
  ditambah, ini gagal typecheck karena tiap model punya field yang
  genuinely berbeda (RED670 punya `zone1`/`zone2`/`zone3`, PCS-931 punya
  `distSetting.z1gZSetOhm`, dst — bukan variasi kecil, tapi struktur
  berbeda). Diperbaiki: field yang dipromote ke top level hanya yang
  benar-benar ada di semua 7 shape (identity, matching, CT/VT); detail
  spesifik-model disimpan utuh di field `raw`, konsumen yang sudah tahu
  modelnya baca dari situ — sama seperti `rio-xrio-import.ts`'s callers
  yang switch berdasarkan `kind`/vendor, bukan satu bentuk universal yang
  dipaksakan.
- Regression `test:hel-pht-tap-import` diperluas: assert jumlah record per
  model (184 total, exact match per 13 model), spot-check nilai nyata
  untuk 4 layout berbeda (A/RED670/PCS-931/GRL 200), dan verifikasi
  normalisasi angka koma-desimal serta suffix parenthetical.
- Regression: 15 test suite (termasuk `test:hel-pht-tap-import` yang
  diperluas) + `npm run build` — semua lolos, tidak ada chunk/bundle baru
  (importer masih belum di-wire ke UI manapun, sesuai scope audit-dulu
  yang disepakati).
- **Yang TIDAK dikerjakan**: wiring importer ke UI (`VendorImportView.tsx`
  atau `overlaySettingDocs()`); populate `SettingRecord.values`/
  `RelaySetting` dari hasil `promoteMatchedHelPhtTapCandidates` — itu D1
  slice berikutnya. Model/vendor di luar 13 ini (lihat Konteks di atas)
  juga belum masuk scope.

## Update 2026-08-01 — D1 Slice 1: Importer HEL_PHT_TAP (MICOM P545)

**Konteks**: menindaklanjuti audit kelengkapan data (lihat entri di bawah,
"Audit Kelengkapan Data HEL_PHT_TAP") yang menemukan bahwa sheet
`HEL_PHT_TAP` — belum pernah diimport — punya kedalaman parameter jauh lebih
dekat ke dokumen TAP resmi (Current Diff, Distance Z1-Z3, Scheme
Logic/POTT-PUTT, SOTF/TOR, Autoreclose, System Checks/Sync, VTS/CTS,
OCR/GFR backup) dibanding sumber yang sekarang dipakai (`DIST`/`AR`/
`OCR_PHT`, ~5% depth). Ini slice pertama Data MVP D1 (Controlled Data
Intake) — user eksplisit memilih urutan track D1 → O1 → E1 → C1 → N1 karena
track lain butuh data nyata dulu.

- **`scripts/extract-hel-pht-tap.mjs`** (baru, `npm run import:hel-pht-tap`):
  mengekstrak `HEL_PHT_TAP` ke `src/domain/generated/hel-pht-tap-registry.json`,
  mengikuti pola `extract-lcd-dist.mjs`/`extract-ocr.mjs`. **Hanya MICOM
  P545** yang punya column map di slice ini (52/184 baris nyata) — 12 model
  relay lain (7SL87, PCS-931, MICOM P546/P543/P521/P443/P442/P446, L90,
  7SD61, RED670, GRL 200) dilewati secara eksplisit dan dilaporkan di
  `summary.skippedModels`, bukan didiamkan atau ditebak.
- **Alasan hanya 1 model dulu**: sheet ini TIDAK punya satu layout kolom
  tetap — baris 2-14 masing-masing adalah header dictionary terpisah PER
  MODEL, dan baris data bay (baris 15+) untuk model berbeda saling
  ter-interleave (bukan per blok model). Kolom index yang sama berarti
  field berbeda tergantung model barisnya (kolom 8 = "Distance enabled"
  untuk P545, tapi "VT" untuk 7SL87, "Current" untuk L90). Mapping kolom
  P545 diverifikasi langsung terhadap nilai baris nyata (PHT.01: Z1
  0.263 ohm @70.066°, K1 30%→0.3, tRevGuard 100ms→0.1s, scheme PUR, SOTF
  "Enable Pole Dead", AR "1PAR/3PAR") sebelum dipakai, bukan ditebak dari
  audit sebelumnya (yang sempat salah menggabungkan header 13 model jadi
  satu daftar kolom demi estimasi kelengkapan, cukup untuk audit tapi tidak
  cukup akurat untuk extractor nyata).
- **`src/domain/hel-pht-tap-import.ts`** (baru): mirror pola
  `lcd-dist-import.ts` — `mapHelPhtTapCandidatesToLines`/
  `promoteMatchedHelPhtTapCandidates`, memakai `matchAnySide` yang sama
  (matcher.ts, tidak reimplementasi logic matching). Sheet ini tidak
  punya kolom circuit terpisah (beda dari DIST/OCR_PHT), jadi circuit
  dikosongkan dan diserahkan ke `inferRemoteEndpoint` seperti bay tanpa
  akhiran "-1"/"-2".
- **`SettingSourceKind`** (`unified.ts`) menambah `"hel-pht-tap-import"`.
- **Unit normalization baru** (`parseQuantity` di extractor): sel di sheet
  ini menyimpan angka+satuan inline ("0.263 ohm", "30%", "100 ms"), bukan
  kolom satuan terpisah. "ms" dinormalisasi ke detik dan "%" ke fraksi
  supaya konsisten dengan `DistanceZoneSetting`/`RelaySetting` yang sudah
  pakai detik dan fraksi, bukan ms/persen.
- Regression baru: `scripts/test-hel-pht-tap-import.ts` /
  `npm run test:hel-pht-tap-import` — memverifikasi 52 record P545
  terekstrak, nilai PHT.01 sesuai sumber asli, dan matching ke
  NetworkLine fixture berhasil lewat matcher yang sama dengan LCD/DIST.
- **Yang TIDAK dikerjakan**: belum ada wiring ke UI (`VendorImportView.tsx`
  atau `graph-builder.ts`'s `overlaySettingDocs()`) — modul ini belum
  dipanggil dari mana pun di luar dirinya sendiri dan test-nya, dikonfirmasi
  lewat `npm run build` (tidak ada chunk baru, ukuran bundle tidak berubah).
  12 model relay lain belum punya column map — itu pekerjaan lanjutan
  per-model dengan pola yang sama (dump header row model tsb dari
  `HEL_PHT_TAP`, verifikasi terhadap baris data nyata, baru tulis
  extractor-nya). Populate `SettingRecord.values`/`RelaySetting` dari hasil
  promote juga belum dikerjakan — itu langkah D1 berikutnya setelah lebih
  banyak model tercakup.
- Regression: 14 test suite existing + `test:hel-pht-tap-import` baru,
  semua lolos; `npm run build` lolos tanpa warning baru.

## Update 2026-08-01 — Modul Baru: Parser .rio/XRIO untuk Crosscheck Actual Setting

**Konteks**: menindaklanjuti temuan bahwa alur "Crosscheck Actual Setting"
mentok total (0 tahap kerja terimplementasi setelah `baseline_frozen`),
langkah pertama adalah bahan bakunya: actual setting relay biasanya
diekspor vendor sebagai file `.rio` (Sifang/Siemens plaintext) atau XRIO
(XML — MiCOM/GE/Siemens/ABB). User mengarahkan ke referensi nyata di
proyek lain (`base_ai_tfa`'s `ImpedanceLocus.tsx`) yang sudah py
parser untuk kedua format, lalu memberi 4 file asli (2 `.rio`, 2 XRIO)
untuk verifikasi langsung — bukan cuma percaya kode referensi.

- **`src/domain/rio-xrio-import.ts`** (baru) — `parseRio()`/`parseXrio()`/
  `parseRioOrXrio()`. Hanya logic parsing yang diadopsi dari referensi
  (bukan kode chart R-X plane-nya, sesuai keputusan user — PLMS sudah
  punya `RXPlaneModal` sendiri). Bentuk output DIRANCANG ULANG (bukan
  port apa adanya): satu `RioImportZone` = satu `DistanceZoneSetting`-shaped
  record (xReachOhm, rfppOhmPerLoop, rfpeOhmPerLoop, timeDelayPpS,
  timeDelayPeS) — bukan dua daftar `phGnd`/`phPh` terpisah ala kode
  referensi — supaya cocok 1:1 dengan tipe `DistanceZoneSetting` PLMS
  sendiri (`src/domain/unified.ts`) tanpa konversi lebih lanjut.
- **4 bug nyata ditemukan & diperbaiki**, semuanya lewat verifikasi
  langsung terhadap file asli (bukan tebakan):
  1. **Timer diam-diam tidak pernah dibaca** di kode referensi untuk
     SEMUA format, padahal datanya genuinely ada: `.rio` Siemens 7SA522
     PROTECTIONDEVICE punya `TIME1`/`TIMEM` per zona (dikonfirmasi file
     "Mrica 2...rio": Z1 0.000/0.000, Z2 0.400/0.400, Z3 1.600/1.600);
     SIPROTEC 5 TESTOBJECT punya `TRIPTIME` tunggal; XRIO MiCOM P54x
     punya `tZn Ph. Delay`/`tZn Gnd. Delay`; XRIO ABB punya
     `tPPZn`/`tPEZn`. Semua sekarang ditangkap sebagai `timeDelayPpS`/
     `timeDelayPeS`.
  2. **ABB asli pakai format `ZMFPDIS` (full-scheme)**, bukan `ZMQ...PDIS`
     (quadrilateral) yang di-hardcode kode referensi — struktur beda
     total (`Zone 1`/`Zone 2`/`Zone 3` sub-block eksplisit, parameter
     `X1PPZ1`/`X1PEZ1`/`RFPPZ1`/`RFPEZ1`/`tPPZ1`/`tPEZ1`). Fungsi
     `buildAbbFullSchemeZones()` baru ditulis khusus untuk shape ini;
     `buildAbbQuadZones()` (shape lama) dipertahankan sebagai fallback
     tapi belum ada sampel asli yang memvalidasinya.
  3. **SIPROTEC 5 `.rio` bisa pakai `BEGIN MHOSHAPE`** (lingkaran mho
     langsung: ANGLE/REACH/OFFSET) untuk zona FAULTLOOP LL — kode
     referensi cuma tangani `BEGIN SHAPE` (polygon LINE-clipped), jadi
     SEMUA zona fasa-fasa di file 7SL87 asli akan hilang total. Ditambah
     dukungan `MHOSHAPE`.
  4. **Konvensi indexing LN/LL berbeda antar sumber**: `.rio` Siemens
     7SA522 memakai INDEX yang SAMA untuk sisi ground (LN) dan phase (LL)
     satu zona fisik; SIPROTEC 5 7SL87 justru memakai INDEX offset
     (index 1-3 = ground, 4-6 = phase zona fisik YANG SAMA, dipasangkan
     lewat TRIPTIME yang identik pairwise). Kode referensi tidak
     menghadapi masalah ini sama sekali (modelnya per-baris, bukan
     gabungan) — parser baru mendeteksi pola mana yang berlaku dan
     menggabungkan pasangan yang benar jadi satu `RioImportZone`.
- Diverifikasi: regression test (`scripts/test-rio-xrio-import.ts`,
  fixture sintetis meniru struktur file asli persis — `.rio` saja, sebab
  `DOMParser` tidak ada di Node) + verifikasi langsung browser
  (Playwright) terhadap KEEMPAT file asli user (2 `.rio` via regression
  test, 2 XRIO — termasuk file Trenggalek F87L 15.8MB — via browser
  check manual). Semua 4 file menghasilkan Z1-Z3 dengan reach dan timer
  yang masuk akal (grading time 0/0.4/1.6s dan 0/0.8/1.6s, konsisten
  dengan praktik zone timing).
- Regression: seluruh 14 test suite (13 lama + 1 baru) + `npm run build`
  — semua lolos, bundle size tidak berubah (modul belum dipakai UI
  manapun).
- **Yang TIDAK dikerjakan**: modul ini BELUM disambungkan ke
  `VendorImportView`/gate `document_audit`/`actual_readback_intake` —
  itu langkah berikutnya (upload file → decode → link ke case → buka
  gate crosscheck), sengaja dipisah jadi pekerjaan tersendiri. Format
  `ZMQ...PDIS` (ABB quadrilateral lama) belum ada sampel asli untuk
  divalidasi. Disarankan ke user: kalau tujuannya dokumentasi setting
  selengkap TAP (bukan cuma cross-check Z1-Z3), sarankan upload XRIO,
  bukan `.rio` — XRIO jauh lebih kaya (tiap parameter individual dengan
  nama/deskripsi/unit, mencakup fungsi di luar distance seperti F87L
  differential), `.rio` cuma geometri zona.

## Update 2026-08-01 — Fix: Pencarian Bay di Wizard Buntu Tanpa Penjelasan untuk GI di Luar ULTG Durikosambi

**Pertanyaan user**: "case-nya balik lagi, apa yang terjadi bila bay yang
dicari tidak ada saat ingin resetting? apa yang harus mereka lakukan?
navigasinya kemana?"

**Temuan**: `SettingCaseWizard.tsx` Langkah 3's daftar bay HANYA berasal
dari `buildGraphForUltg()` — yang cuma meng-anchor GI yang SLD-nya sudah
di-scan untuk **ULTG Durikosambi**. Untuk 4 ULTG lain dalam UPT yang sama
(Angke, Citra Raya, Cikupa, Tangkot — lihat catatan sebelumnya soal scope
UPT vs ULTG), banyak GI (mis. GITET Balaraja, GIS Lontar/Spinmill/Suvarna
Sutera di ULTG Cikupa) punya data setting nyata di `RELAY_CATALOG` tapi
NOL anchor SLD. Mencari nama GI itu di wizard sebelumnya cuma menampilkan
teks statis "Tidak ada bay yang cocok." — tanpa penjelasan kenapa, tanpa
arah navigasi.

**Fix**: `unanchoredMatch` (baru) — kalau pencarian primer kosong dan
teks pencarian (≥3 karakter) cocok dengan nama stasiun nyata di
`RELAY_CATALOG.assets` (bay line), tampilkan pesan yang jujur: nama GI +
ULTG-nya ditemukan di data setting, tapi SLD/topologinya belum tersedia
sama sekali untuk ULTG itu — BUKAN kasus "confirm topologi yang sudah
ke-scan" (itu peran Data Quality Queue), jadi sengaja TIDAK memberi
tombol "Buka Data Quality Queue" yang akan jadi jalan buntu kedua
(`resolveUltgScope()` cuma scan `sldSourceIndex.stationFolders`, yang
cuma berisi folder ULTG Durikosambi — GI dari ULTG lain tidak akan pernah
muncul di `unresolvedStations` Inbox manapun).
- Diverifikasi (Playwright): cari "balaraja" → pesan amber menyebutkan
  "GITET 500KV BALARAJA" (ULTG CIKUPA), menjelaskan SLD belum ada, dan
  eksplisit bilang Data Quality Queue tidak akan membantu untuk kasus ini.
- Regression: seluruh 13 test suite + `npm run build` (bundle stabil —
  `relay-catalog.json` sudah jadi lazy chunk terpisah yang dipakai
  bersama `VendorImportView`, tidak duplikat) — semua lolos.
- **Yang TIDAK dikerjakan**: solusi sebenarnya (upload SLD baru untuk 4
  ULTG lain, lalu re-run `buildGraphForUltg()`) tetap backlog data,
  bukan sesuatu yang bisa diselesaikan lewat pesan UI saja.

## Update 2026-08-01 — Fix: Wizard Bisa Membuat Case Tanpa Subject Line yang Diam-Diam Putus Nyambung

**Masalah**: user menandai flow "masih terasa aneh" secara fungsional
(bukan visual). Audit menemukan `SettingCaseWizard.tsx` Langkah 3
mengizinkan `scopeChosen = Boolean(selectedSubject) || manualSubstationIds.length > 0`
— case bisa dibuat hanya dengan "pilih GI langsung (tanpa bay subject)",
TERLEPAS dari jenis perubahannya. Untuk case yang genuinely butuh satu
line spesifik (reconductoring, penggantian CT/VT/relay, remote-side
work), ini menciptakan case yang cacat secara diam-diam:
`protectedScope.subjectLineId` kosong → `SettingCaseDetail.openTool()`
skip `selectLine()` (guard `if (subjectLineId)` gagal) → tombol "Buka
Calculation/Coordination" tetap membuka tool tapi `activeNetworkLineId`
tetap nilai lama yang tidak relevan → `CalculationView`/`CoverageView`'s
`linkedSettingCase` lookup (`subjectLineId === activeNetworkLineId`) tidak
akan PERNAH match → hasil kalkulasi/coordination check tidak pernah
ter-link ke case, badge "Case: {title}" tidak pernah muncul — semua
tanpa satu pun pesan error di mana pun.

**Fix**: `REQUIRES_SUBJECT_LINE` (set baru) menandai 5 `ChangeItemKind`
yang mengubah sesuatu pada line/bay yang SUDAH ADA (reconductoring,
ct_replacement, vt_replacement, relay_replacement, remote_side_work) —
untuk case dengan salah satu alasan ini, `scopeChosen` HANYA true kalau
`selectedSubject` (bay spesifik) terisi; opsi "pilih GI langsung" pada
Langkah 3 diganti pesan amber yang menjelaskan kenapa. `new_gi_insertion`/
`topology_change`/`policy_revision`/`data_correction`/`other` sengaja
tidak dimasukkan — GI baru atau koreksi data massal genuinely bisa tanpa
satu line spesifik.
- Tambahan kecil: `SettingCaseDetail.tsx` sekarang menampilkan pesan
  "Belum ada tool yang dipetakan untuk tahap X" saat `stageTools` kosong
  untuk stage yang sudah implemented (sebelumnya: kosong tanpa
  penjelasan) — supaya user tidak bingung kenapa tidak ada tombol
  "Buka..." muncul di stage tertentu.
- Diverifikasi (Playwright): pilih alasan "Reconductoring" → Langkah 3
  menampilkan pesan amber (bukan opsi GI-saja), tombol final "Buat
  Change Request" tetap disabled sampai bay benar-benar dipilih —
  case dengan subject line kosong TIDAK BISA dibuat lagi untuk 5 alasan
  ini.
- Regression: seluruh 13 test suite + `npm run build` — lolos.
- **Yang TIDAK dikerjakan**: tombol "Lanjut" antar-langkah (1→2→3→4)
  masih tidak menge-cek `scopeChosen` — user tetap bisa klik sampai
  Langkah 4 tanpa pilih bay, baru diblokir di tombol submit terakhir.
  Ini pola yang sudah ada sebelumnya (bukan regresi baru), gate final
  sudah cukup untuk mencegah case cacat, tapi UX bisa lebih baik kalau
  Langkah 3 sendiri juga diblokir — backlog terpisah, bukan bug kritis.

## Catatan 2026-08-01 — Temuan Diskusi: Data Freeze, Scope UPT vs ULTG, User Access (BELUM DIKERJAKAN)

Tiga temuan/keputusan dari diskusi, dicatat sebagai backlog eksplisit —
**tidak ada kode yang diubah untuk entri ini**, murni dokumentasi arah.

**1. Kondisi data saat ini genuinely "freeze", bukan snapshot terkini.**
Dikonfirmasi dari metadata sumber:
- `digsilentLineDb` (topologi/impedansi line, basis seluruh perhitungan
  Z1-Z3/coordination) berasal dari file bernama harfiah "Digsilent_ 9
  Maret 2021, IHS 1-2021", dengan sheet DI DALAMNYA sendiri bernama
  "Backup DB Juli 2019" — kemungkinan besar data topologi intinya
  merepresentasikan kondisi jaringan **2019**, di-crosscheck ulang 2021.
- Data setting relay UPT (`relay-catalog.json`/`lcd-dist-registry.json`)
  tidak punya tanggal revisi eksplisit yang bisa ditemukan di dalam file
  sumbernya sendiri (`Data Setting Penghantar UPT DKSBI (1).xlsx`).
- Tidak ada mekanisme "update data topology/setting" di aplikasi ini SAMA
  SEKALI — satu-satunya jalan input data baru sekarang adalah re-run
  script generator (`npm run index-*`, `npm run generate:*`) terhadap
  file Excel/DIgSILENT baru di disk lokal, bukan lewat upload UI.
- **Implikasi**: sebelum ini dipakai untuk sesuatu mendekati produksi
  (bukan sekadar POC/demo), data topologi & setting perlu benar-benar
  diperbarui ke kondisi jaringan terkini — ini pekerjaan pengumpulan data
  oleh user/tim PLN, bukan sesuatu yang bisa diperbaiki lewat kode saja.

**2. Scope data ternyata UPT (5 ULTG), bukan cuma ULTG Durikosambi —
tapi SLD/topologi mentah cuma ada untuk ULTG Durikosambi.**
- Data setting (`relay-catalog.json`, dari sheet MASTER_PHT dkk.)
  mencakup 5 ULTG di bawah UPT DKSBI: **Durikosambi, Angke, Citra Raya,
  Cikupa, Tangkot** (555 aset total) — bukan cuma 200 aset "ULTG
  DURIKOSAMBI" yang dianalisis sesi-sesi sebelumnya (kesalahan filter
  saya sendiri, `/dksbi|durikosambi/i` cuma menangkap 1 dari 5 ULTG).
- SLD folder yang sudah di-index (`sld-source-index.json`, basis
  `buildGraphForUltg()`'s anchor) HANYA untuk ULTG Durikosambi (17
  GI/GIS/GISTET) — 4 ULTG lain tidak punya SLD ter-index sama sekali,
  konsisten dengan match rate DIgSILENT yang jauh lebih rendah:

  | ULTG | Matched | Candidate | Unmatched (line bays) |
  |---|---|---|---|
  | Durikosambi | 74 | 30 | 48 |
  | Angke | 56 | 24 | 53 |
  | Citra Raya | 29 | 26 | 54 |
  | Cikupa | 2 | 24 | 9 |
  | Tangkot | 0 | 0 | 4 |

- **Keputusan user**: tetap fokus ULTG Durikosambi dulu untuk demo
  (konsisten dengan arahan "bare minimum" sebelumnya) — 4 ULTG lain
  butuh SLD/topologi mereka sendiri sebelum bisa di-anchor dengan benar,
  dicatat sebagai kebutuhan data terpisah, BUKAN dikerjakan sekarang.

**3. User access level: per-ULTG, scope UPT Durikosambi (5 ULTG di
atas) — desain belum diimplementasikan sama sekali.**
- Yang ada sekarang cuma dropdown "Demo Role" (`currentPersona`:
  Engineer/Asisten Manajer/Manajer) di TopBar — murni role global, TIDAK
  ADA scope organisasi (ULTG/UPT) yang membatasi visibility data sama
  sekali. `SettingCase.owningUnit`/`remoteUnit` baru field string bebas,
  bukan referensi ke entitas User/ULTG nyata.
- `BUSINESS_PROCESS_BLUEPRINT.md` §9 sudah merancang role model (Viewer,
  Field Engineer, Data Steward, Protection Engineer, dst. + "assigned
  ULTG/UPT/UIT or project scope") tapi ini baru desain dokumen, belum
  ada kode sama sekali.
- **Keputusan user**: kalau nanti dikerjakan, buat 1 user per ULTG DALAM
  UPT Durikosambi (5 user: Durikosambi/Angke/Citra Raya/Cikupa/Tangkot),
  bukan 1 user per UPT — supaya flow approval/ownership antar-ULTG bisa
  didemokan nyata. Eksplisit ditunda ("catat dulu sebagai next dev"),
  bukan dikerjakan sesi ini.
- Catatan tambahan dari user (belum diminta dikerjakan): per-user
  nantinya perlu notifikasi/alert kalau ada tindakan yang harus
  dilakukan atau perubahan yang sudah di-approve — juga next dev,
  dicatat di sini supaya tidak hilang.

**Pertanyaan terbuka yang belum terjawab tuntas** (ditemukan saat
menyelidiki poin di atas, sengaja belum dikejar lebih jauh):
`confirmGraphBuildGroup()` (approve GI dari Graph Builder di Data
Quality Queue) menyimpan hasilnya ke `networkGraphOverrides[activeCaseId]`
— dan `activeNetworkCaseId` defaultnya adalah `"case_dks_dm_pik_mkb"`
(case demo statis), BUKAN `INVENTORY_MASTER_CASE_ID` (Data Teknis/master).
Artinya approve dari Graph Builder saat ini TIDAK otomatis memperbarui
Data Teknis kecuali `activeNetworkCaseId` kebetulan sedang di-set ke
master — differentiation antara "Working Network" (case-scoped + merge
master) vs "Data Teknis" (master-only) sudah jelas secara MEKANISME, tapi
alur mana yang SEHARUSNYA jadi tujuan approve (selalu ke master? atau
memang ke case aktif?) belum didesain ulang — backlog terpisah.

## Update 2026-07-31 — Rapikan Navigasi Case-Driven + Fix shortCode Akar (Bukan Gejala)

**Masalah navigasi**: user menunjuk sidebar "Existing Tools · not case-gated"
— tool yang sudah case-gated (Setting Register, Reference Setting,
Calculation, Coordination/Coverage, Network Builder) masih bisa diakses
LANGSUNG dari sidebar, dua jalur masuk yang tidak sinkron (satu ber-gate
lewat case, satu bebas akses). Keputusan user: "jahit satu per satu" —
akses langsung dihapus total untuk 5 tool P2 itu.

- `SettingCaseDetail.tsx`'s `STAGE_TOOL` diubah dari satu-tool-per-stage
  jadi array (perlu, karena `study_preparation` sekarang menaungi 2 tool):
  `scoping` → Working Network, `data_change_preparation` → Network Builder,
  `study_preparation` → Setting Register + Reference Setting, `calculation`
  → Calculation Workbook, `coordination` → Coordination/Coverage.
- `AppShell.tsx`: `EXISTING_TOOL_ITEMS` dihapus total dari sidebar (5 tool
  P2 di atas) dan dari `ALL_ITEMS` (dropdown mobile). Sisa 3 tool yang
  BENAR-BENAR belum ready (Actual Verification, Vendor Import, Verified
  Report — stage P1-nya, `document_audit`/`actual_readback_intake`/
  `verification`, belum di-gate sama sekali) ditampilkan sebagai "Segera
  Hadir": tetap terlihat (bukan hilang tanpa penjelasan) tapi disabled,
  dengan tooltip menyebutkan gate mana yang ditunggu — bukan dihapus dan
  bukan dibiarkan bebas akses, sesuai arahan user "kalau memang belum
  ready, soon to be dulu".
- Breadcrumb "Dibuka dari Case" disesuaikan: pesan sekarang berbeda untuk
  `calculation`/`coverage` (yang benar-benar auto-save & link ke case)
  vs tool lain (yang belum).

**Bug shortCode ditemukan LEBIH DALAM saat verifikasi navigasi** (user
menunjuk "DUR - DM #1" di Line Registry — bukan "DKSBI - DNMGT" yang sudah
dikonfirmasi benar sebelumnya): perbaikan `ULTG_INVENTORY_NODES` kemarin
(AGK→ANGKE dst.) ternyata **tidak pernah menyentuh bug aslinya** — itu
cuma memperbaiki array statis yang jarang dipakai. Bug asli ada di
`graph-builder.ts`'s `ensureSubstation()`: lookup shortCode
(`SHORTCODE_OVERRIDE[key]` / `digsilentShortCodes.get(key)`) memakai `key`
= `scoped.identityKey`, yang SENGAJA mempertahankan token "gi"/"gis"
(untuk keperluan lain: membedakan GI vs GISTET Durikosambi sebagai 2
substation terpisah — lihat komentar dedup-key). Tapi
`digsilentShortCodes`/`SHORTCODE_OVERRIDE` di-index oleh bentuk FUZZY
(`normalizeStationName`, tanpa token gi/gis — cocok dengan field mentah
DIgSILENT "DURIKOSAMBI", bukan "gi durikosambi"). Akibatnya lookup SELALU
gagal untuk setiap station yang punya `scoped` match (hampir semua),
diam-diam jatuh ke `buildShortCode()`'s tebakan 3-huruf generik — "DUR"
untuk Durikosambi, "ANG" untuk Angke (fix kemarin ke `ULTG_INVENTORY_NODES`
tidak relevan sama sekali untuk jalur `buildGraphForUltg()` yang live ini).
- Fix: lookup shortCode sekarang pakai `normalizeStationName(rawName)`
  (variable baru `shortCodeKey`, sama dengan nilai yang sudah dihitung
  untuk field `normalizedName`), bukan `key`.
- Hasil setelah fix (diverifikasi langsung, tanpa perlu override manual —
  `digsilentShortCodes`'s ekstraksi frekuensi sudah benar sejak awal,
  cuma tidak pernah terpakai): Durikosambi→DKSBI, Angke→ANGKE, Daan
  Mogot→DNMGT, PIK→PINKA, Kebon Jeruk→KBJRK, Karet→KARET, Karet
  Baru→KRBRU — semua cocok dengan `digsilentLineDb` tanpa tebakan.
- `demo-corridor-seed.json` diregenerasi — Line Registry sekarang
  menampilkan "DKSBI - DNMGT #1" dll., diverifikasi visual (Playwright).
- Regression: seluruh 13 test suite + `npm run build` (bundle stabil
  ~619kB) — semua lolos.
- **Yang TIDAK dikerjakan**: `GISTET KEMBANGAN`/`GIS KEMBANGAN` masih
  berbagi shortCode "KEM" (fallback generik untuk keduanya, bukan
  regresi baru — situasi ini sudah ada sebelum fix ini) — perlu
  `SHORTCODE_OVERRIDE` eksplisit kalau mau dibedakan, belum dikerjakan.
  3 tool P1 yang "Segera Hadir" belum digarap gate-nya — backlog terpisah.

## Update 2026-07-31 — Sprint 5 (lanjutan): Buka Gate Coordination

Lanjutan alami dari gate Calculation (Sprint 5 sebelumnya) — sesuai
BUSINESS_PROCESS_BLUEPRINT.md §9 (tahap 9: "coordinated package,
coverage/selectivity/gap results") dan §7.2's `CoordinationCheck` yang
sudah dinamai di daftar domain object tapi belum diimplementasikan.

- `SettingCaseLinks.coordinationCheckIds: string[]` (baru) — mengikuti pola
  persis `calculationSnapshotIds` satu tahap sebelumnya.
- `EXECUTABLE_SETTING_CASE_STAGES` menambahkan `"coordination"`; `stageGate()`
  menolak lanjut dari tahap ini sampai minimal satu `CoordinationCheck`
  ter-link. Sengaja HANYA mengecek "apakah check sudah dijalankan dan
  disimpan sebagai evidence" — bukan "apakah hasilnya bersih dari
  error/mismatch". Menilai apakah hasil coordination check itu ACCEPTABLE
  adalah pekerjaan tahap 10 (Review & Approval), bukan hard block di sini
  — sama seperti gate Calculation tidak memvalidasi bahwa hasil kalkulasi
  "benar", hanya bahwa ada Calculation Run tersimpan.
- `CoordinationCheckRecord` (baru, di `useProsetStore.ts`) — menyimpan
  snapshot lengkap hasil `runGraphCoordinationChecks()` (bukan cuma
  pass/fail flag) di waktu check disimpan, supaya reviewer bisa lihat
  persis temuan saat itu meski network graph berubah setelahnya.
  `addCoordinationCheck`/`removeCoordinationCheck` actions, persisted
  sama seperti `calculationSnapshots`.
- `linkToSettingCase`/`unlinkFromSettingCase` menambah varian
  `{ kind: "coordination"; refId }`.
- `CoverageView.tsx`: tombol "Save Coordination Check" baru — menyimpan
  hasil diagnostic (`summarizeGraphDiagnostics()` untuk ringkasan error/
  warning count) dan otomatis link ke case aktif kalau
  `protectedScope.subjectLineId` cocok dengan line yang sedang dibuka
  (pola identik `CalculationView.tsx`'s `linkedSettingCase` detection).
- `SettingCaseDetail.tsx`: `STAGE_TOOL.coordination` dibuka Coverage/
  Coordination workbook dari dalam case.
- **Bug ditemukan+fix saat menambah test**: `scripts/test-setting-case.ts`
  tidak type-checked oleh `tsc --noEmit -p .` (tsconfig.json's `include`
  cuma `"src"`) — field baru `coordinationCheckCount` yang wajib di
  `StageGateContext` bisa hilang dari fixture test tanpa terdeteksi
  compiler. Ditambahkan manual ke `gateContext` fixture + assertion baru
  yang meng-cover gate coordination (mirror pola test calculation).
- Diverifikasi end-to-end (Playwright): buat Setting Case nyata dengan
  `subjectLineId` = line Ancol, buka Coverage, klik "Save Coordination
  Check" — tersimpan (107 error, 97 warning untuk jaringan penuh — angka
  besar ini konsisten, bukan bug: banyak setting existing memang
  under-margin di data nyata, itu justru nilai fitur ini), dan
  `case.links.coordinationCheckIds` ter-update dengan benar.
- Regression: seluruh 13 test suite (termasuk assertion baru) + `npm run
  build` (bundle size stabil ~620kB, +1kB wajar dari import tipe
  `GraphDiagnostic`) — semua lolos.
- **Yang TIDAK dikerjakan**: tahap `internal_review` s/d `closed` (10
  tahap lagi setelah coordination) masih locked — backlog terpisah, belum
  disentuh sesi ini. Tidak ada UI untuk MELIHAT riwayat `CoordinationCheck`
  yang tersimpan (mis. daftar check lama per case) — cuma bisa disimpan
  dan di-link, belum ada halaman review-nya. Formula P545 asli (MVP 2B.2)
  dan migrasi `CorridorDiagram` ke graph-aware juga belum dikerjakan —
  keduanya dipilih untuk DITUNDA dulu demi memprioritaskan gate
  Coordination ini.

## Update 2026-07-31 — Ancol Nyala di Coverage/Calculation: selectLine() Buta Terhadap Data Nyata di Luar NETWORK_CASES

**Masalah**: setelah relay-catalog matching diperbaiki (entri di bawah), Ancol
seharusnya sudah punya `RelaySetting` real dan diagnostic Z1_UNDERREACH/
Z2_SHORT nyata — tapi mencoba melihatnya di `CoverageView`/`CalculationView`
tetap gagal. Investigasi menemukan akar masalah yang JAUH lebih dalam dari
sekadar dua view itu: **`selectLine()`** (satu action tunggal di
`useProsetStore.ts` yang dipanggil dari 8 file — `SettingCaseDetail`,
`NetworkGraphEditor`, `StudyDashboardView`, `LineRegistryView`, `LineDetailPanel`,
`InboxView`, `HomeView` — untuk "pilih line ini, propagate ke seluruh
context") **hanya mengenali line dari `NETWORK_CASES`** (case lama, termasuk
`case_dks_dm_pik_mkb` yang cuma subset 4-substation beku dari
`buildGraphForUltg()`, dan `case_ultg_dks_inventory` yang sengaja
`lines: []` sejak awal). Ancol (dan hampir semua bay nyata lain dari
`buildGraphForUltg()`) tidak ada di `NETWORK_CASES` manapun, jadi
`selectLine()` selalu silent no-op (`if (!owningCase) return`) untuk line
itu — `activeNetworkLineId` tidak pernah berubah, dan `CoverageView`/
`CalculationView` (yang sama-sama membaca `activeCase`/`buildUnifiedNetwork`
dari `NETWORK_CASES`) juga tidak punya jalan untuk menampilkannya.

**Fix (disetujui user: perbaiki `selectLine()`, bukan cuma dua view)**:
- `getFullAnchoredNetwork()` (baru, di `graph-builder.ts`) — versi
  memoized dari `buildGraphForUltg()` + `buildCaseFromGraphGroups()` untuk
  SELURUH substation (bukan subset pilihan), di-cache di module scope
  karena `buildGraphForUltg()` makan ~160ms/panggilan (parsing JSON +
  matching) dan dipanggil dari Zustand action (bukan komponen React, jadi
  tidak bisa pakai `useMemo`).
- `selectLine()`: kalau `lineId` tidak ditemukan di `NETWORK_CASES` manapun,
  fallback ke `getFullAnchoredNetwork()` sebelum menyerah — `activeNetworkCaseId`
  di-set ke `INVENTORY_MASTER_CASE_ID` untuk kasus ini.
- `CoverageView.tsx`/`CalculationView.tsx`: deteksi kalau `activeLineId`
  bukan bagian dari network graph yang case-scoped, lalu pakai
  `getFullAnchoredNetwork()` sebagai basis. Banner "Context from Line
  Registry" baru ditambahkan khusus untuk kasus ini (menampilkan nama bay
  asli, bukan silsilah case lama).
- **Regresi bundle-size ditemukan+diperbaiki saat verifikasi**: import
  statis `getFullAnchoredNetwork` di `useProsetStore.ts` (yang di-import
  eager oleh `App.tsx`, bukan di balik lazy route) menyeret seluruh
  registry JSON `graph-builder.ts` (relay-catalog.json, crosscheck-workbook-
  registry.json, lcd-dist-registry.json — >2MB gabungan) ke main bundle —
  ukurannya melonjak 618kB → 1.714kB. Fix: `selectLine()`'s fallback branch
  pakai dynamic `import("../domain/graph-builder")` alih-alih import statis
  — signature publik `selectLine: (lineId) => void` tidak berubah (semua 8
  pemanggil sudah fire-and-forget, tidak pernah `await`), main bundle
  kembali ke 618kB.
- Diverifikasi end-to-end (Playwright): `selectLine("anchor_line_16")`
  (line Ancol) sekarang benar mengisi `activeNetworkLineId`/
  `activeNetworkCaseId`, `CoverageView` menampilkan banner + 12 diagnostic
  nyata untuk Ancol, `CalculationView` menampilkan "Context: ANG -> ANCOL
  #1 | IED: MiCOM / Schneider MiCOM P142 | Xline 0.329 ohm — Prefilled dari
  network graph IED" dengan Line Z1 terhitung otomatis (0.333 ohm).
- Regression: seluruh 13 test suite + `npm run build` (bundle size
  dikonfirmasi kembali ~618kB) — semua lolos.
- **Yang TIDAK dikerjakan**: `DiagnosticsPanel` masih menampilkan SELURUH
  diagnostic jaringan penuh, tidak difilter ke line yang sedang aktif saja
  — ini perilaku yang sudah ada sebelumnya (bukan regresi baru), belum
  disentuh sesi ini. `CorridorDiagram` (visual d3) tetap belum graph-aware,
  sesuai catatan lama.

## Update 2026-07-31 — Koreksi shortCode GI: "ANG" untuk Angke Salah, Ditemukan Saat Cek Ancol

**Masalah yang ditemukan user**: saat verifikasi Ancol di atas,
`CalculationView` menampilkan "Context: ANG -> ANCOL #1" — user menegur
bahwa "ANG" bukan singkatan yang benar untuk Angke, dan menduga
`ULTG_INVENTORY_NODES` (daftar shortCode 17 GI di `seed-network-registry.ts`,
ditulis manual sebelum ada data DIgSILENT nyata) mungkin salah di banyak
tempat lain juga, khususnya untuk GI-GI di ULTG Durikosambi.

**Investigasi**: "ANG" ternyata bukan dari `ULTG_INVENTORY_NODES` (yang
sudah benar menulis "AGK") — melainkan dari `buildShortCode()`'s fallback
generik di `graph-builder.ts` (`words[0].slice(0,3)` untuk nama satu kata),
yang seharusnya kalah prioritas dari `digsilentShortCodes` (hasil ekstraksi
frekuensi token dari `digsilentLineDb` asli) tapi entah kenapa tidak
terpakai untuk kasus ini — perlu investigasi lanjut kenapa lookup itu
gagal untuk "angke" spesifik (dicurigai variasi `key` yang sama dengan bug
`isAliased` sebelumnya, tapi belum dikonfirmasi tuntas).

Yang SUDAH dikonfirmasi lewat pengecekan langsung ke `digsilentLineDb`
(1183 record) dan sheet `MASTER_PHT`'s kolom REAL/ALIAS (data setting UPT,
sumber independen dari DIgSILENT):

- **Angke**: DIgSILENT menulis nama INI UTUH sebagai "ANGKE" (10 kemunculan,
  tanpa saingan dekat) — tidak disingkat sama sekali. `ULTG_INVENTORY_NODES`'s
  "AGK" adalah singkatan buatan yang tidak pernah cocok dengan kenyataan.
- **Durikosambi**: kode asli "DKSBI" (11×) — inventory lama "DKS" dekat
  tapi tidak persis.
- **Kebon Jeruk**: kode asli "KBJRK" (4×) — inventory lama "KBJ" dekat
  tapi tidak persis.
- **Grogol Baru** = "GROGOL II" di DIgSILENT (situs fisik sama, konfirmasi
  user) — alias `DIGSILENT_TO_SLD_ALIAS["grogol ii"]` di `graph-builder.ts`
  ternyata SUDAH ada dari sesi sebelumnya, tapi tidak pernah di-porting ke
  `scripts/index-relay-catalog.mjs`'s `stationAliases()` yang independen
  (gap yang sama seperti kasus Karet).
- **Cengkareng** = "Cengkareng Lama", **Tangerang** = "Tangerang Lama" di
  DIgSILENT (pola sama seperti Karet/Karet Lama — nama polos = situs lama,
  situs baru punya kualifier "Baru" sendiri).
- **Dadap, Ulujami, Muarakarang, Muarakarang Baru**: NOL kemunculan di
  `digsilentLineDb` — genuinely tidak ter-anchor (konsisten dengan catatan
  README soal situs pasca-2021), bukan soal singkatan salah.
- **Daan Mogot**: DIgSILENT menulis "DAAN MOGOT GIS" (deskriptif penuh,
  bukan disingkat "DM").
- **Kembangan**: muncul utuh sebagai "KEMBANGAN" (dengan suffix voltase
  5/7 yang sudah ditangani terpisah) — "KMB" tetap singkatan yang wajar,
  bukan salah eja seperti Angke.

**Fix yang dilakukan** (3 kasus yang jelas & tidak ambigu):
- `seed-network-registry.ts`: `ULTG_INVENTORY_NODES` — Angke AGK→ANGKE,
  Durikosambi DKS→DKSBI, Kebon Jeruk KBJ→KBJRK.
- `scripts/index-relay-catalog.mjs`: `stationAliases()` ditambah
  `"karet lama": ["karet"]`, `"grogol baru": ["grogol ii"]`,
  `"cengkareng": ["cengkareng lama"]`, `"tangerang": ["tangerang lama"]` —
  memporting alias yang sudah confirmed di `graph-builder.ts`/investigasi
  MASTER_PHT ke pipeline matching yang independen ini.
- **Bug kedua ditemukan saat verifikasi**: `circuitFromRecord()` (fix
  sebelumnya, arabic-suffix `-1`/`-2`) ternyata tidak menangani pasangan
  yang pakai suffix ANGKA ROMAWI di nama record sendiri — kasus nyata:
  `"DKSBI-GGLII I"` / `"DKSBI-GGLII II"` (bahkan ada pasangan CAMPURAN,
  `"GRGOL-GGLII 1"` arabic vs `"GRGOL-GGLII II"` romawi, untuk 2 sirkit
  fisik yang sama). Ditambahkan pengecekan suffix ` I`/` II` di akhir nama
  (dengan word-boundary spasi, supaya tidak salah kena kode stasiun
  "GGLII" yang literally berakhiran "II" tanpa spasi) sebagai prioritas
  kedua setelah arabic.
- Hasil setelah regenerate `relay-catalog.json`: DIgSILENT matched naik
  133→137 (alias GI) →161 (setelah fix Romawi) — kenaikan besar terakhir
  ini menjangkau lebih dari sekadar Grogol karena pola suffix Romawi ini
  ternyata dipakai di banyak pasangan lain di seluruh registry, bukan
  cuma DKSBI. `relay-catalog-builder.ts` resolve RelayIED naik 82→110.
- Regression: seluruh 13 test suite + `npm run build` — lolos.
- **Yang TIDAK dikerjakan**: kenapa lookup `digsilentShortCodes.get(key)`
  gagal untuk "angke" spesifik di `graph-builder.ts` (menghasilkan fallback
  ke `buildShortCode`) belum ditelusuri tuntas ke akar penyebabnya — hanya
  gejalanya (ULTG_INVENTORY_NODES's shortCode) yang diperbaiki. GISTET
  Durikosambi/Kembangan (2 entri terpisah dengan voltase 500kV) belum
  dicek ulang. 7 GI tanpa sinyal DIgSILENT (Dadap dst.) sengaja tidak
  ditebak — perlu sumber/dokumen lain di luar `digsilentLineDb` untuk
  verifikasi, backlog terpisah.

## Update 2026-07-31 — Logo PLMS & Halaman Login (branding, UI-only)

**Permintaan user**: buatkan logo aplikasi dan halaman login/landing dengan
ciri khas PLN, mengacu ke referensi visual aplikasi PLN lain ("TFA" —
gradient biru split-panel) tapi diarahkan ulang ke tone lebih modern/bersih
("vibes vantis.sh") setelah didiskusikan — bukan meniru gradient korporat
referensi awal secara literal.

- **`src/components/brand/PlmsLogo.tsx`** (baru): `PlmsMark` — satu sel
  heksagonal (melambangkan node graph substation/line yang jadi model data
  aplikasi ini) dibelah simbol petir (keputusan trip relay proteksi).
  Monoline, `currentColor` untuk stroke heksagon (ikut warna teks parent,
  jadi satu mark bekerja di header gelap maupun konteks terang), bolt selalu
  warna aksen amber (`fill-brand-accent`) sebagai satu-satunya aksen warna.
  `PlmsWordmark` untuk pemakaian mark+teks bersisian.
- **`tailwind.config.js`**: token baru `brand.accent` (`#ffb100`, amber PLN),
  `brand.accent-dark`, `brand.ink` (`#0b0f14`) — dipisah dari palette
  `zone1/2/3` yang sudah ada (itu warna semantik Z1-Z3 proteksi, bukan
  warna brand, sengaja tidak disentuh).
- **`src/components/auth/LoginView.tsx`** (baru): halaman login UI-only —
  form tidak validasi kredensial sungguhan (POC, belum ada backend auth),
  tombol "Masuk ke aplikasi" langsung set state `isAuthed` di `App.tsx` dan
  lanjut ke `AppShell`. Layout: panel form putih mengambang di tengah latar
  `brand-ink` gelap dengan tekstur grid teknis sangat halus (opacity 0.07,
  radial-mask supaya pudar ke tepi) — bukan split gradient dua-panel seperti
  referensi awal, sesuai arah "lebih modern" yang diminta user.
- **`src/App.tsx`**: state `isAuthed` (local `useState`, sengaja TIDAK
  di-persist — refresh kembali ke login adalah perilaku yang benar untuk
  gate UI tanpa auth sungguhan, bukan bug).
- **`src/components/layout/TopBar.tsx`**: diselaraskan ke identitas yang
  sama per permintaan eksplisit user ("pastikan ui/ux didalamnya senada
  dengan login pagenya") — kotak amber+`Zap` lama diganti `PlmsMark`,
  `bg-slate-950` diganti `bg-brand-ink` (token yang sama dengan login).
- **Bug ditemukan+fix saat verifikasi**: `PlmsMark`'s `<path>` stroke sempat
  punya `className` sendiri (`text-[var(--plms-ink)] dark:...`) yang
  override `currentColor` dari `className` yang di-pass parent — akibatnya
  warna putih di header/login tidak pernah kepakai. App ini tidak punya
  dark-mode sama sekali (`color-scheme: light` global), jadi varian
  `dark:` dihapus; `currentColor` sekarang murni ikut `className` svg
  terluar.
- **Insiden verifikasi Playwright**: screenshot pertama menunjukkan
  `bg-brand-ink` tidak ter-apply sama sekali (background tetap abu-abu
  terang default) walau class benar-benar ada di DOM dan config Tailwind
  benar (diverifikasi via `npx tailwindcss` CLI standalone, rule
  `.bg-brand-ink` memang ter-generate). Root cause: **3 proses `vite` dev
  server berjalan bersamaan** dari sesi-sesi sebelumnya (`Get-CimInstance
  Win32_Process` di PowerShell menemukannya — `pkill` via Git-Bash tidak
  menjangkau proses node Windows-native ini), salah satunya menyajikan
  build lama dari sebelum config diedit. Fix: matikan seluruh proses vite
  via `Stop-Process` (PowerShell, bukan `pkill`), start satu instance
  bersih. Dicatat karena pola ini (proses dev server menumpuk lintas sesi)
  kemungkinan terulang.
- Diverifikasi visual end-to-end (Playwright, dev server bersih): login
  page tampil sesuai desain (mark putih+amber, grid halus, panel form
  putih, tombol submit hitam pekat saat form terisi), lanjut sukses ke
  `AppShell` dengan TopBar yang senada.
- Regression: `npx tsc --noEmit`, `npm run build` — lolos (bundle utama
  613→618 kB, wajar karena `LoginView`/`PlmsLogo` tidak lazy-loaded, sama
  seperti `AppShell` yang sudah ada di jalur render awal).
- **Yang TIDAK dikerjakan**: tidak ada backend/validasi auth sungguhan
  (di luar scope — ini POC); tidak menambah SSO/logout flow (referensi
  gambar user menampilkan tombol "Login SSO", sengaja tidak diikutkan
  karena tidak ada sistem SSO nyata untuk disambungkan); sidebar
  (`AppShell.tsx`) belum disentuh untuk restyle penuh ke token brand baru
  — hanya TopBar yang eksplisit diminta diselaraskan; tidak membuat
  favicon/app-icon baru dari `PlmsMark` (bisa jadi tindak lanjut kecil
  terpisah kalau dibutuhkan).

## Update 2026-07-31 — Survei 122 Aset "Candidate": Dua Penyebab Berbeda, Alert DIgSILENT-Status

**Konteks**: setelah fix circuit-detection (entry di atas) menaikkan matched
45→133, masih ada 122 aset relay-catalog berstatus `"candidate"` (skor
terbaik ambigu). Disurvei untuk tahu apakah bisa diperbaiki lagi tanpa
menebak — ternyata ada 2 penyebab yang sama sekali berbeda:

1. **~38 aset (di dalam ULTG Durikosambi)**: skor selalu seri di 0.65 karena
   nama GI dari data relay-catalog Excel (mis. "Karet Lama") berbeda ejaan
   dengan nama substation di sheet DIgSILENT (`Backup DB Juli 2019` — dicek
   langsung kolom `Name`/`Terminal i`/`Terminal j`), yang untuk site ini
   cuma menulis "KARET" polos. Ini persis pola yang SUDAH dikonfirmasi user
   sebelumnya dan sudah difix di `graph-builder.ts`'s `SHORTCODE_OVERRIDE`
   (`"karet" -> "KARET"`, karena "KRLMA" dicadangkan untuk "Karet Baru") —
   tapi fix itu HANYA ada di `graph-builder.ts`, tidak pernah disalin ke
   `scripts/index-relay-catalog.mjs`'s `stationAliases()` yang independen.
   GI serupa yang juga kena (Cengkareng Baru, Ciledug, Durikosambi, Grogol,
   Kembangan, Tangerang) belum diperbaiki — user mengonfirmasi variasi
   penamaan Baru/II per situs TIDAK punya pola seragam ("keep it as it is"),
   jadi tidak ditebak lebih lanjut sesi ini.
2. **~50 aset (Alam Sutera, GISTET Durikosambi, GISTET Kembangan, Grogol
   Baru, Metland, Summarecon Gading Serpong, Ulujami)**: bukan soal
   penamaan — `digsilentMatch.reason` = `"Tidak ada endpoint lokal pada
   DIgSILENT line database"`, artinya GI ini memang TIDAK ADA sama sekali
   di snapshot `digsilentLineDb` (konsisten dengan catatan README soal
   site-site pasca-2021 yang belum di-input manual). Ini bukan bug — bukan
   sesuatu yang bisa "diperbaiki" lewat matching, harus di-upload/registrasi
   ulang datanya.

**Keputusan user**: jangan kejar 122 kandidat itu satu-satu sekarang.
Prioritas: (a) UPT Durikosambi bare-minimum jalan untuk demo dulu, (b)
kalau GI memang belum register di database, USER harus dapat alert yang
jelas ("GI belum register — upload/registrasi ulang"), bukan silent
fallback, (c) skema bulk-upload data baru (GI + setting baru) adalah arah
jangka panjang terpisah, dicatat sebagai backlog — bukan dikerjakan
sekarang.

**Yang dikerjakan sesi ini** (alert, bukan lagi fix alias satu-satu):
`DigsilentBadge` di `VendorImportView.tsx` (tabel "Installed relay catalog")
sekarang punya tooltip (`title`) yang membedakan makna tiap status secara
actionable, bukan cuma label mentah:
- `matched` — sudah ter-anchor otomatis.
- `candidate` — GI ditemukan tapi nama ambigu, perlu peninjauan manual.
- `unmatched` — **GI ini tidak ada di database DIgSILENT sama sekali**,
  perlu registrasi ulang/upload topologi baru (badge diberi warna merah,
  sebelumnya abu-abu/tidak dibedakan dari status lain).
- `not-applicable` — bukan bay penghantar, matching tidak berlaku.
- Prop `reason` (sudah ada di data, sebelumnya tidak dipakai UI) ikut
  ditampilkan di tooltip yang sama untuk detail teknis tambahan.

**Yang TIDAK dikerjakan**: (1) tidak menambah alert serupa di level
dashboard/ringkasan baru — `VendorImportView`'s metric bar (`DIgSILENT
match` / `Join candidates`) sudah ada sebagai sinyal agregat, dan
pembuatan dashboard baru sengaja ditunda user sejak awal sesi ini; (2)
tidak memperbaiki alias 6 GI candidate lain di dalam Durikosambi (Cengkareng
Baru, Ciledug, Durikosambi, Grogol, Kembangan, Tangerang) — user
mengonfirmasi pola penamaannya tidak seragam, butuh klarifikasi per-GI yang
belum diberikan; (3) tidak mendesain skema bulk-upload data baru — itu
arah terpisah, backlog jangka menengah, bukan bagian dari perbaikan
matching kali ini; (4) `needsManualTopology` (badge "Perlu mapping" di
`SettingCaseWizard.tsx`) sudah punya alert serupa di level topologi/bay
sejak sebelumnya — tidak diubah, karena sudah mengikuti pola yang sama
(pesan actionable + CTA), sengaja tidak diduplikasi ke level relay-catalog.
- Regression: `npm run build`, `npx tsc --noEmit` — semua lolos (tidak ada
  test otomatis untuk komponen UI ini; hanya diverifikasi lewat build/typecheck).

## Update 2026-07-31 — Fix: Salah Baca Kode Terminal sebagai Nomor Sirkit di Relay-Catalog Matching

**Pertanyaan user yang memicu investigasi**: kalau data Z1-Z3 sudah match
(seperti Angke↔Ancol yang barusan diverifikasi bersih), apakah grading-time
dan overlap check-nya (`graph-coordination.ts`) juga otomatis ikut jalan?
Jawabannya awalnya TIDAK — dicek langsung: `network.relaySettings` hanya
terisi 29 dari kebutuhan (hasil `buildRelayIedsFromCatalog`, yang hanya
menarik dari 45 aset relay-catalog yang berstatus DIgSILENT-match
`"matched"`), dan Ancol tidak termasuk di dalamnya sama sekali — padahal
`upt-zone-audit.ts` (baca langsung dari `LCD_DIST_REGISTRY`) sudah punya
data Ancol yang lengkap dan match. Dua pipeline data relay yang berbeda,
belum tersambung.

**Investigasi kenapa Ancol tidak matched**: asset relay Ancol#1/#2 di
`relay-catalog.json` sudah dapat kandidat skor 0.9 (`local station` +
`remote endpoint`), tepat di ambang `unambiguous` (`score >= 0.9`), tapi
gagal karena **kandidat row 16 ("ANGKE-ANCOL -1") dan row 17 ("ANGKE-ANCOL
-2") sama-sama skor 0.9** — seri, sehingga status jadi `"candidate"` (perlu
review manual), bukan `"matched"`.

**Root cause**: `circuitFromRecord()` di `scripts/index-relay-catalog.mjs`
menebak nomor sirkit dari gabungan `name` DAN kode terminal
(`fromTerminal`/`toTerminal`, mis. `"I-5"`/`"II-5"`), dengan pola regex
`II-?5` diartikan sebagai "sirkit 2". Padahal `"I-5"`/`"II-5"` adalah kode
posisi terminal/bay (angka Romawi), BUKAN nomor sirkit — dan kedua sirkit
paralel ANGKE-ANCOL sama-sama memakai `fromTerminal: "I-5"` / `toTerminal:
"II-5"` yang identik. Row 16 (`"-1"` di nama, sirkit sebenarnya 1) ikut
salah kebaca sebagai sirkit 2 karena `toTerminal` mengandung `"II-5"` —
akibatnya bonus skor +0.10 untuk circuit-match tidak pernah kena ke row
yang benar, dan kedua row tetap seri di 0.9.
- Skala: diukur di seluruh `digsilentLineDb` (1183 record, 218 di antaranya
  punya suffix `-1`/`-2` di nama) — **40 dari 218 (≈18%) salah
  diklasifikasi** oleh logic lama, semuanya searah (sirkit 1 asli terbaca
  sebagai sirkit 2).
- Fix: prioritaskan suffix nama record (`-1`/`-2`) sebagai sinyal utama —
  itu langsung menyebut sirkit yang mana, tidak perlu ditebak — fallback ke
  kode terminal hanya kalau nama tidak punya suffix sama sekali.
- Setelah fix + regenerate `relay-catalog.json`: DIgSILENT matched naik
  dari **45 → 133 aset** (hampir 3x), `relay-catalog-builder.ts` sekarang
  resolve **82 RelayIED** (dari 39), termasuk keenam relay Ancol#1/#2
  (confidence naik dari 0.9/ambigu jadi 1.0/matched).
- Diverifikasi end-to-end: `network.relaySettings` sekarang berisi
  RelaySetting nyata untuk Ancol, dan `runGraphCoordinationChecks()`
  menghasilkan 12 diagnostic asli untuk bay itu (Z1_UNDERREACH — Z1 0.263Ω
  = 22.7% dari line X 1.159Ω, di bawah floor 70% wajar; Z2_SHORT — Z2
  0.403Ω belum mencapai remote bus) — bukan data yang difabrikasi, murni
  hasil impedansi baris dari DIgSILENT dan setting Z1/Z2 dari LCD/DIST yang
  sudah ada.
- Regression: seluruh 13 test suite + `npm run build` — semua lolos;
  `npm run generate:demo-seed` dijalankan ulang (4 substation demo seed
  tidak berubah — himpunan relay dalam subset demo itu kebetulan sudah
  match sebelumnya juga).
- **Yang TIDAK dikerjakan**: 122 aset relay-catalog yang masih berstatus
  `"candidate"` (skor terbaik tapi tetap ambigu, atau skor <0.9) belum
  ditinjau satu-satu — itu backlog terpisah (opsi lain yang tidak dipilih
  sesi ini: menyambungkan `relaySettings` langsung dari `LCD_DIST_REGISTRY`
  tanpa melalui `relay-catalog.json`, yang akan menjangkau lebih banyak bay
  lebih cepat tapi tidak memperbaiki data matching itu sendiri).

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
