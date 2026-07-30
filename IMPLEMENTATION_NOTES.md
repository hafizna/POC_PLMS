# Implementasi L1-L5 Corridor Selector & TAP Production

## Update 2026-07-30 — MVP 2B.1 P545 Input Contract

- Menambahkan `plms.p545-input-contract.v1` untuk pilot Ciledug → Alam Sutera #1.
- Input memiliki tipe, unit primary/secondary yang eksplisit, source reference, locator, capture timestamp, snapshot/scenario id bila tersedia, dan status `resolved/conflict/missing/blocked/overridden`.
- Fault lookup wajib melalui `StudyScenario`; tanpa scenario, input gangguan diblokir.
- Konflik relay MiCOM P543 vs label XMCD P545 serta `Ihs3f` Mathcad 26,24 kA vs historical IHS 33,22 kA dipertahankan sebagai kandidat terpisah.
- CCC 1.428 A dan rating konduktor 1.860 A dimodelkan sebagai dua parameter berbeda, bukan false conflict.
- Calculation UI menampilkan source/gap matrix dan justified override session dengan actor/timestamp; formula calculation belum dijalankan pada slice ini.
- Regression: `npm run test:p545-input-contract`.

## Ringkasan Implementasi

Berdasarkan file Excel "Aplikasi Crosscheck Setting Relay [DigSILENT_ 9 Maret 2021, IHS 1-2021]", telah diimplementasikan:

### 1. L1-L5 Corridor Selection (`/workspace/src/lib/corridor-selector.ts`)

**Konsep:**
- **L1**: Protected line (ruas yang dilindungi) - dari subject bay atau manual override
- **L2**: Ruas terdekat dari GI lawan (shortest X impedance)
- **L3**: Ruas terpanjang dari GI lawan (untuk perhitungan Z3 reach)
- **L4**: Ruas terpendek kedua dari GI lawan
- **L5**: Ruas terpanjang kedua dari GI lawan (extended coverage check)

**Fungsi Utama:**
```typescript
selectCorridorLines(
  topology: Topology,
  subjectSubstationId: string,
  subjectBayName?: string,
  manualOverrideLineId?: string
): CorridorSelectionResult
```

**Output:**
- List ruas L1-L5 dengan impedansi (R, X, Z) dan panjang
- Reasoning untuk setiap pemilihan ruas
- Warnings jika ada kondisi khusus

**Perhitungan Z3 Reach:**
```typescript
calculateZ3Reach(
  selectedLines: SelectedCorridorLine[],
  strategy: "longest" | "shortest" | "conservative"
): { z3PercentOwnLine, z3PercentNextLine, nextLineId }
```

### 2. TAP Setting Production & Approval Workflow (`/workspace/src/lib/tap-production.ts`)

**Model Data:**
```typescript
TapSettingRecord {
  id, lineId, relayId, version,
  status: "draft" | "pending_approval" | "approved" | "rejected" | "superseded",
  zones: [Zone, Zone, Zone],
  loadEncroachment, ctRatio, vtRatio,
  createdBy, approvedBy, effectiveDate
}
```

**Level Approval:**
- Engineer
- Asisten Manajer  
- Manajer

**Workflow Actions:**
- `createTapSetting()` - Buat draft setting baru
- `submitForApproval()` - Submit untuk approval
- `approveTapSetting()` - Approve (dengan hierarchy check)
- `rejectTapSetting()` - Reject dengan reason
- `recallTapSetting()` - Recall setting yang sudah submit/approve
- `supersedeTapSetting()` - Supersede versi lama dengan versi baru

**Fitur Tambahan:**
- `getActiveTapForLine()` - Dapatkan TAP aktif yang approved
- `getTapHistory()` - Lihat history approval suatu setting

### 3. Real vs TAP Scanning (`/workspace/src/lib/real-vs-tap-scanner.ts`)

**Tujuan:** Tracing dan scanning mismatch antara setting real (terpasang) vs TAP production.

**Mismatch Types:**
- `zone_reach` - Deviasi X/R reach Z1/Z2/Z3
- `time_delay` - Deviasi timer delay
- `rfpp_rfpe` - Deviasi resistive reach
- `load_encroachment` - Perbedaan load encroachment setting
- `ct_vt_ratio` - Perbedaan CT/VT ratio
- `characteristic_angle` - Perbedaan characteristic angle

