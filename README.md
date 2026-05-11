# PLMS POC

Protection Lifecycle Management System

PLMS adalah proof-of-concept aplikasi lifecycle management untuk setting proteksi transmisi. Target demo saat ini adalah membuktikan workflow end-to-end untuk satu pilot ULTG, yaitu ULTG Durikosambi, sebelum konsep ini dinaikkan ke level UIT atau korporat.

Tujuan produk ini bukan sekadar membuat spreadsheet digital. PLMS dirancang sebagai sistem kerja engineer proteksi: data aset dan dokumen existing masuk sebagai baseline, engineer membuat study per bay/line, menghitung setting baru, menerbitkan TAP setting, memantau checking setting aktual oleh tim lapangan, lalu menyimpan evidence/report yang traceable.

## Executive Summary

Masalah utama di proses setting proteksi saat ini:

- Data setting tersebar di Excel, PDF TAP setting, BA, export relay, dan file Mathcad.
- Legacy spreadsheet crosscheck sebenarnya sudah memuat DIgSILENT line database, fault level, screening bay lawan, dan formula checking, tetapi belum menjadi aplikasi lifecycle yang traceable.
- Mapping bay, relay, CT/VT, line relation, dan dokumen sumber masih banyak manual.
- Perhitungan setting memakai Mathcad, tetapi hasil, asumsi, review, dan approval belum menjadi database lifecycle.
- TAP setting vs actual setting masih banyak discreening manual.
- Coverage/overlap distance protection belum mudah dilihat sebagai satu workflow.
- Data PST atau SSOT aset belum selalu lengkap/terintegrasi untuk kebutuhan engineering proteksi.

PLMS POC menjawab masalah itu dengan alur engineering yang lebih tepat:

```text
Existing source documents and asset data
  -> Master data and setting baseline
  -> Study workspace per bay/line
  -> Calculation workbook
  -> Coverage and engineering validation
  -> TAP setting issued by engineering
  -> Field checking: installed setting vs latest TAP
  -> Comparison, resetting task, verified report, and audit trail
```

Pitch product:

- Jika vendor luar negeri punya platform protection lifecycle management, PLN juga bisa membangun versi lokal yang lebih sesuai proses internal, dokumen existing, bahasa kerja engineer, dan roadmap Smart Transmission System.
- POC ini menunjukkan bahwa core technology-nya feasible: registry, OCR intake, mini network model, setting mapping, calculation workbook, coverage analyzer, comparison, and report.
- Untuk pilot 3 bulan, scope yang realistis adalah ULTG Durikosambi, bukan langsung seluruh sistem transmisi.

## Engineering Lifecycle Clarification

TAP setting dalam konteks PLMS bukan sekadar dokumen input dari luar. TAP setting adalah output resmi dari proses engineering proteksi. TAP setting dapat terbit karena beberapa trigger:

- bay baru atau GI baru
- sisipan GI yang mempengaruhi Z2/Z3 reach
- rekonduktoring atau perubahan material penghantar
- perubahan CT/VT, relay, skema teleproteksi, atau konfigurasi bay
- perubahan topology operasi yang menjadi permanen
- temuan insidental dari checking setting aktual

Karena itu, lifecycle yang benar adalah:

```text
Trigger perubahan
  -> kumpulkan data aset dan setting baseline
  -> hitung setting baru di Calculation Workbook
  -> validasi coverage/coordination
  -> engineering menerbitkan TAP setting baru
  -> tim lapangan melakukan checking / resetting
  -> actual setting dibandingkan dengan TAP terbaru
  -> hasil checking masuk kembali ke registry dan audit trail
```

Page `Setting Comparison` punya dua fase:

1. **Baseline sebelum perubahan setting.** Tim lapangan mengecek setting terpasang terhadap TAP setting terakhir. Jika setting terpasang sama dengan TAP terakhir, maka engineer punya baseline valid untuk menghitung perubahan setting dari kondisi yang benar.
2. **Feedback/resetting setelah checking.** Jika setting terpasang berbeda dan perbedaannya functional/krusial, PLMS dapat menjadi dasar penugasan resetting. Jika perbedaannya kosmetik, cukup dicatat sebagai evidence. Jika perbedaannya functional, perlu task resetting atau engineering review.

