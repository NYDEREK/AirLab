export type BallMode = "solid" | "shell" | "perforated" | "lattice";
export type BallPattern =
  | "none"
  | "triangles"
  | "hexagons"
  | "dots"
  | "spikes";
export type SurfaceEffect = "raised" | "grooved";
export type SeamProfile = "flat" | "rounded";
export type MeshQuality = "draft" | "standard" | "fine";
export type BallTemplate =
  | "creative"
  | "ping-pong"
  | "tennis"
  | "football"
  | "basketball"
  | "volleyball"
  | "baseball"
  | "golf"
  | "massage"
  | "pet-toy";
export type SeamPattern =
  | "none"
  | "custom"
  | "tennis"
  | "football"
  | "basketball"
  | "volleyball"
  | "baseball";
export type MarkingType = "none" | "text" | "logo";
export type MarkingOperation = "raised" | "engraved";

export interface BallMarking {
  id: string;
  type: Exclude<MarkingType, "none">;
  operation: MarkingOperation;
  text: string;
  logoMask: string;
  logoName: string;
  size: number;
  height: number;
  bandIndex: number;
  position: number;
}

export interface CustomBand {
  id: string;
  rotation: number;
  tilt: number;
  curveAngle: number;
  curvature: number;
}

export interface BallParameters {
  template: BallTemplate;
  mode: BallMode;
  pattern: BallPattern;
  effect: SurfaceEffect;
  seamPattern: SeamPattern;
  seamOperation: SurfaceEffect;
  seamProfile: SeamProfile;
  seamWidth: number;
  seamDepth: number;
  seamCurvature: number;
  customBands: CustomBand[];
  markingType: MarkingType;
  markingOperation: MarkingOperation;
  markingText: string;
  markingLogoMask: string;
  markingLogoName: string;
  markingSize: number;
  markingHeight: number;
  markings: BallMarking[];
  ballColor: string;
  diameter: number;
  wallThickness: number;
  featureWidth: number;
  featureHeight: number;
  cellSize: number;
  cellFrequency: number;
  density: number;
  quality: MeshQuality;
}

export interface MeshStats {
  vertices: number;
  triangles: number;
  volume: number;
  surfaceArea: number;
  genus: number;
  watertight: boolean;
  nonManifoldEdges: number;
  components: number;
  componentVolumes: number[];
  buildTimeMs: number;
  dimensions: [number, number, number];
  warnings: string[];
}

export interface GeneratedBall {
  positions: Float32Array;
  indices: Uint32Array;
  previewPositions: Float32Array;
  previewIndices: Uint32Array;
  previewNormals: Float32Array;
  color: string;
  stats: MeshStats;
}

export interface GenerationRequest {
  id: number;
  parameters: BallParameters;
}

export interface GenerationSuccess {
  id: number;
  ok: true;
  result: GeneratedBall;
}

export interface GenerationFailure {
  id: number;
  ok: false;
  error: string;
}

export type GenerationResponse = GenerationSuccess | GenerationFailure;

export const DEFAULT_PARAMETERS: BallParameters = {
  template: "creative",
  mode: "lattice",
  pattern: "hexagons",
  effect: "raised",
  seamPattern: "none",
  seamOperation: "grooved",
  seamProfile: "flat",
  seamWidth: 1.8,
  seamDepth: 0.9,
  seamCurvature: 50,
  customBands: [],
  markingType: "none",
  markingOperation: "engraved",
  markingText: "AIRLAB",
  markingLogoMask: "",
  markingLogoName: "",
  markingSize: 28,
  markingHeight: 0.8,
  markings: [],
  ballColor: "#7fa84f",
  diameter: 72,
  wallThickness: 1.8,
  featureWidth: 2.4,
  featureHeight: 1.4,
  cellSize: 16,
  cellFrequency: 3,
  density: 1,
  quality: "standard",
};

