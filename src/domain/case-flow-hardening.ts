import type {
  ChangeItem,
  SettingCase,
  SettingCaseType,
  SettingCaseUrgency,
} from "./setting-case";

export type CaseLifecycleIntent = "permanent" | "temporary_emergency";
export type CrosscheckMode =
  | "issued_tap_document_audit"
  | "actual_relay_readback_verification";
export type OrganizationLevel = "UPT" | "UIT";

export type CaseWorkflowAuthority = {
  readonly ownerLevel: OrganizationLevel;
  readonly ownerUnit: string;
  readonly maker: string;
  readonly checkerRole: string;
  readonly approverRole: string;
  readonly notifiedUnits: readonly string[];
  readonly acknowledgementRequired: boolean;
};

export type TemporaryCasePolicy = {
  readonly expiresAt?: string;
  readonly restorationRequired: boolean;
  readonly restorationCaseId?: string;
  readonly emergencyReason?: string;
};

export type CaseActivationContract = {
  readonly mode:
    | "not_applicable"
    | "commissioning"
    | "approved_effective_date";
  readonly activeDataScope:
    | "none"
    | "setting_and_technical_revision"
    | "administrative_master_revision";
  readonly requiresCommissioningEvidence: boolean;
  readonly requiresPostActivationVerification: boolean;
  readonly state:
    | "not_applicable"
    | "proposed"
    | "approved_not_active"
    | "active"
    | "expired"
    | "restored";
  readonly rationale: string;
};

export type CaseFlowProfile = {
  readonly contractVersion: "case-flow-v1";
  readonly lifecycleIntent: CaseLifecycleIntent;
  readonly crosscheckMode?: CrosscheckMode;
  readonly authority: CaseWorkflowAuthority;
  readonly temporaryPolicy?: TemporaryCasePolicy;
  readonly activation: CaseActivationContract;
};

export type CaseFlowProfileDraft = {
  lifecycleIntent: CaseLifecycleIntent;
  crosscheckMode?: CrosscheckMode;
  ownerLevel: OrganizationLevel;
  notifiedUnits: string[];
  checkerRole?: string;
  approverRole?: string;
  temporaryExpiresAt?: string;
  emergencyReason?: string;
};

export function buildCaseFlowProfile(input: {
  caseType: SettingCaseType;
  changeItems: readonly ChangeItem[];
  urgency: SettingCaseUrgency;
  owningUnit: string;
  actor: string;
  draft?: Partial<CaseFlowProfileDraft>;
}): CaseFlowProfile {
  const lifecycleIntent =
    input.draft?.lifecycleIntent ??
    (input.urgency === "emergency" ? "temporary_emergency" : "permanent");
  const ownerLevel = input.draft?.ownerLevel ?? "UPT";
  const notifiedUnits = unique(
    (input.draft?.notifiedUnits ?? []).map((item) => item.trim()).filter(Boolean)
  );
  const temporaryPolicy =
    lifecycleIntent === "temporary_emergency"
      ? {
          expiresAt: input.draft?.temporaryExpiresAt || undefined,
          restorationRequired: true,
          emergencyReason: input.draft?.emergencyReason?.trim() || undefined,
        }
      : undefined;
  return {
    contractVersion: "case-flow-v1",
    lifecycleIntent,
    crosscheckMode:
      input.caseType === "crosscheck"
        ? input.draft?.crosscheckMode ?? "actual_relay_readback_verification"
        : undefined,
    authority: {
      ownerLevel,
      ownerUnit: input.owningUnit,
      maker: input.actor,
      checkerRole:
        input.draft?.checkerRole?.trim() || "Checker / Supervisor",
      approverRole:
        input.draft?.approverRole?.trim() || "Approver / Manager",
      notifiedUnits,
      acknowledgementRequired: ownerLevel === "UPT",
    },
    temporaryPolicy,
    activation: deriveActivationContract(
      input.caseType,
      lifecycleIntent,
      input.changeItems
    ),
  };
}