Dengan model ini, Comparison bukan sekadar halaman "cek beda angka". Comparison adalah loop kontrol antara engineering dan field execution.

## Demo Scope

Scope demo saat ini:

- Pilot: ULTG Durikosambi.
- Study utama: koridor DKS - DM - PIK - MKB.
- Neighborhood untuk distance coverage:
  - DKS - DM sebagai primary subject.
  - DM - PIK - MKB sebagai forward chain.
  - DKS - Grogol Baru dan DKS - Kebon Jeruk sebagai branch/reverse-side neighborhood.
- Fungsi proteksi yang sudah masuk POC:
  - DIST
  - LCD
  - OCR
  - GFR
  - TELE sebagai registry/supporting function
- Fungsi yang masih roadmap:
  - AR
  - SYNC
  - CBF
  - transformer differential
  - busbar protection
  - vendor setting file generation

Hal yang sengaja tidak dipaksakan di POC:

- Full ULTG network calculation untuk semua bay.
- Backend multi-user.
- Approval workflow resmi.
- Parser binary `.set` vendor.
- Replacement penuh Mathcad.

## What Works Now

Fitur yang sudah berjalan di frontend POC:

- Home dan Study Dashboard sebagai entry point user.
- Study Wizard untuk memilih subject bay/line dan membentuk study scope.
- Master Data Registry untuk GI/GIS, line relation, relay IED, dan protection function.
- Network Builder untuk menambah substation, relation, IED, dan CT/VT master.
- Source Intake untuk upload/stage dokumen.
- OCR/text-layer pipeline untuk PDF TAP setting:
  - pdf.js text layer extraction
  - tesseract.js fallback untuk scanned PDF
  - regex extraction untuk Z1/Z2/Z3, OCR/GFR, CT ratio, VT/PT ratio, dan TAP document number
- Data Mapping Inbox untuk review/import candidate.
- Setting Register dengan per-line lifecycle status dan per-function promotion.
- Calculation Workbook untuk distance line 150 kV.
- Calculation Template Library + Mathcad Bridge:
  - template selector di Calculation page
  - executable template untuk Distance Line 150 kV
  - blueprint template untuk OCR/GFR, Line Differential/LCD, dan AR/SYNC
  - input specs, formula steps, outputs, assumptions, dan benchmark requirements per template
  - hasil Distance Workbook bisa disimpan sebagai calculation snapshot / draft TAP ke Setting Register
  - index sample Mathcad `.xmcd` untuk ABB REL670 dan MiCOM P545 sebagai benchmark artifact awal
- Legacy Crosscheck Workbook index:
  - membaca workbook "Aplikasi Crosscheck Setting Relay"
  - mengekstrak DB line dari DIgSILENT, data fault/IHS, formula count, dan active legacy case Distance + OCR/GFR
  - menjadi blueprint untuk mengganti spreadsheet dengan workflow PLMS
- Setting Comparison untuk TAP vs actual.
- Coverage Check untuk distance zone reach, overlap, backup gap, dan time grading.
- Verified Report yang bisa diprint/save as PDF via browser.
- Audit Trail lokal untuk event penting.
- CT/VT structured master:
  - parse ratio string existing
  - manual review form
  - OCR auto-fill ke IED yang masih kosong
  - dipakai oleh Study Dashboard, Line Registry, Calculation, Master Data, dan Verified Report

## User Demo Flow

Flow ini yang disarankan untuk demo ke calon user.

### 1. Mulai Dari Home

User melihat:

- jumlah GI di master
- jumlah line relation
- jumlah relay IED
- daftar study aktif

Output:

- user paham bahwa aplikasi ini bukan kalkulator tunggal, tetapi workspace lifecycle.

### 2. Buat atau Buka Study

User klik `New Study` atau membuka study existing.

Study Wizard:

- memilih subject bay/line
- memberi nama study
- menyarankan scope GI sekitar subject line
- menyimpan anchor `subjectBayId`, `subjectLineId`, dan `subjectLabel`
- opsi `Start from Legacy Crosscheck Workbook` untuk membuat benchmark study dari spreadsheet existing:
  - DB DIgSILENT sebagai kandidat line/impedance source
  - IHS sebagai sumber fault level
  - `PROSES` sebagai acuan bay selector dan L1-L4 corridor screening
  - `Cek Distance` dan `Cek OCRGFR` sebagai target parity calculation