export const normalizeParameters = (
  input: Partial<BallParameters>,
): BallParameters => {
  const normalizedCustomBands: CustomBand[] = Array.isArray(input.customBands)
    ? input.customBands.slice(0, 8).map((band, index) => ({
        id:
          typeof band.id === "string"
            ? band.id
            : `custom-band-${index + 1}`,
        rotation: Number.isFinite(band.rotation)
          ? Math.max(-180, Math.min(180, band.rotation))
          : 0,
        tilt: Number.isFinite(band.tilt)
          ? Math.max(-90, Math.min(90, band.tilt))
          : 0,
        curveAngle: Number.isFinite(band.curveAngle)
          ? Math.max(-180, Math.min(180, band.curveAngle))
          : 0,
        curvature: Number.isFinite(band.curvature)
          ? Math.max(0, Math.min(100, band.curvature))
          : 50,
      }))
    : [];
  const legacyMarking: BallMarking[] =
    input.markings === undefined &&
    input.markingType !== undefined &&
    input.markingType !== "none"
      ? [
          {
            id: "legacy-marking",
            type: input.markingType,
            operation: input.markingOperation ?? "engraved",
            text: input.markingText ?? "AIRLAB",
            logoMask: input.markingLogoMask ?? "",
            logoName: input.markingLogoName ?? "",
            size: input.markingSize ?? 28,
            height: input.markingHeight ?? 0.8,
            bandIndex: 0,
            position: 50,
          },
        ]
      : [];
  const normalizedMarkings: BallMarking[] = Array.isArray(input.markings)
    ? input.markings.map((marking, index) => ({
        id:
          typeof marking.id === "string"
            ? marking.id
            : `marking-${index + 1}`,
        type: marking.type === "logo" ? "logo" : "text",
        operation:
          marking.operation === "raised" ? "raised" : "engraved",
        text:
          typeof marking.text === "string" ? marking.text : "AIRLAB",
        logoMask:
          typeof marking.logoMask === "string" ? marking.logoMask : "",
        logoName:
          typeof marking.logoName === "string" ? marking.logoName : "",
        size: Number.isFinite(marking.size) ? marking.size : 28,
        height: Number.isFinite(marking.height) ? marking.height : 0.8,
        bandIndex: Number.isFinite(marking.bandIndex)
          ? Math.max(0, Math.round(marking.bandIndex))
          : 0,
        position: Number.isFinite(marking.position)
          ? Math.max(0, Math.min(100, marking.position))
          : 50,
      }))
    : legacyMarking;
  const parameters = {
    ...DEFAULT_PARAMETERS,
    ...input,
    customBands: normalizedCustomBands,
    markings: normalizedMarkings,
  };
  if (input.cellFrequency !== undefined) return parameters;
  if (parameters.template === "football") {
    return { ...parameters, cellFrequency: 2 };
  }
  if (
    parameters.template === "basketball" ||
    parameters.template === "volleyball"
  ) {
    return { ...parameters, cellFrequency: 8 };
  }
  const angularSpan =
    parameters.pattern === "triangles" ? 1.11 : 1.28;
  const gapAllowance =
    parameters.pattern === "triangles"
      ? parameters.featureWidth * 1.75
      : parameters.featureWidth * 1.15;
  return {
    ...parameters,
    cellFrequency: Math.max(
      1,
      Math.min(
        8,
        Math.ceil(
          ((parameters.diameter / 2) * angularSpan) /
            Math.max(1, parameters.cellSize + gapAllowance),
        ),
      ),
    ),
  };
};

export const QUALITY_SEGMENTS: Record<MeshQuality, number> = {
  draft: 40,
  standard: 72,
  fine: 112,
};

export const STRUT_SEGMENTS: Record<MeshQuality, number> = {
  draft: 12,
  standard: 20,
  fine: 28,
};

export const FEATURE_SEGMENTS: Record<MeshQuality, number> = {
  draft: 24,
  standard: 48,
  fine: 72,
};
