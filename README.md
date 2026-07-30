# PLMS POC

Protection Lifecycle Management System

PLMS adalah proof-of-concept aplikasi lifecycle management untuk setting proteksi transmisi. Target demo saat ini adalah membuktikan workflow end-to-end untuk satu pilot ULTG, yaitu ULTG Durikosambi, sebelum konsep ini dinaikkan ke level UIT atau korporat.

Tujuan produk ini bukan sekadar membuat spreadsheet digital. PLMS dirancang sebagai sistem kerja engineer proteksi: data aset dan dokumen existing masuk sebagai baseline, engineer membuat study per bay/line, menghitung setting baru, menerbitkan TAP setting, memantau checking setting aktual oleh tim lapangan, lalu menyimpan evidence/report yang traceable.

> **Business-process remapping:** arah proses, transaksi data, lifecycle, user access, dan evaluasi modul lama sedang dikonsolidasikan di [`BUSINESS_PROCESS_BLUEPRINT.md`](./BUSINESS_PROCESS_BLUEPRINT.md). Blueprint tersebut menjadi acuan target; uraian fitur lama di bawah tetap dipertahankan sebagai catatan implementasi POC saat ini.

> **Klarifikasi actual setting:** sumber utama setting aktual adalah hasil `Read from IED` menggunakan software resmi vendor beserta native setting file dan acquisition manifest. TAP/PDF adalah expected/issued setting, bukan bukti setting yang sedang tersimpan di relay. CSV/Excel/XML/XRIO/RIO dapat dipakai sebagai derived parsing artifact bila dihasilkan dari sesi readback yang sama; file tanpa bukti akuisisi tetap berstatus unverified candidate.

> **Klarifikasi hitung setting baru:** menu target `Calculate / Revise Setting` membuat Setting Change Case dan terlebih dahulu meminta alasan serta change items. Rekonduktoring, penggantian CT/VT/relay, sisipan GI, atau pekerjaan sisi remote menghasilkan proposed data/network revision di dalam case; perhitungan memakai revision calon tersebut tanpa menimpa database aktif. Aktivasi data baru dilakukan terkontrol saat effective date/energization/commissioning.

> **Boundary implementasi saat ini — Sprint 4.1:** workflow aktif mencakup intake/scoping, immutable `Case Baseline`, append-only `Proposed Data Revision`, versioned `Case Impact Assessment`, dan requirement-driven `Study Scenario Package`. Case membedakan audit PDF TAP dari actual relay readback, owner UPT/UIT dengan maker–checker–approver serta notifikasi, permanent post-commission dari temporary/emergency intent, dan approval dari activation. Setting/technical revision baru aktif saat commissioning; koreksi administratif murni aktif pada approved effective date. Calculation dan handler operasional tahap lanjut masih dikunci; tool POC lama tetap berlabel `not case-gated`.

## Executive Summary

Masalah utama di proses setting proteksi saat ini:

- Data setting tersebar di Excel, PDF TAP setting, BA, export relay, dan file Mathcad.
- Legacy spreadsheet crosscheck sebenarnya sudah memuat DIgSILENT line database, fault level, screening bay lawan, dan formula checking, tetapi belum menjadi aplikasi lifecycle yang traceable.
- Mapping bay, relay, CT/VT, line relation, dan dokumen sumber masih banyak manual — dan proses konfirmasi relasi antar-GI belum pernah benar-benar selesai karena mekanismenya bekerja satu record sekaligus, bukan satu GI sekaligus.
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

## MVP Roadmap and Current Status

> **Canonical roadmap diremap 2026-07-29.** PLMS tidak langsung melompat dari network graph ke kalkulator. Urutannya adalah: digitalkan existing process -> bentuk engineering-data foundation -> versioned change/scenario -> calculation parity -> canonical TAP package -> semantic multi-vendor conversion -> closed-loop governance. PLMS tidak menunggu NMM dan native vendor-file export didefer.

### Canonical MVP sequence

| Tahap | Outcome | Status POC saat ini |
|---|---|---|
| **MVP 1A — Reference Engine** | Digitalisasi parity workbook `Aplikasi Crosscheck Setting Relay` untuk OCR/GFR penghantar/kopel, trafo, dan distance. | **Implemented.** Formula reference, lookup fault/line, pemilihan ruas/bay lawan, formula trace, serta regression benchmark sudah tersedia. Hasil masih berstatus reference, bukan issued TAP. |
| **MVP 1B — Crosscheck** | Actual setting dimasukkan manual atau dari hasil ekstraksi, lalu dibandingkan dengan reference menggunakan tolerance dan basis primary/secondary yang jelas. | **Implemented.** Mendukung input manual/plain text/CSV-like, normalization, manual mapping parameter, tolerance profile, dan klasifikasi match/deviation/missing/unmapped. |
| **MVP 1C — Source and Vendor Intake** | Import actual/TAP setting dan source document ke parameter PLMS yang seragam. | **Pilot implemented.** Parser MiCOM Courier `.set` P443/P545, normalized TAP PDF adapter, workbook/PDF/XMCD index, dan handoff ke Crosscheck tersedia. |
| **MVP 1D — Network and Relay Data Foundation** | Bentuk network/asset/relay registry yang dapat direview tanpa dependency NMM. | **Partially implemented.** Self-contained graph, review topology per-GI, relay catalog, sisipan GI, `superseded` lifecycle, dan historical source snapshots sudah ada. Electrical-data completeness dan current-source ingestion belum lengkap. |
| **MVP 2A — Engineering Change and Study Scenario** | Setiap perubahan topology/data menjadi versioned change set; setiap fault level terikat ke scenario dan network revision. | **GI-insertion pilot implemented.** Slice 2A.1–2A.4 tersedia: source/scenario, immutable change set, readiness/conflict detection, dan neutral DIgSILENT staging preview. Perluasan change type dan official PowerFactory adapter belum termasuk. |
| **MVP 2B — Calculation Engine and Mathcad Parity** | Hitung recommended setting secara native dengan formula trace dan parity terhadap XMCD. | **2B.1 implemented.** Input contract P545 Ciledug–Alam Sutera sudah typed/unit-aware, scenario-gated, menampilkan provenance, conflict, missing data, dan justified override. Formula parity 2B.2 belum dipindahkan/disetujui engineer. |
| **MVP 2C — Canonical Setting Package and TAP Composer** | Satukan calculated setting, policy, override, provenance, approval state, dan hasilkan draft TAP resmi. | **Not implemented.** Calculation snapshot/printable report ada, tetapi canonical schema dan TAP composer multi-page belum ada. |
| **MVP 2D — Relay Capability Profiles and Multi-vendor Conversion** | Konversi engineering intent ke proposed target settings lintas brand/model disertai capability-gap report. | **Seed data available.** Relay Catalog, manual references, actual/TAP records, dan 12 XMCD tersedia; capability profiles dan conversion rules belum ada. |
| **MVP 3 — Closed-loop Lifecycle and Governance** | PLMS -> DIgSILENT study -> PLMS impact/recalculation -> review/approve/issue/field verification. | **Case-local foundation implemented through Sprint 4.1.** Immutable baseline/proposal/impact/scenario package, authority profile, audit, dan activation contract tersedia di local state. Shared backend, identity enforcement, executable approval/commissioning, Calculation Run, issue, serta field verification belum ada. |
| **Deferred — Native Vendor-file Export** | Menghasilkan `.set` atau project/import format vendor. | **Explicitly deferred.** Bukan acceptance criterion MVP 2/awal MVP 3. |

### Implementasi yang sudah masuk

- **Reference Engine:** modul calculation terstruktur untuk OCR/GFR, trafo, dan distance; trace menjelaskan input, rumus, hasil, unit, dan warning.
- **Crosscheck Engine:** parser actual setting generik, mapping parameter, tolerance `strict`/`engineering`/`commissioning`, serta report per parameter.
- **Vendor Import pilot:** pembacaan MiCOM Courier `.set`, metadata relay, record address/value, diagnostic coverage, dan handoff ke Crosscheck.
- **Relay Catalog UPT Durikosambi:** indexing workbook `Data Setting Penghantar UPT DKSBI (1).xlsx` menjadi 555 inventory aset relay, 73 model teragregasi, 45 kecocokan DIgSILENT, pemetaan fungsi proteksi dan bay, parser readiness, dan manual-library reference.
- **Legacy source indexing:** workbook crosscheck, sample `.xmcd`, data LCD+DIST/OCR, SLD folders, dan PDF source telah dijadikan generated registries/benchmark artifacts.
- **Self-contained Network Graph:** topology dibangun dari scope SLD + `digsilentLineDb` + overlay setting document; tidak bergantung pada NMM.
- **Review topology per-GI:** Graph Builder dan Data Mapping Inbox mengelompokkan review satu GI beserta bay/relasinya, dilengkapi human confirmation.
- **Topology lifecycle:** dukungan status `superseded`, upsert override yang tidak menduplikasi entity, dan workflow menyisipkan GI baru ke line existing.
- **Versioned engineering source:** DB DIgSILENT 9 Maret 2021 dan IHS Semester 1 2021 dipisahkan menjadi historical `SourceSnapshot`; fault lookup sekarang wajib melalui `StudyScenario` yang menyimpan network revision, method, condition, generation/source state, timestamp, dan evidence.
- **Immutable Engineering Change Set:** transaksi sisipan GI otomatis merekam affected before/after topology, ordered operations, baseline scenario/snapshot, referential validation, dan deterministic fingerprint. Undo/Reset working graph tidak menghapus recorded history.
- **Data Readiness + DIgSILENT staging preview:** required-field matrix memeriksa baseline, topology, length, R1/X1/R0/X0, legacy X alias, serta konsistensi jumlah dua segmen terhadap line lama. Change set tanpa blocker dapat diekspor sebagai neutral JSON, CSV, dan DGS-like preview dengan validation report.
- **P545 Input Contract:** pilot Ciledug–Alam Sutera #1 mengikat input line, CT, CCC/rating, fault level, relay identity, dan adjacent-network gaps ke unit serta provenance yang eksplisit. Fault input diblokir tanpa `StudyScenario`; konflik P543/P545 dan 26,24/33,22 kA tidak dipilih diam-diam; override mencatat actor, timestamp, dan alasan.
- **Setting Case Sprint 1–4.1:** intake dan P1–P5 routing berbasis alasan, baseline scope/evidence immutable, proposed technical revision append-only, impact/readiness lintas endpoint, multi-condition Study Scenario Package, authority/notification profile, commissioning activation contract, dan temporary restoration obligation. Package blocked tetap direkam; hanya package lengkap dan compatible yang membuka Calculation.
- **Study dan UX:** Study dipisahkan per subject line; Working Network dan Data Mapping Inbox dipindah ke grup `Network & Mapping` karena keduanya bekerja pada level ULTG, bukan level Study.
- **Verification:** regression scripts tersedia untuk Reference Engine, Crosscheck, Vendor Import, Relay Catalog, Graph Builder, bridge export, dan build aplikasi.

### Target architecture