Output:

- satu study case yang punya konteks jelas, misalnya rekonduktoring atau evaluasi setting pada satu bay penghantar.
- untuk legacy benchmark study, engineer bisa melihat bagaimana flow Excel lama akan digantikan bertahap oleh PLMS.

### 3. Lihat Bay List / Study Dashboard

User melihat daftar bay dalam scope study.

Readiness status:

- `perlu mapping`: bay belum punya LineRelation.
- `data tidak lengkap`: IED atau fungsi proteksi belum ada.
- `missing CT/VT`: IED ada, tetapi CT/VT belum lengkap.
- `perlu TAP`: source TAP belum terhubung.
- `ada drift`: TAP vs actual punya mismatch functional.
- `siap hitung`: data cukup untuk calculation.
- `coverage ready`: data cukup untuk coverage distance.

Output:

- user tahu apa yang harus dibereskan sebelum menghitung setting.

### 4. Lengkapi Data Di Master Data / Network Builder

Untuk greenfield atau database belum lengkap:

- tambah GI/GIS
- tambah LineRelation
- tambah IED
- isi CT/VT Master

Untuk source document:

- upload/stage PDF TAP setting
- OCR/text extraction berjalan
- extracted fields dipromosikan ke target line
- CT/VT dari OCR dapat mengisi IED yang masih kosong

Output:

- registry bertambah dari dokumen existing, tetapi tetap human-in-the-loop.

### 5. Baseline Checking TAP Terakhir vs Setting Terpasang

Sebelum menghitung perubahan setting, engineer perlu tahu apakah setting aktual di relay saat ini sama dengan TAP setting terakhir.

Field workflow:

- tim lapangan menerima penugasan checking
- setting terpasang dibaca dari relay atau export setting
- hasil checking di-upload/dicatat ke PLMS
- PLMS membandingkan actual setting dengan TAP setting terakhir

Output:

- jika match, TAP terakhir valid sebagai baseline perubahan setting
- jika cosmetic mismatch, dicatat sebagai evidence
- jika functional mismatch, muncul sebagai dasar resetting task atau engineering review

### 6. Review Data Mapping Inbox

Inbox menampilkan kandidat mapping:

- Functional Drift
- Ambiguous Mapping
- Needs Relation
- New Imports
- Coverage Expansion
- Missing Setting Values

Engineer approve, reject, atau manual-map ke LineRelation.

Output:

- candidate import berubah menjadi reviewed source.
- per-function promotion masuk ke Setting Register.

### 7. Buka Setting Register

User melihat relation per line:

- topology endpoint
- source evidence
- CT/VT
- relay IED
- protection function chips
- lifecycle status

Klik line untuk membuka Line Detail.

Output:

- satu line punya evidence lengkap: topology, relay, source, fungsi, dan status.

### 8. Calculation Workbook

Calculation dipakai untuk menghitung setting baru, misalnya karena bay baru, rekonduktoring, sisipan GI, atau hasil checking menunjukkan setting aktual perlu dikoreksi.

Prefill dari:

- active LineRelation
- line impedance
- relay IED
- CT/VT structured master
- promoted setting source
- legacy crosscheck workbook, jika study dibuat dari spreadsheet benchmark

User melihat:

- input engineering
- formula trace
- intermediate result
- final TAP preview
- validation warning
- benchmark Excel: input GI/bay/fault/CT/PT, L1-L4 selector, output Z1/Z2/Z3/timer, dan OCR/GFR

Output:

- draft calculation yang dapat diaudit dan dibandingkan dengan Mathcad existing.
- calculation snapshot masuk ke Setting Register sebagai source `calculation` dengan status `reviewed`.
- basis penerbitan TAP setting baru oleh tim engineering.
- untuk legacy benchmark study, target berikutnya adalah menghitung ulang di PLMS lalu menampilkan deviasi terhadap output Excel.

### 9. Engineering Validation dan TAP Setting Baru

