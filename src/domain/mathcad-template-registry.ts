import registry from "./generated/mathcad-template-registry.json";

export type MathcadVariableCandidate = {
  name: string;
  value: number;
  unit?: string;
};

export type MathcadTemplateArtifact = {
  id: string;
  templateId: string;
  vendor: string;
  relayFamily: string;
  functionGroup: string;
  fileName: string;
  fullPath: string;
  fileSizeBytes: number;
  sha256Prefix: string;
  generator: string;
  author: string;
  revisedBy: string;
  revision: string;
  documentId: string;
  textPreview: string[];
  variableCandidates: MathcadVariableCandidate[];
  keywords: string[];
  extractionStatus: string;
  note: string;
};

export type MathcadTemplateRegistry = {
  generatedAt: string;
  sourceFolder: string;
  summary: {
    totalArtifacts: number;
    byVendor: Record<string, number>;
    byTemplateId: Record<string, number>;
  };
  artifacts: MathcadTemplateArtifact[];
};

export const MATHCAD_TEMPLATE_REGISTRY = registry as MathcadTemplateRegistry;

export function getMathcadArtifactsForTemplate(templateId: string) {
  return MATHCAD_TEMPLATE_REGISTRY.artifacts.filter((artifact) => artifact.templateId === templateId);
}