PLMS tidak akan menyalin Mathcad menjadi satu kalkulator monolitik. Data source, perubahan network, study scenario, calculation, dokumen resmi, dan conversion vendor dipisahkan tetapi tetap traceable:

```text
SourceSnapshot: topology + technical data + fault study + relay/TAP evidence
  -> EngineeringChangeSet + DataReadiness
  -> DIgSILENT staging/study feedback
  -> versioned StudyScenario
  -> typed engineering rule
  -> recommended canonical setting package
       -> draft TAP PDF
       -> JSON/CSV and setting change sheet
       -> multi-vendor conversion worksheet + capability-gap report
  -> re-import generated output through MVP 1C
  -> compare against canonical package through MVP 1B
  -> review, approve, issue

[deferred] native vendor setting-file writer per exact model/firmware
```

`Canonical Setting Package` menjadi source of truth. PDF dan file vendor adalah output terkontrol dari package tersebut, bukan tempat utama menyimpan engineering intent.

### Active implementation roadmap

#### MVP 2A — Engineering Change and Study Scenario

- `SourceSnapshot` DB/IHS dan `StudyScenario` foundation sudah implemented; perluasan berikutnya mencakup TAP/actual/Mathcad dan current DIgSILENT study.
- Pertahankan contract scenario: network revision, study method, max/min condition, generation/source state, calculated-at, serta current/impedance result per bus.
- `EngineeringChangeSet` untuk sisipan GI sudah implemented sebagai append-only evidence; perluas contract yang sama ke new bay, reconductoring, CT/PT/relay replacement, dan setting revision.
- Topology diff sekarang otomatis diturunkan dari workflow sisipan GI: old line `superseded`, GI/bay/terminal baru, dan dua physical segments baru.
- `DataReadinessResult` sudah membedakan `complete`, `missing`, `conflict`, dan `stale`; rule awal berlaku untuk GI insertion dan sequence impedance.
- Neutral JSON/CSV/DGS-like staging preview sudah tersedia; output selalu menyatakan bahwa ini bukan official PowerFactory DGS dan belum menulis langsung ke project.
- Acceptance: case sisipan Grogol Baru menghasilkan change set yang deterministik, menunjukkan data electrical yang belum lengkap, dan tidak memakai IHS 2021 sebagai current result tanpa scenario.

#### MVP 2B — P545 Calculation Engine and Mathcad Parity

Pilot pertama menggunakan `Tap Setting MiCom P545 GI Ciledug Bay Alam Sutera #1.xmcd`.

- Input contract TypeScript typed/unit-aware sudah implemented sebagai gerbang sebelum formula dijalankan.
- Contract saat ini membaca DB line row 311, historical IHS melalui scenario, relay/TAP register, dan benchmark XMCD sebagai kandidat provenance terpisah.
- Status input dibedakan menjadi `resolved`, `conflict`, `missing`, `blocked`, dan `overridden`; kandidat sumber tetap dipertahankan setelah override.
- Port formula ke rule module TypeScript dilanjutkan pada 2B.2.
- Scope awal: data saluran/UGC, CT/PT, Z1/Z2/Z3 forward, Z3 reverse, infeed, `kZ0`, resistive reach, load blinder, power swing, autoreclose, serta LCD `Is1`/`Is2`/`k1`/`k2`.
- Simpan formula trace, asumsi, sumber data, override engineer, rule version, dan hasil intermediate.
- Buat parity test PLMS vs saved result Mathcad dengan tolerance yang disepakati engineer.
- Mathcad tetap menjadi benchmark selama masa transisi, bukan runtime dependency PLMS.

#### MVP 2C — Canonical Setting Package and TAP Composer

- Definisikan schema canonical untuk engineering inputs, calculated settings, policy settings, manual overrides, provenance, dan approval state.
- Pilot layout menggunakan dokumen resmi `UGC OHL GIS PIK - Muarakarang Baru 1,2`.
- Template report terstruktur: identitas GI/bay, main/backup relay, address-description-setting, notes, pagination, document number, revision, validity, dan approval placeholders.
- Gabungkan hasil calculation dengan policy/profile relay: communication, scheme logic, supervision, event/oscillography, dan commissioning notes.
- Backup relay seperti Siemens 7SJ63 diperlakukan sebagai calculation/profile terpisah dari main relay MiCOM P545 walaupun diterbitkan dalam satu TAP.
- Hasilkan JSON/CSV/change sheet dan re-import ke MVP 1C untuk crosscheck otomatis melalui MVP 1B.
- Output awal selalu `DRAFT`; status issued hanya melalui approval workflow.

#### MVP 2D — Relay Capability Profiles and Multi-vendor Conversion

- Gunakan Relay Catalog, TAP/actual-setting records, manual library, dan 12 benchmark XMCD lintas vendor sebagai seed knowledge.
- Bentuk `RelayCapabilityProfile` per family/model: fungsi yang tersedia, terminology, unit/basis, range/resolution, characteristic, zone/scheme logic, supervision, autoreclose, communication, serta constraint firmware/order code.
- Replacement brand A ke brand B dilakukan dari engineering intent canonical, bukan mengganti address satu-ke-satu.
- Conversion report mengklasifikasikan setiap parameter sebagai `exact-equivalent`, `transformed`, `engineer-decision`, atau `unsupported`.
- Output tahap ini adalah proposed setting package, vendor change sheet, capability-gap report, dan draft TAP—bukan native `.set`/project file.
- Prioritas awal: MiCOM P543/P545, ABB RED670, Siemens 7SL87, kemudian keluarga dengan benchmark/manual yang paling lengkap.

#### MVP 3 — Closed-loop Lifecycle and Governance

- Import hasil current DIgSILENT study dengan network-revision/scenario matching.
- Impact analysis mencari bay/setting yang terdampak oleh topology, source, conductor, CT/PT, atau relay replacement.
- Orchestrate recalculation tanpa auto-approve hasil.
- Role-aware lifecycle: Engineer -> Reviewer -> Approver -> Issued -> Field Verification.
- Immutable issued package, before/after diff, assignment, evidence, dan audit trail pada shared backend.
- Native vendor-file export tetap bukan dependency untuk menyelesaikan closed loop ini.

#### Deferred — Native Vendor Setting-file Export

- Native `.set` atau format project/import vendor tidak menjadi acceptance criterion MVP 2.
- Fitur ini baru dimulai setelah capability mapping, approval workflow, official vendor tool, dan real round-trip fixtures stabil.
- Bila dikerjakan, validasi address schema, enum, scaling, setting group, version/header/trailer, integrity/checksum, semantic readback, dan field verification tetap wajib per model/firmware.

### Incremental delivery slices

Implementasi dilakukan dalam slice kecil yang tetap menghasilkan outcome teruji:

| Urutan | Slice | Perubahan utama | Acceptance check |
|---|---|---|---|
| **2A.1 — implemented** | Source Snapshot + Study Scenario domain | Types, persisted seed migration v16, selector/validation, Source Index panel, Study Dashboard selector, audit event, dan scenario-gated IHS autofill. | DB 2021 dan IHS 2021 tampil sebagai dua versioned historical snapshots; fault lookup terblokir tanpa scenario; regression dan production build lulus. |
| **2A.2 — implemented** | Engineering Change Set | Workflow sisipan GI menghasilkan append-only affected before/after snapshots, ordered entity operations, baseline provenance, validation, audit event, dan deterministic fingerprint. | Line lama superseded, dua segmen baru, entity references valid, diff/fingerprint dapat direproduksi; Undo/Reset tidak menghapus history. |
| **2A.3 — implemented** | Data Readiness and Conflict Detection | Required-field matrix `insert-substation-v1`; baseline/topology/electrical/consistency checks; status complete/missing/conflict/stale. | Missing endpoint/length/R1/X1/R0/X0 menjadi blocker; historical baseline menjadi review; X1 alias dan jumlah physical segments dibandingkan dengan line lama. Conflict CCC/rating, relay identity, dan fault-level lintas dokumen menyusul saat source domain tersebut masuk change set. |
| **2A.4 — implemented** | DIgSILENT Staging Preview | Neutral JSON, line CSV, DGS-like text preview, per-km conversion, provenance, dan validation report. | Preview tidak dibuat bila minimum readiness gagal; historical baseline menghasilkan `importReady: false`; tidak ada direct write atau klaim official PowerFactory DGS. |
| **2B.1 — implemented** | P545 Input Contract | Typed/unit-aware schema, immutable Mathcad snapshot, scenario gate, provenance candidates, conflict/missing status, dan justified session override di Calculation UI. | Setiap input menunjukkan source, capture timestamp, unit, snapshot/scenario bila tersedia, dan override reason; regression mencakup P543/P545 serta 26,24/33,22 kA. |
| **2B.2** | P545 Formula Parity | Port formula XMCD per calculation block dan compare intermediate/final outputs. | Delta report per formula; tolerance eksplisit; no silent rounding. |
| **2C.1** | Canonical Setting Package | Calculated/policy/manual values + provenance + status. | Package dapat diserialisasi, di-hash, dan di-crosscheck melalui MVP 1B/1C. |
| **2C.2** | TAP Composer | Draft multi-page PDF berdasarkan canonical package. | Semua value memiliki source; watermark `DRAFT`; issued action belum tersedia tanpa approval. |
| **2D.1** | Capability Profiles | P543/P545, RED670, dan 7SL87 semantic profiles. | Coverage/gap matrix menunjukkan fungsi dan constraint yang belum dipetakan. |
| **2D.2** | Conversion Pilot | P545 canonical intent -> proposed RED670/7SL87 settings. | Setiap mapping berstatus exact/transformed/decision/unsupported; tidak menghasilkan native file. |

**Next coding slice: MVP 2B.2.** Port formula XMCD P545 per calculation block, simpan intermediate trace, dan buat delta report tanpa silent rounding.

### Batas klaim saat ini

- PLMS **sudah dapat membaca** pilot MiCOM `.set`, tetapi **belum menghasilkan** native `.set`.
- PLMS **sudah memiliki reference calculation**, tetapi belum boleh disebut pengganti penuh Mathcad sampai parity P545 case nyata selesai.
- PLMS **sudah memiliki input contract P545**, tetapi contract masih berstatus blocked sampai VT, adjacent-network equivalent/infeed, relay identity, dan basis fault-level diselesaikan; contract ini belum menghitung setting.
- PLMS **sudah dapat membuat printable report**, tetapi belum memiliki TAP composer enam halaman yang mengikuti kontrol dokumen resmi.
- Relay catalog menunjukkan aset dan kesiapan parser/manual, tetapi keberadaan model di catalog tidak berarti exporter model tersebut sudah tervalidasi.
- Manual library saat ini mencakup family yang menaungi 336 dari 555 aset, tetapi manual tersebut belum diekstrak menjadi semantic capability profiles; catalog belum cukup untuk conversion otomatis tanpa engineering review.
- Output `.neutral-dgs-preview.txt` adalah staging interchange PLMS, bukan DGS resmi. Official adapter, direct PowerFactory write, dan round-trip validation didefer sampai environment staging/dev tersedia.

### Engineering-data update and DIgSILENT feedback loop