Sebelum TAP baru diterbitkan, engineer memvalidasi:

- calculation trace
- coverage Z1/Z2/Z3
- coordination overlap/gap
- time grading
- mismatch baseline vs actual terakhir
- source evidence yang dipakai

Output:

- TAP setting baru sebagai hasil engineering calculation dan review.
- evidence bahwa perubahan setting dihitung dari baseline yang benar.

### 10. Comparison Setelah Checking / Resetting

Setelah TAP baru diterbitkan, tim lapangan melakukan checking atau resetting. Hasil actual setting dibandingkan kembali dengan TAP terbaru.

Mismatch diklasifikasikan:

- match
- cosmetic
- functional

Output:

- engineer tahu apakah setting baru sudah benar-benar terpasang.
- mismatch functional bisa menjadi penugasan resetting atau review lanjutan.

### 11. Coverage Check

User melihat distance coverage:

- Z1/Z2/Z3 reach
- overlap antar relay
- backup gap
- time grading
- R-X plane drilldown

Output:

- engineer bisa melihat apakah setting coverage sudah reasonable untuk koridor.

### 12. Verified Report

Report merangkum:

- study context
- source evidence
- CT/VT
- line impedance
- calculation preview
- comparison summary
- coverage diagnostics
- status checking/resetting jika sudah ada

Output:

- draft PDF report dari browser untuk bahan review.

## Developer Architecture

Frontend architecture:

```text
src/domain
  seed-network-registry.ts     static seed and source registry
  generated/*.json             imported Excel/PDF registry output
  unified.ts                   unified network domain model
  mini-nmm.ts                  effective mini network model adapter
  matcher.ts                   relation/candidate matcher
  relation-status.ts           lifecycle rollup and function promotion
  instrument-transformers.ts   CT/VT parser and structured model

src/store
  useProsetStore.ts            Zustand state, local persistence, audit events

src/components
  home                         portfolio and entry point
  study                        Study Dashboard and Study Wizard
  master                       Master Data Registry
  network                      Working Network, Network Builder, Source Index
  inbox                        mapping/review queue
  registry                     Setting Register and Line Detail
  calculation                  distance workbook
  comparison                   TAP vs actual comparison
  coverage                     distance coverage visualization
  report                       verified engineering report
  governance                   audit trail

src/lib
  ocr.ts                       PDF text extraction and TAP field extraction
  distance-calculation.ts      distance workbook formulas
  coordination-checks.ts       coverage validation rules
```

State model:

```text
UnifiedNetwork
  Substation
  Busbar
  Bay
  Terminal
  LineRelation
  RelayIED
  ProtectionFunction

Study
  subjectBayId
  subjectLineId
  subjectLabel
  substationIds

Workflow state
  candidateDecisions
  miniNmmOverrides
  ctVtOverrides
  sourceIntakeRecords
  pdfTapPromotions
  calculationSnapshots
  auditEvents
```

Important design decision:

- Seed data is not mutated directly.
- User additions are stored as overrides in localStorage.
- Effective network is computed from seed + overrides + master inventory bridge.
- This makes the POC backend-ready: overrides can become database rows later.

## Data Pipeline

### Source Types

| Source | Current handling | Target handling |
|---|---|---|
| SLD PDF/folder | indexed as source directory and endpoint candidates | semi-automatic topology extraction |
| TAP setting PDF | browser OCR/text-layer extraction | formal SourceDocument + SettingRecord |
| Excel registry | imported via Node scripts into generated JSON | browser or backend import job |
| Legacy crosscheck workbook | indexed into generated JSON | source for DIgSILENT line DB, fault levels, L1-L4 selector, and benchmark outputs |
| Actual setting export | partially represented by comparison seed | vendor parser or CSV export parser |
| MiCOM `.set` binary | not parsed | parse CSV/PDF export from MiCOM S1 Agile first |
| PST data | not integrated | backend connector or PST mock JSON |
| Mathcad templates | ABB REL670 and MiCOM P545 `.xmcd` samples indexed | benchmark source for calculation templates |

### Data Needed For Stronger Demo