**Severity Levels:**
- `critical` - Deviasi > 20% atau missing TAP
- `warning` - Deviasi moderate
- `info` - Informasi tambahan

**Scanning Function:**
```typescript
scanRealVsTap(
  topology: Topology,
  tapSettings: Record<string, TapSettingRecord>,
  thresholds: {
    zoneReachDeviationPercent: number,
    timeDelayDeviationSec: number,
    rfDeviationPercent: number
  }
): ScanningResult
```

**Mismatch Management:**
- `acknowledgeMismatch()` - Akui mismatch
- `resolveMismatch()` - Tandai resolved
- `markAsFalsePositive()` - Tandai sebagai false positive

## Integrasi dengan PLMS Existing

### Flow Aplikasi Baru:

1. **Study Creation dengan L1-L5**
   - User pilih GI dan bay di Study Wizard
   - System panggil `selectCorridorLines()` untuk dapat L1-L5
   - Tampilkan corridor selector di Calculation View
   - User bisa override manual L1 jika perlu

2. **Calculation → TAP Production**
   - Dari calculation workbook, user promote ke TAP draft
   - Draft disimpan sebagai `TapSettingRecord` dengan status "draft"
   - Engineer submit untuk approval

3. **Approval Workflow**
   - Notifikasi ke Asisten Manajer/Manajer
   - Review setting, compare dengan calculation
   - Approve/reject dengan comment
   - Jika approved, jadi TAP efektif dengan effective date

4. **Real vs TAP Scanning**
   - Page khusus "TAP Compliance" atau "Setting Audit"
   - Scan semua relay di topology vs TAP approved
   - Tampilkan dashboard mismatches by severity
   - Track acknowledgment dan resolution

### File yang Dimodifikasi/Ditambahkan:

**Baru:**
- `/workspace/src/lib/corridor-selector.ts` - L1-L5 selection logic
- `/workspace/src/lib/tap-production.ts` - TAP workflow engine
- `/workspace/src/lib/real-vs-tap-scanner.ts` - Mismatch scanner

**Modified:**
- `/workspace/src/domain/types.ts` - Tambah type definitions:
  - `ApprovalLevel`
  - `TapSettingRecord`
  - `ApprovalAction`

## Next Steps untuk UI Integration

1. **Corridor Selector Component**
   - Update `BranchSelector.tsx` atau buat `CorridorSelector.tsx` baru
   - Tampilkan L1-L5 cards dengan impedance info
   - Dropdown untuk manual override L1

2. **TAP Production Page**
   - Tab baru "TAP Production" atau integrasi di Calculation
   - List TAP drafts/pending/approved
   - Detail view dengan approval timeline
   - Action buttons sesuai role

3. **Real vs TAP Dashboard**
   - Tab baru "TAP Compliance" atau "Audit"
   - Summary cards: total relays, mismatches by severity
   - Table mismatches dengan filter/search
   - Action panel untuk acknowledge/resolve

4. **Store Integration**
   - Update `useProsetStore.ts` dengan:
     - `tapSettings` state
     - `approvalActions` state
     - Actions untuk TAP workflow
     - Selector untuk active TAP per line

## Comparison dengan Excel Crosscheck

| Fitur | Excel Crosscheck | PLMS Implementation |
|-------|------------------|---------------------|
| L1-L4 Selection | Manual lookup | Automated `selectCorridorLines()` |
| Z3 Calculation | Manual formula | `calculateZ3Reach()` with strategies |
| Setting Record | Spreadsheet rows | `TapSettingRecord` with versioning |
| Approval | Email/paper trail | Digital workflow with audit trail |
| Real vs TAP | Manual comparison | Automated `scanRealVsTap()` |
| Mismatch Tracking | Ad-hoc | Structured with status workflow |

## Testing Recommendations

1. Unit test `corridor-selector.ts` dengan berbagai topologi
2. Test approval hierarchy (Engineer tidak bisa approve sendiri)
3. Test scanning dengan threshold berbeda
4. Integration test full flow: calculation → TAP → approval → scan