Kemampuan menyisipkan GI tidak cukup bila perubahan hanya berhenti di visual/network graph PLMS. Setiap perubahan topology harus menghasilkan versioned engineering-data change set:

```text
Existing line A--B
  -> mark old line version as superseded
  -> create substation C + bus/bay/terminal
  -> create segment A--C and C--B
  -> attach technical data and source evidence per segment
  -> generate DIgSILENT staging package
  -> run network + short-circuit study in DIgSILENT
  -> import updated line data, source impedance, and fault levels
  -> impact analysis + recalculate affected protection settings
```

Minimum data change set untuk sisipan GI:

- identity dan effective date/revision dari GI, busbar, bay, terminal, dan circuit;
- status line lama `superseded` serta alasan perubahan;
- panjang, OHL/UGC section, conductor/cable type, rating/CCC, R1/X1/R0/X0 atau parameter per-km untuk setiap segmen baru;
- transformer/source/generator data yang mengubah short-circuit contribution;
- CT/PT, relay assignment, communication/teleprotection, dan protection function per bay;
- source document, engineer decision, dan approval state.

Untuk tahap awal, PLMS menghasilkan neutral JSON/CSV/DGS-like staging preview dan validation report; PLMS tidak menulis langsung ke project PowerFactory. DIgSILENT menyediakan DGS sebagai interface pertukaran data dua arah melalui ASCII/XML/CSV/ODBC, dan relay object juga dapat dibuat dari CSV melalui script. Adapter resmi tetap perlu divalidasi terhadap environment PowerFactory staging. Setelah topology berubah, short-circuit study harus dijalankan ulang; historical IHS tidak boleh dianggap otomatis masih valid. Referensi: [DIgSILENT Data Converters](https://www.digsilent.de/en/data-converter.html), [Short-Circuit Analysis](https://www.digsilent.de/en/short-circuit-analysis.html), dan [automatic relay creation from CSV](https://www.digsilent.de/en/faq-reader-powerfactory/how-can-i-create-relay-elements-in-my-projects-automatically.html).

Data setting relay dapat dikirim sebagai protection-study input bila model relay yang relevan tersedia di PowerFactory. Namun topology/electrical-model package dan protection-setting package tetap dua bagian berbeda: setting relay tidak dapat menggantikan line/source/transformer model yang dibutuhkan untuk menghitung fault level.

### Audit availability of calculation inputs

Audit dilakukan terhadap workbook crosscheck dan `Data Setting Penghantar UPT DKSBI (1).xlsx`.

| Input engineering | Availability | Source and limitation |
|---|---|---|
| Topology from/to dan terminal | **Available** | Sheet `DB`; 1.183 line records. Snapshot DIgSILENT Maret 2021, sehingga proyek baru harus masuk sebagai versioned delta. |
| Panjang, rating, R1/X1/R0/X0, Z1, angle, k0 | **Available** | Sheet `DB`. Nilai berasal dari export line object DIgSILENT dan cukup kuat sebagai historical baseline. |
| Arus hubung singkat 1-fasa dan 3-fasa | **Available, historical** | Sheet `IHS`; 1.122 records, judul Semester 1 Tahun 2021. Terdapat impedansi urutan R1/X1/R2/X2/R0/X0 dalam pu dan dua kelompok hasil arus gangguan, tetapi bukan scenario library max/min yang ter-version dengan lengkap. |
| CT/PT per bay | **Mostly available** | `MASTER_PHT`: CT MPU 180/184 record, CT BPU 180/184, PT 184/184. Tetap perlu polarity/core/class/location untuk engineering yang lebih detail. |
| CCC, panjang, conductor, ukuran conductor | **Mostly available** | `MASTER_PHT`: manual/fallback length 177/184; CCC, conductor, dan size masing-masing 180/184. Linked-source fields hanya lengkap 143/184, sehingga provenance dan precedence harus eksplisit. |
| TAP dan actual setting lintas fungsi/vendor | **Available** | Sheet `LCD`, `DIST`, `OCR_PHT`, `AR`, `SYNCHRO`, `OCR_KOPEL`, `BUSPRO`, `CBF`, dan lainnya. Ini adalah basis kuat untuk semantic multi-vendor benchmark. |
| Relay brand/model/serial/function | **Available** | Relay Catalog: 555 aset dan 73 model. Family yang mempunyai manual reference saat ini menaungi 336 aset; capability extraction belum dilakukan. |
| Transformer MVA, %Z, winding, NGR, CT | **Partial** | Ada pada sheet/template perhitungan dan sebagian XMCD, tetapi belum menjadi transformer master yang konsisten untuk seluruh GI/remote branch. |
| Generator/source contribution, infeed, serta operating scenarios max/min | **Insufficient as current model** | `IHS` menyimpan hasil snapshot, bukan model scenario dan contribution per source yang dapat dihitung ulang setelah perubahan topology. Data terbaru harus berasal dari study DIgSILENT/P2B. |
| Data proyek sisipan GI pasca-2021 | **Not available by definition** | Harus dibuat sebagai Engineering Change Set, lalu divalidasi melalui study baru. |

Case P545 Ciledug–Alam Sutera membuktikan perlunya data provenance:

- `DB!T311:AZ311` memiliki line Ciledug–Alam Sutra, panjang 3,25 km dan Z1 sekitar 0,208 ohm.
- `MASTER_PHT!A136:AH136` memiliki CT 3000/1, PT 150 kV/100 V, CCC 1.428 A, cable 2x1000 mm2, dan panjang 3,25 km.
- XMCD menggunakan panjang, CT/PT, CCC, dan positive-sequence impedance yang konsisten dengan dua sumber tersebut.
- Rating line DIgSILENT adalah 1,86 kA sementara operational CCC di master adalah 1,428 kA; keduanya harus disimpan sebagai atribut berbeda dan tidak boleh saling overwrite.
- XMCD menggunakan `Ihs3f = 26,24 kA` untuk perhitungan resistive reach/arc resistance, sedangkan `IHS!F144:S145` menunjukkan 3-phase fault sekitar 33,22 kA untuk Ciledug pada snapshot Semester 1 2021.
- `LCD!A136:AT136` mengidentifikasi relay Ciledug–Alam Sutera #1 sebagai MiCOM P543, sedangkan nama XMCD menyebut P545. Ini harus diperlakukan sebagai possible relay/version change atau document-label conflict sampai effective date dan asset evidence dikonfirmasi.

Perbedaan fault current itu tidak boleh langsung dianggap salah satu sumber keliru. Kemungkinan besar scenario, topology, waktu study, atau operating condition berbeda. MVP 2A harus menyimpan `StudyScenario`, `calculatedAt`, network revision, source document, method, dan max/min condition bersama setiap fault level.

## Strategic Positioning: PLMS sebagai Self-Contained Network Graph Builder

> **Update arah (2026-07)**: PLMS **dipisah sepenuhnya** dari proyek NMM eksternal (`pln_nmm_coba`), bukan sekadar di-pause. NMM adalah konsep CIM/CGMES-based XML yang jauh lebih besar cakupannya (enterprise-level network model yang idealnya align dengan DIgSILENT/P2B), dan pembangunan format CIM-based itu sendiri panjang. PLMS tidak menunggu itu — PLMS jalan dengan data yang sudah tersedia sekarang (SLD, legacy crosscheck workbook/DIgSILENT line DB, dokumen setting), dan membangun graph network-nya sendiri secara independen. Detail keputusan ini ada di bagian [Hubungan dengan Project Lain](#hubungan-dengan-project-lain).

### Masalah inti: matcher PLMS bekerja per-record, bukan per-graph

Root cause dari "mapping relasi antar-GI ga pernah selesai" itu struktural, bukan cuma soal UX:

- `matcher.ts` menerima satu baris import (satu bay/circuit dari OCR, Excel, atau dokumen setting) dan mencoba menjodohkannya ke satu `LineRelation` yang **sudah ada** di seed. Tidak ada langkah yang melihat keseluruhan bulk input sebagai satu graph dulu.
- Setiap baris yang gagal match jatuh ke Inbox sebagai keputusan terpisah (`ambiguous` / `needs_relation` / `needs_substation`). Kalau satu GI baru datang dengan 6 bay, itu jadi 6 keputusan manual, bukan 1 keputusan "ini GI baru beserta semua relasinya."
- Sumber data yang justru paling eksplisit soal relasi antar-GI (`digsilentLineDb` dari legacy crosscheck workbook — 610 substation, 1183 line, dengan field `fromSubstation`/`toSubstation` langsung) **tidak dipakai** oleh matcher. Yang dipakai matcher adalah sumber paling implisit: string bay bebas-format seperti `"PHT 150kV DURIKOSAMBI#1"`, yang remote endpoint-nya harus di-*infer* lewat regex (`inferRemoteEndpoint` di `normalization.ts`). Inferensi string inilah sumber utama ambiguitas yang menumpuk di Inbox.
- `normalizeStationName` men-strip token `gi|gis|gistet|gitet` untuk memudahkan fuzzy match. Ini berbahaya untuk kasus seperti **GI dan GIS Muarakarang Baru**: dua substation berbeda (site fisik terpisah hasil migrasi) yang secara administratif punya nama dasar sama, tapi tetap butuh direpresentasikan sebagai dua node berbeda karena outgoing bay eksisting dari sisi GI lama tetap dipakai (keterbatasan ruang untuk geser tower). Normalisasi yang menghapus GI/GIS bisa collapse dua node fisik berbeda jadi satu — salah secara topological, bukan cuma kosmetik.
- Model graph saat ini juga cuma line-to-line antar-GI (`busbars: []`, `terminals: []` selalu kosong di `buildUnifiedNetwork`, dan `nmm-generator.ts` eksplisit bilang "transformer/coupler/section bays are out of POC scope"). Ini tidak cukup untuk kasus nyata di lapangan: **Z2/Z3 distance protection kadang menembak sampai ke trafo di GI seberang**, bukan berhenti di line berikutnya. Reach zone harus bisa dihitung sampai elemen bay manapun (line, trafo, busbar), bukan cuma "sampai GI seberang" sebagai blackbox.

### Arah baru: graph generation dari bulk input, anchor bertingkat

Alih-alih PLMS jadi lapisan protection-metadata di atas topology yang dipegang sistem lain, PLMS sendiri yang generate network graph per-GI dari bulk input user (SLD dan/atau kumpulan setting dokumen), dengan urutan anchor:

```text
1. SLD per-GI (scope)         -> tentukan substation mana saja yang relevan
                                  (mempersempit dari skala se-Jawa-Bali ke
                                  scope ULTG yang sedang dikerjakan)
2. digsilentLineDb (topology)  -> untuk substation dalam scope itu, pakai
                                  field fromSubstation/toSubstation yang
                                  sudah eksplisit sebagai anchor relasi
                                  antar-GI — tidak perlu infer dari string bay
3. Setting docs (overlay)      -> OCR/LCD+DIST/Mathcad mengisi detail per bay
                                  di atas anchor topology yang sudah ada:
                                  CT/VT, relay IED, setting value, TAP source
4. User confirmation per-GI    -> satu keputusan untuk satu GI + seluruh bay/
                                  relasinya sekaligus, bukan satu keputusan
                                  per baris/record
```

Implikasi desain terhadap model data (`unified.ts`):

- Graph internal per-GI perlu sampai level bay/elemen (busbar → bay → trafo/line → terminal), bukan cuma titik GI-ke-GI, supaya reach zone yang menembak trafo bisa direpresentasikan dan dihitung dengan benar.
- Dua substation dengan nama dasar sama tapi site fisik berbeda (kasus migrasi GI→GIS) harus tetap jadi dua node id terpisah; normalisasi nama untuk fuzzy-matching tidak boleh menghilangkan informasi yang topologically signifikan.
- Unit kerja Inbox/konfirmasi bergeser dari per-record menjadi per-GI: user meninjau satu GI baru (semua bay, relasi, dan kandidat match sekaligus) dalam satu keputusan, bukan menyetujui satu-satu.

### Status kerja

Yang sudah dilakukan:
- Audit skala dan pola data source yang sudah ter-index (lihat poin masalah inti di atas).
- Menyepakati urutan anchor (SLD scope → digsilentLineDb topology → setting docs overlay → konfirmasi per-GI).
- Menyepakati granularitas graph perlu sampai level bay/elemen, bukan hanya GI-to-GI.
- Fix bug identity collapse di `normalizeStationName`: ditambahkan `normalizeSubstationIdentity()` (mempertahankan token GI/GIS) untuk titik yang menentukan apakah dua substation adalah entitas sama (`mini-nmm.ts` `findCaseSubstation`, dedup-check di `MiniNmmEditor.tsx`). Fuzzy matching (matcher.ts, inferensi remote endpoint) tetap pakai `normalizeStationName` lama — itu memang perilaku yang tepat untuk pencarian kandidat.
- Riset prinsip proteksi untuk kasus Z2/Z3 menembak trafo: berdasarkan referensi (SEL zone-3 setting practice, PSRC application guide), reach harus di-set untuk mencakup cabang yang impedansinya paling besar/menentukan di remote bus (line lanjutan ATAU trafo), bukan default ke "line berikutnya". Ini butuh representasi multi-kandidat, bukan field tunggal.
- Ditambahkan tipe data baru di `unified.ts`: `Transformer` (bay trafo dengan impedansi HV/LV) dan `RemoteBusBranch` (kandidat reach di remote bus suatu `LineRelation` — bisa line lanjutan atau trafo, dengan `xOhm` masing-masing untuk dibandingkan). Keduanya array opsional baru di `UnifiedNetwork`, backward compatible (build + typecheck sudah diverifikasi tidak regresi).
- **Graph builder generik pertama** ditambahkan di `src/domain/graph-builder.ts` (belum disambungkan ke UI/store — dites lewat `scripts/test-graph-builder.ts`). Pipeline: `resolveUltgScope()` membaca `sld-source-index.json` (17 folder GI/GIS ULTG Durikosambi) sebagai scope, `buildAnchorTopology()` memfilter `digsilentLineDb` (610 substation se-Jawa-Bali) ke substation dalam scope itu dan membangun `Substation`/`Bay`/`LineRelation` dari field eksplisit (`fromSubstation`/`toSubstation`/`fromTerminal`/`toTerminal`/impedance) — tanpa infer dari string bay, `overlaySettingDocs()` menempelkan detail relay/CT/VT dari LCD+DIST dan OCR registry ke bay yang sudah ada di anchor (overlay, bukan pembentuk topology baru), lalu `buildGraphForUltg()` mengelompokkan semuanya jadi satu `GraphBuildGroup` per substation — satu unit untuk direview, bukan satu per baris.
  - Hasil awal terhadap data nyata: dari 17 folder SLD, 9 awalnya tidak punya entri eksplisit di digsilentLineDb sama sekali. Ditemukan dan diperbaiki dua bug selama verifikasi: (1) circuit tidak bisa diparse dari suffix nama record (`"ANGKE-ANCOL -1"` pakai dash+arabic, tapi `"DKSBI-GGLII I"` pakai roman numeral yang justru bagian dari singkatan nama site "Grogol II") — diganti jadi assignment berbasis urutan kemunculan per pasangan substation, bukan parsing string; (2) dua site fisik berbeda dengan nama mirip (mis. "GROGOL" vs "GROGOL II") bisa collapse jadi satu label tampilan kalau keduanya match scope SLD yang sama — diperbaiki agar substation baru mempertahankan qualifier pembeda (mis. "II") dari nama asli DIgSILENT, bukan otomatis pakai nama scope.
  - **Alias table eksplisit (`DIGSILENT_TO_SLD_ALIAS`)** ditambahkan untuk 3 kasus yang dikonfirmasi manual oleh engineer (bukan tebakan algoritma — disambiguasi by design harus bersumber dari konfirmasi lapangan, karena tebakan yang salah berisiko menggabungkan dua GI fisik berbeda menjadi satu):
    - `"M. KARANG LAMA"` (2021) = **GI Muarakarang Lama** (SLD 2022, folder-nya sendiri cuma bernama "GI MUARAKARANG"; disingkat MKLMA di kode line — ditampilkan dengan "Lama" eksplisit lewat `DISPLAY_NAME_OVERRIDE` supaya tidak ambigu terhadap sisi Baru).
    - `"M. KARANG BARU"` (2021) = **GIS Muarakarang Baru** (SLD 2022; disingkat MKBRU — line ke arah PIK sudah migrasi ke sini).
    - `"GROGOL II"` (2021) = **GIS Grogol Baru** (SLD 2022; ganti konvensi penamaan II → Baru).
    - Catatan: alias harus dibandingkan pakai identity key (token GI/GIS dipertahankan), bukan fuzzy key — karena "GI Muarakarang Baru" dan "GIS Muarakarang Baru" adalah dua site fisik berbeda (kasus migrasi) yang fuzzy key-nya kebetulan sama persis; pakai fuzzy key untuk alias sempat menyebabkan salah satu grup ganda/duplikat, sudah diperbaiki.
    - **Alias-matching (menentukan scope) dan display-name override (menentukan label) sengaja dua mekanisme terpisah** (`DIGSILENT_TO_SLD_ALIAS` vs `DISPLAY_NAME_OVERRIDE`) — nama folder SLD asli tidak selalu jadi label yang cukup jelas untuk ditampilkan apa adanya.
    - Site pasca-migrasi yang tidak punya anchor 2021 sama sekali (**GI Muarakarang Baru** yang sebenarnya, GI Dadap, GIS Kembangan, GIS Ulujami, GISTET Durikosambi, GISTET Kembangan — total 6 dari 17) tetap `needsManualTopology: true`. Ini bukan bug — Dadap/Ulujami memang energize pasca-2022, dan `GI Muarakarang Baru` (site ketiga hasil migrasi, cuma punya 2 line ke GI Muarakarang Lama + GIS Muarakarang Baru) memang tidak direkam sebagai entitas terpisah di workbook 2021.
- **Graph builder disambungkan ke store dan UI Inbox** (`GraphBuilderSection` di `InboxView.tsx`, action `confirmGraphBuildGroup`/`rejectGraphBuildGroup` di store). Satu keputusan per-GI: expand untuk lihat detail (bay/relasi/overlay yang belum match), lalu Confirm (commit substation+bays+relations ke network graph override sekaligus) atau Reject. Diverifikasi jalan end-to-end di browser (Playwright), termasuk efek riak yang benar ke section Inbox lama (angka Functional Drift/Coverage Expansion ikut berubah setelah confirm, karena keduanya baca dari network graph yang sama).
  - **UX guard**: tombol Confirm disabled sampai reviewer benar-benar expand detail GI itu — mencegah commit 10+ bay/relation dalam satu klik tanpa pernah melihat isinya.
  - **Ringkasan global**: header section menampilkan total baris setting-doc (LCD+DIST/OCR) yang belum ter-match ke bay anchor manapun di seluruh ULTG, bukan cuma per-card.
- **Rename "mini-NMM" → "Network Graph"** di seluruh codebase (58 identifier, 3 file, lintas ~25 file). Nama lama adalah sisa dari konsep lama (PLMS sebagai bridge ke proyek NMM eksternal) dan menyesatkan sekarang bahwa NMM sudah dipisah total — meskipun secara fungsi `getEffectiveNetworkGraph`/`networkGraphOverrides` dkk selalu murni struktur data internal PLMS, tidak pernah punya dependency ke NMM eksternal. `src/domain/mini-nmm.ts` → `network-graph.ts`, `MiniNmmEditor(View).tsx` → `NetworkGraphEditor(View).tsx`, tab id `mini-nmm-editor` → `network-graph-editor`. Ditambahkan migrasi persisted state (`useProsetStore.ts`, version 10→11) supaya data localStorage user existing tidak hilang diam-diam akibat rename field.
- **Audit "apakah view lain melihat hasil confirm graph-builder"** menemukan 4 dari 5 view sudah override-aware (`VerifiedReportView`, `LineRegistryView`, `StudyDashboardView` sepenuhnya; `StudyWizard` juga — labelnya sempat salah "unmapped" untuk relation yang GI lawannya belum di-confirm, sudah diperbaiki jadi "menunggu GI lawan di-confirm"). **`MasterDataView` tab GI/GIS diperbaiki**: sebelumnya cuma render `ULTG_INVENTORY_NODES` (17 seed statis) sebagai daftar baris utama, sekarang digabung dengan node baru yang cuma ada di effective network graph (dedup by `normalizeStationName`) — GI yang baru di-confirm di Inbox (misal GI Angke) sekarang ikut muncul sebagai baris baru dengan badge "modeled", bukan hilang dari tab ini. **`CoverageView` tetap TIDAK override-aware** (lihat poin coverage engine di atas) — bukan quick-fix karena arsitekturnya (`seed-corridor.ts`) memang beda total dari `UnifiedNetwork`.
- **Restrukturisasi navigasi sidebar: "Working Network" dan "Data Mapping Inbox" dipindah keluar dari sub-menu Study, ke grup baru "Network & Mapping"** (`src/components/layout/AppShell.tsx`). Sebelumnya keduanya ada di `STUDY_ITEMS` — implikasinya, di UI, "Data Mapping Inbox" (isinya `GraphBuilderSection` yang mencakup 26 GI seluruh ULTG) tampak seolah scoped ke satu Study/koridor (mis. "Koridor DKS - DM - PIK - MKB", cuma 6 substation), padahal konsepnya tidak pernah begitu — konfirmasi topology antar-GI itu kerja level-ULTG yang mendahului dan lepas dari Study manapun. Study seharusnya baru dibuat *setelah* graph sudah dikonfirmasi, sebagai unit kerja "hitung setting untuk bay/line tertentu". Struktur baru: "Master Data" (data referensi statis: GI & Network, Network Builder, Source Documents) → **"Network & Mapping" (proses aktif level-ULTG: Working Network, Data Mapping Inbox)** → "Studies" (kerja per-bay/line: Bay List, Setting Register, Calculation, Comparison, Coverage Check, Verified Report). Diverifikasi di browser: Inbox sekarang independen, tidak lagi ikut ter-collapse/expand bersama sidebar Study.
- **shortCode GI diselaraskan dengan konvensi singkatan asli `digsilentLineDb`**, bukan tebakan generik dari nama tampilan. Ditambahkan `extractDigsilentShortCodes()` di `graph-builder.ts`: heuristic frekuensi yang menganalisis token di `record.name` (mis. `"DKSBI-GGLII I"`) dan mengeklusi token yang tampak milik substation lawan pada line tersebut, supaya hasilnya bukan tebakan prefix generik ("DURIKOSAMBI" tanpa ini akan jadi "DUR", bukan "DKSBI" yang benar). Berhasil ekstrak otomatis dengan benar untuk 15 GI (DKSBI, CNKRG, KBJRK, KRBRU, BDKMY, KTPNG, MKLMA, MKBRU, GGLII, SNYAN, DNYSA, PTKGN, dll). Sisanya (ambigu atau tidak pernah disingkat sama sekali di data 2021) di-override manual lewat `SHORTCODE_OVERRIDE` setelah dikonfirmasi engineer: **KARET** (heuristic sempat menebak kode milik bay tetangga), **GROGOL** (ambigu vs kode "Grogol II"), **PINKA** (Pantai Indah Kapuk — datanya ada di digsilentLineDb tapi belum pernah diberi kode karena situsnya relatif baru), **DNMGT** (Daan Mogot, sama alasannya). Pola sama dengan `DIGSILENT_TO_SLD_ALIAS`/`DISPLAY_NAME_OVERRIDE`: append-only, sumber dari konfirmasi eksplisit, bukan tebakan otomatis yang digeneralisasi.
- **Status lifecycle baru: `"superseded"`** ditambahkan ke `LifecycleStatus` (`unified.ts`) — beda makna dari `"rejected"` (data salah/ditolak): `superseded` berarti data itu **benar tapi sudah tidak berlaku secara fisik**, dipakai untuk `LineRelation` yang digantikan topology baru (bukan dihapus, supaya audit trail kenapa segmen baru ada tetap tersimpan). Menambah status baru ini ternyata beririsan dengan 6 file yang melakukan exhaustive type-check terhadap `LifecycleStatus` (`Record<LifecycleStatus, ...>` atau union literal manual yang lupa disinkronkan) — semuanya diperbaiki: `InboxView.tsx`, `LineRegistryView.tsx`, `LineDetailPanel.tsx`, `NetworkModelView.tsx`, `bridge-export.ts` (2 union literal manual diganti reuse tipe `LifecycleStatus`, bukan didaftar ulang).
- **Bug ditemukan dan diperbaiki saat membangun fitur sisipan GI: `getEffectiveNetworkGraph` (`network-graph.ts`) menggabungkan seed + override dengan `[...base.X, ...ov.X]` (concat), bukan upsert-by-id.** Ini berarti kalau override membawa entity dengan `id` yang sama seperti entity di seed (mis. menandai `LineRelation` seed jadi `superseded`), hasilnya adalah **dua entri dengan id sama** di array gabungan (duplikat), bukan versi baru menimpa versi lama — karena tidak ada consumer downstream yang dedup by id. Diperbaiki: semua field (`substations`, `busbars`, `bays`, `terminals`, `lineRelations`, `relayIeds`, `transformers`, `remoteBusBranches`) sekarang di-upsert by id terhadap base, konsisten dengan cara override menimpa dirinya sendiri di tempat lain.
- **Fitur baru: "Sisipkan GI ke Line Existing" di Network Builder** (`InsertSubstationForm` di `NetworkGraphEditor.tsx`, action `insertSubstationIntoLine` di store) — untuk kasus proyek yang memotong line fisik existing dengan menyisipkan GI baru di tengahnya (kasus nyata: **Grogol Baru, proyek 2023, memotong line DKSBI-GROGOL yang sebelumnya satu segmen utuh** — datanya tidak akan pernah ada di `digsilentLineDb` karena workbook itu snapshot 2021). Alur: pilih line existing yang akan disisipi → isi nama/short code GI baru → isi impedansi (X ohm) dan panjang (km) untuk 2 segmen hasil pemotongan → submit menandai line lama `superseded` sekaligus membuat GI baru + 2 `LineRelation` baru (dengan bay/busbar/terminal masing-masing) dalam satu transaksi. Diverifikasi end-to-end di browser: status `superseded` tersimpan benar di localStorage, tidak duplikat dengan relation baru.
  - **Data yang dibutuhkan user untuk pakai fitur ini** (dari kasus Grogol Baru): (1) impedansi R/X tiap segmen baru hasil pemotongan, (2) panjang/jarak kabel tiap segmen, (3) bay & terminal assignment di GI baru (relay/CT/VT per bay) — 3 data ini biasanya berasal dari studi ulang DIgSILENT internal P2B atau dokumen komisioning proyek, bukan dari `digsilentLineDb` (snapshot 2021, tidak akan pernah punya proyek 2023). Setting relay (Z1/Z2/Z3, CT/VT) untuk bay-bay di GI baru itu sendiri bisa diisi lewat jalur existing (upload TAP setting PDF ke Source Documents → OCR → promote), begitu bay-nya sudah ada dari fitur sisipan ini.
- **Study seed contoh diperbaiki: dari 1 Study "koridor" yang salah scope, jadi 2 Study per subject line, berbasis data graph-builder (bukan generator lama).** Study lama (`case_dks_dm_pik_mkb` seed, dibangun `generateCorridorNmm()`) menggabungkan 6 GI (DKS/DM/PIK/MKB + cabang GRB/KBJ) jadi **satu** Study, padahal itu beberapa subject line berbeda yang seharusnya masing-masing jadi Study sendiri — sesuai definisi PLMS sendiri bahwa Study = "uji proteksi untuk satu penghantar", bukan gabungan banyak line sekaligus. Diganti jadi 2 Study contoh: **"Penghantar DKSBI - DNMGT"** (subject DKSBI-DNMGT, neighbor DNMGT-PINKA untuk konteks Z2/Z3 forward-chain) dan **"Penghantar DNMGT - PINKA"** (subject DNMGT-PINKA, neighbor DKSBI-DNMGT reverse + PINKA-MB forward). `subjectBayId`/`subjectLineId` sekarang eksplisit terisi (Study lama tidak punya ini sama sekali).
  - **Topology sumbernya juga diganti**: `NETWORK_GRAPH_DKS_PIK` (seed untuk case id `case_dks_dm_pik_mkb`, dipakai `activeNetworkCaseId` default) sekarang dibangun dari `buildGraphForUltg()` (anchor `digsilentLineDb`, shortCode DKSBI/DNMGT/PINKA/MB yang benar) — bukan lagi `generateCorridorNmm()` (generator lama dengan id/shortCode buatan sendiri "dks"/"dm"/"pik"/"mkb"). Ditambahkan `buildCaseFromGraphGroups()` di `graph-builder.ts` untuk menggabungkan subset `GraphBuildGroup` terpilih jadi satu `UnifiedNetwork` case (line relation dan bay yang endpoint-nya di luar subset dibuang, supaya tidak ada referensi menggantung).
  - **`seed-corridor.ts` (sumber `CoverageView`, sebelumnya di backlog "1D linear, bukan quick-fix") ikut diperbaiki sebagai bagian dari perubahan ini**: `orderedNodes` yang tadinya hardcode `["dks","dm","pik","mkb"]` sekarang dihitung dinamis lewat `deriveLinearNodeOrder()` (traversal graph dari satu ujung chain, mengikuti `NETWORK_GRAPH_LINES` yang ada) — begitu juga `CORRIDORS[0].label` dan `start_substation_id` yang sebelumnya hardcode string. Catatan: traversal ini masih berasumsi corridor berbentuk chain linear sederhana (tiap node maksimal 2 tetangga line) — kalau nanti seed diperluas jadi bercabang, `deriveLinearNodeOrder` akan berhenti lebih awal, bukan otomatis pilih jalur terbaik. Coverage engine yang sesungguhnya (perhitungan Z1/Z2/Z3 di `corridor-math.ts`) tetap belum graph-aware — ini cuma perbaikan supaya data *input*-nya benar, bukan penyelesaian penuh backlog itu.
  - **Bug ditemukan dan diperbaiki saat verifikasi: bundle size regresi ~2x (380kB → 795kB).** `network-graph.ts` awalnya memanggil `buildGraphForUltg()` langsung di module scope, tapi `network-graph.ts` di-import hampir di semua komponen, sehingga `crosscheck-workbook-registry.json` (1.2 MB, sebelumnya lazy-loaded khusus untuk Inbox) ikut ter-bundle ke chunk utama aplikasi. Diperbaiki dengan precompute: `scripts/generate-demo-corridor-seed.ts` (dijalankan sekali via `npm run generate:demo-seed`) menjalankan pipeline graph-builder dan menulis hasilnya ke `src/domain/generated/demo-corridor-seed.json`; `network-graph.ts` membaca JSON kecil itu, bukan memanggil pipeline penuh. Bundle utama kembali ke ~383 kB setelah perbaikan ini.
  - **Migrasi persisted state ditambahkan** (`useProsetStore.ts`, version 11→12): kalau user masih punya localStorage dengan *persis* satu Study lama (`study_dks_dm_pik_mkb`, belum pernah diedit), otomatis diganti ke 2 Study baru. Study yang sudah dimodifikasi user tidak disentuh.

**Keputusan roadmap calculation (2026-07-29):**
- Bentuk akhir tools sudah ditetapkan pada bagian [MVP Roadmap and Current Status](#mvp-roadmap-and-current-status): calculation engine menghasilkan `Canonical Setting Package`, kemudian TAP composer dan adapter vendor menghasilkan artifact masing-masing. Perubahan topology seperti sisipan GI menjadi trigger impact review/re-calculation; perhitungan tidak diikat langsung ke format file satu vendor.

**Belum dikerjakan / backlog terbuka:**
- **Coverage engine (`src/lib/corridor-math.ts`, `src/lib/coordination-checks.ts`) masih 1D linear murni** (`Corridor.ordered_segment_ids`, model `domain/types.ts` yang terpisah dari `unified.ts`) — secara struktural belum bisa menghitung Z2/Z3 dengan mempertimbangkan percabangan (`RemoteBusBranch`) sama sekali. Tipe data baru di `unified.ts` belum "hidup" di perhitungan. `seed-corridor.ts` sekarang sudah dinamis untuk urutan node/label/start (lihat poin Study seed di atas), jadi *input*-nya sudah benar, tapi *perhitungan* Z1/Z2/Z3 itu sendiri masih 1D dan tidak bisa menembus ke trafo/percabangan — corridor-math yang harus jadi graph-aware itu sendiri belum dikerjakan, masih pekerjaan terpisah dan cukup besar.
- `generateCorridorNmm()` (`nmm-generator.ts`) sudah tidak dipanggil dari mana pun lagi — seed demo sekarang dari `buildGraphForUltg()`. Fungsinya belum dihapus (masih ada di file), jadi ini dead code yang perlu dibersihkan atau dihapus eksplisit di kesempatan berikutnya, bukan sesuatu yang "belum diganti".
- Redesign matcher untuk operasi per-GI/batch (bukan per-record) belum dikerjakan — `overlaySettingDocs()` di graph builder baru mengumpulkan overlay per-GI, tapi Inbox/`matcher.ts` yang lama (section Functional Drift/Pending Mapping/dst) masih beroperasi per-record berdampingan dengan section baru.
- **Visualisasi SLD (diagram single-line) belum ada penggantinya sama sekali.** Salah satu peran NMM yang dulu direncanakan adalah render diagram visual dari topology (bukan cuma data). Sekarang PLMS punya topology yang benar (graph builder) tapi hanya direpresentasikan sebagai list/card di UI (Inbox, Network Builder) — belum ada rendering diagram SLD. Ini gap nyata, dicatat sebagai backlog terpisah: perlu diputuskan nanti apakah PLMS generate diagram sendiri dari data `UnifiedNetwork`, atau cukup menerima SLD asli (PDF/gambar) sebagai referensi visual tanpa generate ulang.
- `DIGSILENT_TO_SLD_ALIAS` dan `DISPLAY_NAME_OVERRIDE` sengaja append-only dan bersumber dari konfirmasi eksplisit engineer, bukan inferensi — kalau ada GI lain yang butuh disambiguasi/relabel serupa (misal ada singkatan tidak standar lain seperti "M. KARANG LAMA"), tambahkan ke situ setelah dikonfirmasi, jangan digeneralisasi jadi heuristic otomatis.
- Populate `Transformer`/`RemoteBusBranch` dari data nyata belum dikerjakan — tipenya baru ada, belum ada yang mengisi.
- **Calculation engine saat ini masih generik, belum rule/profile per model relay.** Reference Engine sudah menjalankan OCR/GFR, trafo, dan distance, tetapi port formula/policy spesifik MiCOM P545 baru masuk roadmap MVP 2B. LCD dan AR/SYNC masih blueprint. Template busbar protection belum ada. Pemisahan yang dipilih: engineering rule menyimpan intent canonical, sedangkan capability/address/scaling vendor berada di relay profile/adapter.
- `CoverageView.tsx` tidak override-aware sama sekali — konsekuensi langsung dari poin coverage engine di atas, bukan gap terpisah. Baru bisa diperbaiki setelah/bersamaan dengan corridor-math dibuat graph-aware.

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
- Study contoh: dua Study per subject line (bukan satu Study gabungan) — "Penghantar DKSBI - DNMGT" dan "Penghantar DNMGT - PINKA", keduanya dari seed graph-builder (lihat Strategic Positioning).
- Neighborhood untuk distance coverage:
  - DKSBI - DNMGT sebagai primary subject (Study 1).
  - DNMGT - PINKA - MB sebagai forward chain (Study 2, dengan DKSBI-DNMGT sebagai reverse-side neighbor).
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
- Native vendor setting-file writer dan deployment ke IED.
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
- Data Mapping Inbox untuk review/import candidate, termasuk Graph Builder untuk konfirmasi topology per-GI (lihat Strategic Positioning). Menu ini ada di grup "Network & Mapping", terpisah dari Study — kerja level-ULTG yang mendahului Study manapun.
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
- MVP 1A Reference Engine:
  - executable reference calculation untuk OCR/GFR penghantar/kopel, trafo, dan distance
  - lookup data fault/line, opposite station dan suggested distance legs
  - formula trace, warning, unit, serta regression parity terhadap benchmark workbook
- MVP 1B Crosscheck:
  - input actual setting manual/plain text/CSV-like
  - normalization dan manual parameter mapping
  - tolerance profile serta klasifikasi match/deviation/missing/unmapped
- MVP 1C Source and Vendor Intake pilot:
  - parser MiCOM Courier `.set` untuk fixture P443/P545
  - normalized TAP PDF adapter dan handoff ke Crosscheck
  - relay catalog UPT Durikosambi dengan brand/model/function/bay mapping, manual reference, dan parser readiness
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

### 2. Bangun/Konfirmasi Network Graph (Network & Mapping)

Ini langkah pertama yang sebenarnya, **sebelum** membuat Study — konfirmasi topology antar-GI adalah kerja level-ULTG yang lepas dari Study/koridor manapun, karena Study nanti butuh graph yang sudah benar untuk bisa memilih subject bay/line-nya.

Di **Working Network**:

- lihat kandidat endpoint dari SLD/PDF source
- promosikan endpoint jadi LineRelation baru
- lengkapi GI/GIS, IED, CT/VT yang belum ada di registry

Di **Data Mapping Inbox**:

- **Graph Builder — Konfirmasi Topology per GI**: satu keputusan per-GI (bukan per-baris) untuk mengonfirmasi topology yang di-anchor dari `digsilentLineDb` (scoped oleh folder SLD ULTG) plus overlay setting-doc (LCD+DIST/OCR). Expand untuk lihat detail bay/relasi, lalu Confirm atau Reject.
- Section lama (per-record, dipertahankan berdampingan): Functional Drift, Ambiguous Mapping, Needs Relation, New Imports, Coverage Expansion, Missing Setting Values — engineer approve, reject, atau manual-map ke LineRelation.

Output:

- registry dan network graph bertambah dari dokumen existing/anchor DIgSILENT, tetapi tetap human-in-the-loop.
- candidate import berubah menjadi reviewed source; per-function promotion masuk ke Setting Register.
- topology antar-GI yang sudah confirmed siap dipakai sebagai basis Study.

### 3. Buat atau Buka Study

User klik `New Study` atau membuka study existing.

Study Wizard:

- memilih subject bay/line **dari network graph yang sudah dikonfirmasi di langkah sebelumnya**
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

### 4. Lihat Bay List / Study Dashboard

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

### 6. Buka Setting Register

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

### 7. Calculation Workbook

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

### 8. Engineering Validation dan TAP Setting Baru

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

### 9. Comparison Setelah Checking / Resetting

Setelah TAP baru diterbitkan, tim lapangan melakukan checking atau resetting. Hasil actual setting dibandingkan kembali dengan TAP terbaru.

Mismatch diklasifikasikan:

- match
- cosmetic
- functional

Output:

- engineer tahu apakah setting baru sudah benar-benar terpasang.
- mismatch functional bisa menjadi penugasan resetting atau review lanjutan.

### 10. Coverage Check

User melihat distance coverage:

- Z1/Z2/Z3 reach
- overlap antar relay
- backup gap
- time grading
- R-X plane drilldown

Output:

- engineer bisa melihat apakah setting coverage sudah reasonable untuk koridor.

### 11. Verified Report

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
  network-graph.ts             effective network graph adapter (seed + overrides)
  graph-builder.ts             per-GI graph builder (SLD scope -> digsilentLineDb anchor -> setting-doc overlay)
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
  graphBuildDecisions
  networkGraphOverrides
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
| Actual setting readback | manual/plain-text/CSV-like parser + comparison; MiCOM Courier adapter pilot | `Read from IED` via official vendor tool, retain native file + acquisition manifest, then parse native or derived structured export per vendor/model/version |
| MiCOM `.set` binary | Courier records parsed untuk fixture P443/P545 | hardening real sample, firmware support matrix, dan round-trip vendor tool |
| PST data | not integrated | backend connector or PST mock JSON |
| Mathcad templates | ABB REL670 dan MiCOM P545 `.xmcd` samples indexed; P545 Ciledug–Alam Sutera sudah didissect | port P545 ke rule typed + parity benchmark |

### Data Needed For Stronger Demo

| Data | Why needed | Minimal sample |
|---|---|---|
| Mathcad export/template | validate Calculation Workbook formula equivalence | P545 Ciledug–Alam Sutera menjadi pilot MVP 2B; perlu sign-off expected values/tolerance |
| Legacy crosscheck workbook | replace spreadsheet workflow with PLMS flow | workbook indexed; next step is UI mapping into Study Wizard and Calculation |
| Latest TAP setting PDF per side | baseline setting before engineering change and source evidence | PDF with text layer or scanned sample |
| New TAP setting output | official result from engineering calculation | generated from PLMS calculation workflow |
| Actual relay readback/checking result | baseline validation and post-resetting confirmation | native file hasil connected readback + device/tool/timestamp/active-group manifest; CSV/Excel/XML/XRIO/RIO hanya derived artifact bila tersedia |
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
| Source Snapshot + Study Scenario | DB/IHS/TAP/actual/Mathcad belum memiliki snapshot dan scenario contract yang konsisten. | 3-5 hari | Highest |
| Engineering Change Set + DIgSILENT staging | GI-insertion pilot sudah menghasilkan immutable delta, validation/readiness report, serta neutral JSON/CSV/DGS-like preview. Berikutnya: change type lain dan official PowerFactory adapter/round-trip validation di staging. | dependent on staging access | Medium |
| P545 calculation parity | Input contract typed/unit-aware sudah tersedia; berikutnya pindahkan formula XMCD Ciledug–Alam Sutera dan validasi semua hasil intermediate/final. | 1-2 minggu + engineer review | Highest |
| Canonical Setting Package | Schema source-of-truth untuk input, calculated value, policy value, override, provenance, dan approval belum ada. | 3-5 hari | Highest |
| TAP Report Composer | Printable report generik sudah ada; template TAP resmi multi-page, address table, revision, dan approval block belum ada. | 1 minggu | High |
| OCR/GFR hardening | Reference engine sudah executable; perlu curve/policy coverage yang lebih luas dan benchmark lebih banyak case nyata. | 3-5 hari setelah data fault tersedia | High |
| Line Differential / LCD workbook | Blueprint sudah ada; perlu field priority, CT matching rules, teleprotection/channel checklist dari TAP/vendor sample. | 3-5 hari | High |
| AR + SYNC workbook/checklist | Blueprint sudah ada; perlu policy operasi dan TAP sample untuk dead time, reclaim, sync window. | 2-4 hari | Medium |
| Vendor-import hardening | MiCOM parser pilot P443/P545 sudah ada; perlu real files lintas firmware, negative fixtures, dan support matrix. | dependent on samples | High |
| Relay Capability Profiles | Relay Catalog/manual references sudah ada, tetapi terminology, units, limits, characteristics, feature constraints, dan semantic mappings belum terstruktur. | 1-2 minggu untuk 3 pilot families | Highest |
| Multi-vendor conversion engine | Belum ada gap classification dan conversion rules dari canonical intent ke proposed settings MiCOM/ABB/Siemens. | 1-2 minggu setelah capability profiles | High |
| Approval workflow nyata | Lifecycle status sudah ada, tetapi belum ada role-based flow Engineer -> Reviewer -> Manager -> Issued. | 1 minggu | Medium |
| Native vendor writer | Didefer; kelak harus diuji official-tool round-trip dan dibandingkan dengan canonical package. | 2-4 minggu per validated adapter | Deferred |
| System-level fault data validation | Historical IHS 2021 tersedia, tetapi current max/min scenario, source contribution, network revision, dan post-project study belum tersedia. | dependent on DIgSILENT/P2B study | Highest |

### Data-Side Backlog

| Data | Asal | Saat ini | Yang dibutuhkan |
|---|---|---|---|
| Mathcad templates existing | File Mathcad PLN atau PDF export | 12 `.xmcd` indexed: 10 distance dan 2 LCD, lintas Siemens/GE/MiCOM/ABB/Toshiba | extract capability/formula semantics dan sign-off expected outputs |
| TAP setting terakhir | Dokumen engineering existing | sebagian ada | PDF per side untuk baseline comparison |
| Actual setting/checking result | Field Engineer / connected relay readback | sebagian seed comparison | native vendor file, relay identity, firmware, tool version, read timestamp, active group, checksum, dan structured export dari sesi yang sama |
| CT/VT detail lanjutan | PST atau registry aset | ratio structured sudah ada | accuracy class, knee voltage, polarity, location, manufacturer |
| Line impedance proper | PST atau line constant calculation | X-ohm equivalent | R, X, B per km positive/zero sequence, conductor, length, ground wire, soil resistivity |
| Short-circuit fault levels | PSAT / DIgSILENT study output | 1.122 historical IHS records Semester 1 2021 | current fault MVA/current 3-phase dan single-phase, max/min infeed, method, network revision, dan source contribution per bus |
| DIgSILENT line database | Legacy crosscheck workbook `DB` sheet | indexed dan dipakai Graph Builder sebagai topology anchor | hardening conductor/sequence impedance master dan update pasca-2021 |
| Asset register PST mock | PST PLN extract | belum ada | JSON sample: GI, bay, equipment hierarchy, CT/VT, line impedance, relay |
| More scanned TAP PDF samples | Document repo PLN | OCR engine ready | sample layout per vendor/format untuk hardening regex/template |
| MiCOM `.set` validation samples | MiCOM S1 Agile | fixture P443/P545 sudah dapat dibaca | real files lintas firmware + official-tool open/export/readback untuk support matrix |

### Recommended Next Priorities

1. **MVP 2B.2 — P545 calculation + Mathcad parity.** Port case Ciledug–Alam Sutera di atas input contract 2B.1 dan jelaskan deviasi seperti `Ihs3f` 26,24 kA vs IHS 2021 sekitar 33,22 kA.
2. **Tutup input blocker pilot.** Konfirmasi model/effective date P543 vs P545, CT/VT, forward/reverse equivalent, infeed, serta scenario fault yang disetujui engineer.
3. **Perluasan MVP 2A rules.** Tambahkan readiness matrix untuk new bay, reconductoring, CT/PT/relay replacement, serta cross-document conflicts saat use case masuk.
4. **MVP 2C — Canonical Setting Package + TAP Composer.** Strukturkan engineering intent, hasilkan draft PDF terkontrol, lalu re-import untuk crosscheck.
5. **MVP 2D — Relay Capability Profiles + conversion pilot.** Map P543/P545, RED670, serta 7SL87 dan hasilkan proposed settings + capability-gap report tanpa native vendor file.

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

### Cloudflare protected POC deployment

POC saat ini dapat diakses melalui Cloudflare Worker Static Assets:

- URL: `https://plms-poc-protected.hafizna-arsyil.workers.dev`
- Worker menjalankan authentication gate sebelum seluruh HTML/JS/JSON asset.
- Password disimpan sebagai encrypted Cloudflare secret dan tidak masuk Git.
- Deployment: `npm run cloudflare:deploy`.
- Rotasi password: `npx wrangler secret put PLMS_AUTH_PASSWORD`.
- Detail operasional tersedia di `CLOUDFLARE_DEPLOYMENT.md`.

Deployment ini menyelesaikan akses URL persisten, tetapi belum mengubah
Zustand/localStorage menjadi shared backend. Setiap browser tetap memiliki
working state sendiri.

### Database implementation timing

- Sampai MVP 2B.1, POC tetap memakai generated artifacts dan Zustand/localStorage; belum ada schema/database migration backend baru.
- Pemilihan final PostgreSQL schema, API boundary, object storage, authentication, dan deployment topology dibahas saat environment staging/dev sudah ditetapkan.
- Domain contracts `SourceSnapshot`, `StudyScenario`, `EngineeringChangeSet`, `DataReadinessResult`, dan staging package sengaja dibuat serializable agar dapat dipindahkan menjadi database rows/API payload tanpa mengubah engineering semantics.
- Local persistence bukan target production dan tidak boleh dipakai untuk multi-user approval atau issued record.

## Output Per Flow

| Flow | Input | Processing | Output |
|---|---|---|---|
| Source Intake | PDF TAP/SLD/Excel metadata | OCR/text extraction, field extraction | SourceIntakeRecord, extracted fields |
| Network Builder | GI, relation, IED, CT/VT | manual registry update | Network graph override, audit event |
| Engineering Data Update | topology insertion/reconductoring/new bay + technical evidence | versioned delta, supersede old segment, validate required electrical fields | Engineering Change Set + neutral DIgSILENT JSON/CSV/DGS-like staging preview |
| Study Feedback | DIgSILENT short-circuit/line export | match network revision, scenario, method, timestamp, and bus | versioned fault-level/source-impedance snapshot |
| Inbox Mapping | imported candidate | match, manual map, approve/reject | CandidateDecision, function promotion |
| Setting Register | LineRelation + sources | lifecycle rollup | line status and source evidence |
| Baseline Checking | latest TAP + installed setting | TAP vs actual comparison | baseline valid / cosmetic mismatch / functional mismatch |
| Calculation Template Library | function scope + required source data | template selector, inputs, formula blueprint, assumptions, Mathcad benchmark plan | executable Distance template and blueprint templates for OCR/GFR, LCD, AR/SYNC |
| Legacy Spreadsheet Replacement | DIgSILENT DB, IHS fault levels, Excel formulas | workbook indexer and formula mapping | normalized source registry and benchmark cases |
| Calculation | line, relay, CT/VT, impedance | selected template formula engine and snapshot save | engineering calculation, new TAP preview, calculation snapshot in Setting Register |
| Multi-vendor Conversion | canonical setting package + source/target capability profiles | semantic mapping, unit/basis conversion, constraint and unsupported-feature checks | proposed target settings + capability-gap report + vendor change sheet |
| TAP Issuance | approved calculation + validation evidence | engineering review workflow | new TAP setting package |
| Comparison | new TAP + post-checking actual setting | mismatch classifier | resetting confirmed / resetting required / review required |
| Coverage | relay zones and topology | reach and grading checks | overlap/gap/time diagnostics |
| Verified Report | active line study context | evidence aggregation | printable engineering report |

## Roadmap For 3-Month Pilot

### Month 1 - Stabilize MVP 1D and Deliver MVP 2A Foundation

Sasaran: menjadikan workflow Reference -> Import Actual -> Crosscheck sebagai baseline yang stabil sebelum menambah generator setting.

- Hardening regression test MVP 1A untuk OCR/GFR, trafo, dan distance dengan lebih banyak case workbook.
- Hardening MVP 1B normalization/mapping/tolerance dengan native actual-setting readback dan acquisition manifest nyata.
- Hardening MVP 1C MiCOM parser menggunakan real P443/P545 files dan dokumentasikan support matrix awal.
- Validasi Relay Catalog UPT Durikosambi: brand, model, bay, fungsi, CT/VT, manual, dan kecocokan topology.
- Pertahankan Network Graph sebagai foundation mandiri: SLD scope -> `digsilentLineDb` topology -> setting-doc overlay -> review per-GI.
- Extend `SourceSnapshot` dan `StudyScenario` yang sudah aktif untuk DB/IHS ke TAP/actual/Mathcad beserta network revision, effective date, dan checksum.
- Tetapkan `Engineering Change Set` untuk sisipan GI dan neutral DIgSILENT staging package.
- Tambahkan readiness/conflict validation; jangan mencampur hasil study berbeda tanpa scenario metadata.

Deliverable:

- Satu flow demo yang repeatable: reference calculation -> actual import -> normalized crosscheck -> evidence report.
- Relay inventory UPT Durikosambi dan parser-readiness matrix yang telah direview.
- DB/IHS 2021 tersimpan sebagai historical snapshots dan hanya dapat dipilih melalui scenario yang eksplisit.
- Satu change set sisipan GI menghasilkan old/new topology diff dan daftar electrical data yang masih kurang sebelum DIgSILENT study.

### Month 2 - MVP 2B P545 Calculation and Mathcad Parity

Sasaran: membuktikan PLMS dapat menghitung satu case P545 secara native dan menjelaskan setiap hasilnya.

- Port `Tap Setting MiCom P545 GI Ciledug Bay Alam Sutera #1.xmcd` menjadi rule module typed dan unit-aware.
- Implement line/UGC data, CT/PT conversion, Z1/Z2/Z3 forward, reverse distance, infeed, `kZ0`, resistive reach, load blinder, PSB, AR, dan LCD parameters yang terdapat pada case.
- Simpan input, formula trace, intermediate result, warning, override engineer, serta rule/template version.
- Buat Mathcad parity report dengan tolerance per output; deviasi tidak boleh disembunyikan oleh rounding.
- Hubungkan calculation result ke `Canonical Setting Package` dan Crosscheck engine.
- Mulai membuat calculation graph-aware untuk pilihan physical section/remote branch yang relevan.

Deliverable:

- Satu study Ciledug–Alam Sutera dapat dihitung tanpa menjalankan Mathcad.
- Side-by-side parity report PLMS vs Mathcad dengan tolerance yang disetujui engineer.
- Canonical P545 setting package yang dapat diekspor JSON/CSV dan dibaca kembali untuk verification.

### Month 3 - MVP 2C/2D TAP Composer, Multi-vendor Conversion, and Controlled Output

Sasaran: mengubah hasil calculation menjadi draft engineering document yang traceable dan output vendor-neutral yang siap direview.

- Implement TAP multi-page template menggunakan struktur dokumen PIK–Muarakarang Baru sebagai referensi layout.
- Pisahkan calculated setting, relay policy/profile setting, site-specific configuration, dan document metadata.
- Tambahkan document number, revision, validity, notes, page grouping, approval placeholder, dan watermark `DRAFT`.
- Map canonical P545 parameters ke address profile dan hasilkan vendor change sheet.
- Bentuk capability profiles awal MiCOM P543/P545, ABB RED670, dan Siemens 7SL87 dari manual, actual/TAP records, serta benchmark XMCD.
- Jalankan conversion pilot dari canonical P545 intent ke proposed RED670/7SL87 settings dengan klasifikasi exact/transformed/decision/unsupported.
- Tambahkan re-import + Crosscheck otomatis terhadap output yang baru dihasilkan.
- Tambahkan role-aware lifecycle `draft -> reviewed -> approved -> issued`, immutable issued snapshot, serta before/after diff.
- Native `.set`/vendor project export tidak dikerjakan dalam acceptance scope pilot.

Deliverable:

- End-to-end pilot: technical data -> P545 calculation -> parity evidence -> canonical package -> multi-vendor proposed setting/gap report -> draft TAP PDF -> re-import/crosscheck -> review.
- Draft TAP tidak disalahartikan sebagai dokumen issued.
- Conversion menunjukkan engineering equivalence dan gap; bukan sekadar salin address antar-relay.

## Long-Term Roadmap (Post-Pilot, 6-12 months)

Setelah pilot 3 bulan, target evolusi:

### Phase D1 - Template library expansion

- Extend calculation template library ke vendor lain (Toshiba GRZ, GE D60/L90, NR PCS, Schneider P44x/P14x).
- Each template di-derive dari pattern Mathcad existing + benchmark report.
- Extend `RelayCapabilityProfile` dan semantic conversion matrix berdasarkan actual assets, TAP, manual, dan supported firmware/order code.
- Template versioning + revision history.
- Engineer kontribusi template baru via UI (no code edit).

### Phase D2 - DIgSILENT/P2B integration

- Akses CGMES export dari P2B PowerFactory studies, kalau governance mengizinkan.
- Auto-import topology + electrical model sebagai PLMS bedrock, melengkapi `digsilentLineDb` yang sudah diturunkan dari legacy crosscheck workbook (yang sifatnya snapshot lama, era Maret 2021).
- PST tidak lagi jadi sumber primer (deferred ke long-term).
- Ini jalur independen dari NMM (`pln_nmm_coba`) — PLMS consume CGMES langsung dari P2B kalau tersedia, bukan lewat NMM sebagai perantara. Lihat [Hubungan dengan Project Lain](#hubungan-dengan-project-lain) soal kenapa keduanya dipisah.

### Phase D3 - Deferred native vendor file generator

- Phase ini sengaja berada setelah calculation parity, multi-vendor semantic conversion, dan approval workflow stabil.
- Output native atau vendor-supported interchange format melalui adapter per keluarga relay; jangan mengasumsikan satu extension universal untuk semua produk satu vendor.
- `Canonical Setting Package` tetap menjadi source of truth; adapter hanya menerjemahkan parameter, address, enum, scaling, dan capability.
- Approval gate ketat sebelum file dipakai untuk commissioning.
- Support matrix model/firmware, official-tool round-trip, semantic readback, checksum/integrity validation, dan sandbox test wajib per adapter.

### Phase D4 - Risk dashboard + impact analysis

- Saat ada perubahan topology, generation pattern, atau aset, dashboard nampilkan setting mana yang berisiko.
- Triggers re-calculation review per affected line.
- Integration dengan P2B planning study output.

### Phase D5 - Scale to UIT + multi-tenancy

- Multi-ULTG support dengan governance scope (ULTG/UIT/Korporat).
- Cross-ULTG coordination check (line yang lintas ULTG).
- Role hierarchy: Engineer ULTG -> Reviewer UIT -> Approver Korporat.

## Hubungan dengan Project Lain

### PST (asset register PLN)

- **Status PLMS**: PLMS tidak menggantikan PST. PLMS consume asset metadata dari PST kalau tersedia, tapi tidak menunggu PST upgrade.
- **Realita**: PST tidak punya data setting/calculation/history. PLMS mengisi gap itu.
- **Future**: kalau PST suatu saat punya CT/VT structured master, PLMS bisa pull dari sana. Sampai saat itu, PLMS extract dari PDF/Mathcad/Excel.

### NMM Project (`pln_nmm_coba`) — dipisah, bukan dependency

- **Status**: **PLMS dan NMM dipisah sepenuhnya** (2026-07). Ini bukan "pause menunggu PLMS siap lalu disambung lagi" — ini keputusan bahwa keduanya memang proyek yang berbeda skalanya dan tidak perlu saling menunggu.
- **Kenapa dipisah**: NMM adalah konsep **CIM/CGMES-based XML** — network model enterprise-level yang idealnya juga jalan align dengan DIgSILENT/PowerFactory di P2B, bukan cuma level asset seperti PST. Itu benar bagus sebagai arah jangka panjang, tapi pembangunan format CIM-based itu sendiri panjang (kernel round-trip, placeholder resolution, SLD canvas, dll — semua masih development). PLMS tidak punya alasan menunggu itu selesai untuk bisa berguna sekarang.
- **Arah PLMS sekarang**: pakai data yang sudah ada — SLD per-GI, legacy crosscheck workbook (`digsilentLineDb`, hasil export DIgSILENT era Maret 2021), dan dokumen setting (OCR/LCD+DIST/Mathcad) — untuk generate graph network sendiri secara independen (lihat [Strategic Positioning](#strategic-positioning-plms-sebagai-self-contained-network-graph-builder)). Tidak ada ekspektasi PLMS akan bridge ke NMM dalam waktu dekat.
- **Kode existing**: `bridge-export.ts`, `scripts/test-bridge-export.ts`, dan panel UI "NMM Bridge Export" tetap ada di codebase sebagai referensi teknis, tapi bukan lagi prioritas kerja aktif dan tidak dianggap sebagai jalur utama PLMS ke depan.

### DIgSILENT/PowerFactory di P2B

- **Status**: ada di P2B, akses ke unit/Icon Plus belum tentu. Sebagian datanya (line R/X, fault level, dari-ke substation) sudah tersedia offline via legacy crosscheck workbook (`digsilentLineDb`, 610 substation/1183 line se-Jawa-Bali) dan dipakai PLMS sebagai anchor topology untuk substation dalam scope SLD ULTG yang sedang dikerjakan.
- **Hubungan dengan PLMS**: kalau akses CGMES langsung dari P2B tersedia suatu saat, itu jadi bedrock electrical model yang lebih real-time dibanding workbook legacy yang sifatnya snapshot (per Maret 2021).
- **Risk**: kalau akses langsung tidak tersedia, `digsilentLineDb` dari workbook legacy tetap jadi fallback yang workable, sejauh datanya tidak terlalu usang untuk topology yang relevan.

### Mathcad (legacy engineering tool)

- **Status**: tetap di engineer's desk untuk POC + Month 1-2.
- **Hubungan dengan PLMS**: PLMS Mathcad Bridge Panel nampilkan side-by-side benchmark (PLMS calculated vs Mathcad cached).
- **Future**: Mathcad gradually di-replace setelah library template PLMS lengkap + trusted via benchmark. Mathcad menjadi optional cross-check tool, bukan dependency.

## Current Limitations

This POC is intentionally frontend-only.

Known limits:

- Data is persisted in browser localStorage, not a shared database.
- MiCOM Courier `.set` pilot sudah dapat dibaca untuk fixture P443/P545, tetapi coverage lintas model/firmware dan validasi real-file masih terbatas.
- Native `.set` writer belum ada; file deployment vendor belum boleh dihasilkan atau dipakai untuk commissioning.
- Relay Catalog/manual library sudah ada, tetapi semantic capability profiles dan multi-vendor conversion rules belum diimplementasikan.
- Historical IHS Semester 1 2021 tersedia, tetapi bukan current scenario model; fault level harus diikat ke network revision, study method, max/min condition, dan timestamp.
- Topology insertion belum menghasilkan DIgSILENT staging package atau otomatis menerima hasil study balik.
- Sample Mathcad P545 sudah tersedia dan didissect, tetapi formulanya belum selesai dipindahkan ke calculation rule PLMS dan belum menjalani parity sign-off engineer.
- Distance/reference workbook functional, tetapi template spesifik P545 masih perlu benchmark terhadap saved Mathcad result.
- Printable report sudah ada, tetapi TAP composer resmi multi-page dengan document-control dan approval gate belum ada.
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
npm run index:relay-catalog
```

Bundled reference data:

- `data/template-setting/` berisi template Mathcad `.xmcd` dan workbook crosscheck Excel yang dipakai sebagai benchmark POC.
- `npm run index:mathcad` membaca semua `.xmcd` di folder itu dan memperbarui `src/domain/generated/mathcad-template-registry.json`.
- `npm run index:crosscheck` membaca workbook crosscheck di folder itu dan memperbarui `src/domain/generated/crosscheck-workbook-registry.json`.

## Suggested PPT Outline (Revised for Bridge Story)

Story slide deck untuk pitch ke stakeholder PLN:

1. **Problem statement** — data setting tersebar di unit (PDF, Mathcad, Excel), tidak ada SSOT, manual screening rawan error, dan mapping relasi antar-GI tidak pernah benar-benar selesai karena prosesnya per-record bukan per-GI.
2. **Stack saat ini** — PST (asset, gap setting), DIgSILENT P2B (electrical, akses ke unit belum tentu), Mathcad (calc, gap workflow). NMM (`pln_nmm_coba`) sengaja tidak dijadikan dependency — proyek CIM/CGMES enterprise-level itu jalur terpisah dengan timeline sendiri.
3. **PLMS positioning** — PLMS adalah **self-contained protection network graph builder**: generate topology per-GI langsung dari bulk input (SLD + kumpulan setting dokumen), bukan menunggu sistem lain menyediakan bedrock topology.
4. **Kenapa graph generation, bukan cuma data entry** — matcher lama bekerja per-record dan mengandalkan inferensi string dari nama bay, sumber paling ambigu. Sumber paling eksplisit (`digsilentLineDb` dari legacy crosscheck workbook) justru tidak dipakai. Arah baru: SLD untuk scope, `digsilentLineDb` sebagai anchor topology eksplisit, setting docs sebagai overlay, dan graph sampai level bay/elemen (line, trafo, busbar) supaya kasus seperti Z2/Z3 menembak trafo dan site GI/GIS terpisah bisa terrepresentasi benar.
5. **Demo: bulk input -> graph -> konfirmasi per-GI** — upload SLD + dokumen setting untuk satu ULTG, lihat graph network ter-generate otomatis, lalu konfirmasi per-GI (bukan per-baris) untuk kandidat yang ambigu.
6. **Mathcad replacement narrative** — short-term consume Mathcad, mid-term typed calculation rules + parity, lalu semantic multi-vendor conversion dari canonical engineering intent. Trust via Mathcad Bridge Panel benchmark.
7. **DIgSILENT/P2B feedback loop** — `digsilentLineDb` dan IHS 2021 dipakai sebagai historical baseline; sisipan GI menghasilkan Engineering Change Set, DIgSILENT menghitung ulang topology/fault level, lalu hasil study kembali menjadi versioned PLMS snapshot.
8. **Pilot 3-month plan**:
   - Month 1: Stabilize MVP 1, data provenance/scenario model, Engineering Change Set, dan DIgSILENT staging.
   - Month 2: P545 calculation engine + Mathcad parity.
   - Month 3: Capability profiles, multi-vendor conversion pilot, TAP composer, dan governance.
9. **Long-term roadmap** — template/capability expansion + DIgSILENT bedrock + risk dashboard + UIT scale; native vendor-file generator didefer sampai conversion dan approval stabil.
10. **Selling point ringkas** — PLMS menyelesaikan masalah mapping relasi antar-GI yang selama ini tidak pernah selesai, dengan data yang sudah ada sekarang, tanpa menunggu proyek CIM/CGMES enterprise-level yang timeline-nya panjang.

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