| Data | Why needed | Minimal sample |
|---|---|---|
| Mathcad export/template | validate Calculation Workbook formula equivalence | ABB and MiCOM distance samples already indexed; need engineer review and expected output values |
| Legacy crosscheck workbook | replace spreadsheet workflow with PLMS flow | workbook indexed; next step is UI mapping into Study Wizard and Calculation |
| Latest TAP setting PDF per side | baseline setting before engineering change and source evidence | PDF with text layer or scanned sample |
| New TAP setting output | official result from engineering calculation | generated from PLMS calculation workflow |
| Actual relay setting export/checking result | baseline validation and post-resetting confirmation | CSV/text export preferred |
| CT/VT master | calculation conversion and readiness | ratio already supported; accuracy class and knee voltage for pilot hardening |
| Line impedance | distance reach and coverage | R/X positive sequence, length, conductor |
| Fault level / source impedance | sensitivity and coordination validation | max/min 3-phase and 1-phase per bus |
| SLD per GI | topology relation and bay mapping | PDF single-line per GI |
| PST mock JSON | prove SSOT integration design | GI, bay, equipment, CT/VT, line relation |

## Remaining Work: Function vs Data

Yang sudah dikerjakan tidak dimasukkan sebagai pending. OCR pipeline dan CT/VT structured master sudah ada di POC; sisa pekerjaannya adalah hardening data/template untuk pilot.

### Function-Side Backlog

| Gap | Yang kurang | Effort | Demo value |
|---|---|---:|---|
| Template execution engines | Template registry sudah ada. Distance executable, tetapi OCR/GFR, LCD, dan AR/SYNC masih blueprint. | 1-2 minggu | High |
| OCR/GFR calculation workbook | Blueprint sudah ada; perlu formula engine pickup/TMS/curve dan benchmark Mathcad. | 3-5 hari setelah data fault tersedia | High |
| Line Differential / LCD workbook | Blueprint sudah ada; perlu field priority, CT matching rules, teleprotection/channel checklist dari TAP/vendor sample. | 3-5 hari | High |
| AR + SYNC workbook/checklist | Blueprint sudah ada; perlu policy operasi dan TAP sample untuk dead time, reclaim, sync window. | 2-4 hari | Medium |
| `.set` parser MiCOM | Masih blocked tanpa CSV/PDF export dari MiCOM S1 Agile; binary `.set` proprietary. | Unknown | Medium |
| Approval workflow nyata | Lifecycle status sudah ada, tetapi belum ada role-based flow Engineer -> Reviewer -> Manager -> Issued. | 1 minggu | Medium |
| Vendor file generator | Export `.set`, `.rio`, `.pcm`, atau format vendor setelah setting approved. | 2-4 minggu per vendor | Long-term |
| System-level fault data validation | Belum ada short-circuit MVA/source impedance untuk verify sensitivity Z2/Z3 pada minimum infeed. | dependent on data | Medium |

### Data-Side Backlog

| Data | Asal | Saat ini | Yang dibutuhkan |
|---|---|---|---|
| Mathcad templates existing | File Mathcad PLN atau PDF export | 2 distance `.xmcd` samples indexed | tambah sample OCR/GFR dan LCD, plus expected output values |
| TAP setting terakhir | Dokumen engineering existing | sebagian ada | PDF per side untuk baseline comparison |
| Actual setting/checking result | Tim lapangan / export relay | sebagian seed comparison | CSV/text/PDF hasil checking per bay |
| CT/VT detail lanjutan | PST atau registry aset | ratio structured sudah ada | accuracy class, knee voltage, polarity, location, manufacturer |
| Line impedance proper | PST atau line constant calculation | X-ohm equivalent | R, X, B per km positive/zero sequence, conductor, length, ground wire, soil resistivity |
| Short-circuit fault levels | PSAT / DIgSILENT study output | belum ada | fault MVA 3-phase dan single-phase, max/min infeed per bus |
| DIgSILENT line database | Legacy crosscheck workbook `DB` sheet | indexed | normalize into LineRelation/conductor/impedance master |
| Asset register PST mock | PST PLN extract | belum ada | JSON sample: GI, bay, equipment hierarchy, CT/VT, line impedance, relay |
| More scanned TAP PDF samples | Document repo PLN | OCR engine ready | sample layout per vendor/format untuk hardening regex/template |
| `.set` CSV export sample | MiCOM S1 Agile manual export | binary `.set` saja | 1-2 CSV/PDF export untuk parser blueprint |