export function validateCaseFlowProfile(profile: CaseFlowProfile): string[] {
  const errors: string[] = [];
  if (!profile.authority.ownerUnit.trim()) {
    errors.push("Unit pemilik workflow belum ditentukan.");
  }
  if (!profile.authority.checkerRole.trim() || !profile.authority.approverRole.trim()) {
    errors.push("Role checker dan approver harus dinyatakan.");
  }
  if (
    profile.authority.ownerLevel === "UPT" &&
    profile.authority.notifiedUnits.length === 0
  ) {
    errors.push("Case milik UPT wajib menyatakan unit UIT yang dinotifikasi.");
  }
  if (profile.lifecycleIntent === "temporary_emergency") {
    if (!profile.temporaryPolicy?.expiresAt) {
      errors.push("Temporary/emergency case wajib memiliki waktu berakhir.");
    }
    if (!profile.temporaryPolicy?.emergencyReason) {
      errors.push("Temporary/emergency case wajib menjelaskan kondisi darurat.");
    }
    if (!profile.temporaryPolicy?.restorationRequired) {
      errors.push("Temporary/emergency case wajib memiliki restoration obligation.");
    }
  }
  return errors;
}

export function assessCrosscheckEvidence(
  settingCase: Pick<SettingCase, "caseType" | "flowProfile">,
  evidence: readonly { documentType: string; fileName: string }[]
): { ready: boolean; blockers: string[]; warnings: string[] } {
  if (settingCase.caseType !== "crosscheck") {
    return { ready: true, blockers: [], warnings: [] };
  }
  const blockers: string[] = [];
  const warnings: string[] = [];
  const mode =
    settingCase.flowProfile.crosscheckMode ??
    "actual_relay_readback_verification";
  if (mode === "issued_tap_document_audit") {
    if (!evidence.some((item) => item.documentType === "tap_setting")) {
      blockers.push("Document Audit membutuhkan minimal satu PDF TAP issued.");
    }
  } else {
    const relayExports = evidence.filter(
      (item) => item.documentType === "relay_export"
    );
    if (relayExports.length === 0) {
      blockers.push(
        "Actual Relay Verification membutuhkan native/official relay export."
      );
    } else if (
      !relayExports.some((item) =>
        /\.(set|rio|xrio|xml|cfg|pcmi)$/i.test(item.fileName)
      )
    ) {
      warnings.push(
        "Relay export belum memakai ekstensi native/official yang dikenali; perlakukan sebagai derived evidence sampai manifest akuisisi tersedia."
      );
    }
  }
  return { ready: blockers.length === 0, blockers, warnings };
}

function deriveActivationContract(
  caseType: SettingCaseType,
  lifecycleIntent: CaseLifecycleIntent,
  changeItems: readonly ChangeItem[]
): CaseActivationContract {
  if (caseType === "crosscheck") {
    return {
      mode: "not_applicable",
      activeDataScope: "none",
      requiresCommissioningEvidence: false,
      requiresPostActivationVerification: false,
      state: "not_applicable",
      rationale:
        "Crosscheck mengobservasi issued/actual setting dan tidak mengaktifkan revision baru.",
    };
  }
  const administrativeCorrection =
    caseType === "data_correction" &&
    changeItems.every((item) => item.kind === "data_correction");
  if (administrativeCorrection) {
    return {
      mode: "approved_effective_date",
      activeDataScope: "administrative_master_revision",
      requiresCommissioningEvidence: false,
      requiresPostActivationVerification: false,
      state: "proposed",
      rationale:
        "Koreksi administratif murni aktif pada approved effective date tanpa commissioning fisik.",
    };
  }
  return {
    mode: "commissioning",
    activeDataScope: "setting_and_technical_revision",
    requiresCommissioningEvidence: true,
    requiresPostActivationVerification: true,
    state: "proposed",
    rationale:
      lifecycleIntent === "temporary_emergency"
        ? "Revision sementara aktif hanya setelah commissioning evidence dan wajib dipulihkan sebelum/ketika expiry."
        : "Setting dan technical revision target aktif bersama pada commissioning, bukan saat approval.",
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