### Recommended Next Priorities

1. **Benchmark Distance template vs Mathcad sample.** Skeleton bridge sudah ada; yang paling meyakinkan berikutnya adalah menunjukkan hasil PLMS vs Mathcad pada case yang sama.
2. **Port legacy crosscheck workbook flow.** Gunakan indexed DB/IHS/PROSES/Cek Distance/Cek OCRGFR sebagai sumber untuk Study Wizard, Working Network, dan Calculation benchmark.
3. **OCR/GFR executable workbook.** Blueprint sudah ada dan lebih cepat dari vendor parser; ini menguatkan cerita bahwa fungsi selain distance bisa masuk.
4. **Line Differential/LCD executable checklist.** Penting untuk konteks penghantar 150 kV dengan LCD dan teleprotection.
5. **Approval workflow.** Bagus untuk demo lifecycle, tetapi sebaiknya setelah calculation template lebih kuat.

## Technology Stack

Current POC:

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Zustand persist for local state
- D3 for visualization support
- pdfjs-dist for PDF text layer
- tesseract.js for browser OCR fallback
- xlsx dependency available for future browser Excel import

Recommended pilot backend:

- PostgreSQL
- Prisma or equivalent ORM
- REST or tRPC API
- Object/file storage for source documents
- Auth and role model:
  - Engineer
  - Reviewer
  - Approver
  - Viewer
- Immutable audit trail table
- Background jobs for OCR/import/parsing

## Output Per Flow

| Flow | Input | Processing | Output |
|---|---|---|---|
| Source Intake | PDF TAP/SLD/Excel metadata | OCR/text extraction, field extraction | SourceIntakeRecord, extracted fields |
| Network Builder | GI, relation, IED, CT/VT | manual registry update | Mini-NMM override, audit event |
| Inbox Mapping | imported candidate | match, manual map, approve/reject | CandidateDecision, function promotion |
| Setting Register | LineRelation + sources | lifecycle rollup | line status and source evidence |
| Baseline Checking | latest TAP + installed setting | TAP vs actual comparison | baseline valid / cosmetic mismatch / functional mismatch |
| Calculation Template Library | function scope + required source data | template selector, inputs, formula blueprint, assumptions, Mathcad benchmark plan | executable Distance template and blueprint templates for OCR/GFR, LCD, AR/SYNC |
| Legacy Spreadsheet Replacement | DIgSILENT DB, IHS fault levels, Excel formulas | workbook indexer and formula mapping | normalized source registry and benchmark cases |
| Calculation | line, relay, CT/VT, impedance | selected template formula engine and snapshot save | engineering calculation, new TAP preview, calculation snapshot in Setting Register |
| TAP Issuance | approved calculation + validation evidence | engineering review workflow | new TAP setting package |
| Comparison | new TAP + post-checking actual setting | mismatch classifier | resetting confirmed / resetting required / review required |
| Coverage | relay zones and topology | reach and grading checks | overlap/gap/time diagnostics |
| Verified Report | active line study context | evidence aggregation | printable engineering report |

## Roadmap For 3-Month Pilot

### Month 1 - Data Foundation

- Move localStorage state to backend.
- Create database schema for ULTG, Substation, Bay, LineRelation, RelayIED, ProtectionFunction, SourceDocument, SettingRecord, StudyCase, AuditEvent.
- Import ULTG Durikosambi station list and priority line relations.
- Implement file storage and source document metadata.
- Keep frontend flow mostly as-is, but server-backed.

Deliverable:

- ULTG Durikosambi master registry can be edited and reused by multiple users.

### Month 2 - Engineering Workflow

- Strengthen PDF TAP parser and OCR field templates.
- Port Excel import into backend job or browser import.
- Add role-aware lifecycle actions:
  - imported
  - reviewed
  - approved
  - issued
  - rejected
- Add calculation template format.
- Benchmark distance calculation against existing Mathcad output.
- Use saved calculation snapshots as the draft TAP basis before review/issuance.
- Turn OCR/GFR and LCD blueprints into executable calculation/checklist templates after sample data is available.
- Add baseline checking workflow: latest TAP vs installed setting before engineering change.

Deliverable:

- One or two real line studies can go from baseline checking to calculation, TAP issuance, and review evidence.

### Month 3 - Demo-Ready Governance

- Verified report with document number, revision, approval block, and immutable snapshot.
- Better audit trail with before/after diff.
- Field checking/resetting task flow:
  - assign checking/resetting to field team
  - record actual setting result
  - compare actual setting against latest TAP
  - close task if match, escalate if functional mismatch
- Expand functions beyond DIST:
  - OCR/GFR workbook
  - Line differential registry/checklist
  - AR/SYNC registry/checklist
- Build dashboard for ULTG readiness:
  - missing topology
  - missing CT/VT
  - missing TAP
  - functional drift
  - coverage ready

Deliverable:

- Pilot demo that can be presented as local PLMS product candidate for PLN transmission protection lifecycle.

## Current Limitations

This POC is intentionally frontend-only.

Known limits:

- Data is persisted in browser localStorage, not a shared database.
- `.set` binary files are not parsed because MiCOM S1 Agile format is proprietary.
- Mathcad formulas are not fully replicated because actual Mathcad templates are not yet provided.
- Distance workbook is functional but still needs benchmark against real calculation templates.
- Calculation snapshot / draft TAP already exists for Distance, but approval-to-issued TAP workflow is still status/audit concept, not enforced role workflow.
- SLD parser is not full automatic yet.
- OCR extraction is already available, but still regex-based and will need vendor/layout templates for production quality.
- CT/VT is stored as per-IED override in POC; backend pilot should model it as equipment-level master data if PST supports that.
- Field assignment for checking/resetting is not implemented yet; Comparison currently demonstrates the technical comparison layer, not the operational task workflow.

## How To Run

Install dependencies:

```bash
npm install
```

Run local dev server:

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

Build:

```bash
npm run build
```

Data import scripts:

```bash
npm run import:lcd-dist
npm run import:ocr
npm run index:sld
npm run index:pdf
npm run index:mathcad
npm run index:crosscheck
```

Bundled reference data:

- `data/template-setting/` berisi template Mathcad `.xmcd` dan workbook crosscheck Excel yang dipakai sebagai benchmark POC.
- `npm run index:mathcad` membaca semua `.xmcd` di folder itu dan memperbarui `src/domain/generated/mathcad-template-registry.json`.
- `npm run index:crosscheck` membaca workbook crosscheck di folder itu dan memperbarui `src/domain/generated/crosscheck-workbook-registry.json`.

## Suggested PPT Outline

1. Problem statement: why protection setting lifecycle is hard today.
2. Product idea: PLMS as local protection lifecycle management system.
3. Why local solution: adapt PLN workflow, documents, PST, and governance.
4. POC scope: ULTG Durikosambi, one corridor/neighborhood first.
5. User workflow: Home -> Study -> baseline checking -> Calculation -> TAP issuance -> field checking -> Report.
6. Data pipeline: existing TAP/actual/SLD/PST -> registry -> calculation -> new TAP -> comparison feedback.
7. Core technology: mini-NMM, matcher, OCR, lifecycle state, calculation workbook, comparison engine, coverage analyzer.
8. Data needed: SLD, latest TAP PDF, actual setting export, CT/VT, line impedance, Mathcad templates, PST mock.
9. Outputs: setting register, calculation trace, new TAP preview, mismatch summary, coverage diagnostics, verified report.
10. 3-month pilot plan: backend, data foundation, workflow, governance, report.
11. Long-term roadmap: UIT scale, PST integration, risk dashboard, vendor file generation.

## Product Positioning

PLMS can be positioned as a local, PLN-adapted alternative to external protection lifecycle management platforms.

The value proposition:

- Fit to PLN transmission protection workflow.
- Able to reuse existing documents gradually.
- Designed around PST/SSOT integration.
- Supports governance and auditability.
- Starts from real engineering pain: bay relation, setting traceability, TAP vs actual, CT/VT, and coverage.
- Can grow from one ULTG pilot into UIT-level implementation.

PT PLN Icon Plus internal POC, 2026.
