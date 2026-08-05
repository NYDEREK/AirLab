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
export type DesignKind = "ball" | "stand";
export type ColorMode = "single" | "multi";
export type BallShape = "sphere" | "rugby";
export type StandBaseShape = "circle" | "square" | "octagon";
export type BallTemplate =
  | "creative"
  | "ping-pong"
  | "tennis"
  | "football"
  | "basketball"
  | "volleyball"
  | "baseball"
  | "rugby"
  | "golf"
  | "massage"
  | "pet-toy"
  | "stand";
export type SeamPattern =
  | "none"
  | "custom"
  | "tennis"
  | "football"
  | "basketball"
  | "volleyball"
  | "baseball"
  | "rugby";
export type MarkingType = "none" | "text" | "logo";
export type MarkingOperation = "raised" | "engraved";
export type MarkingPlacement = "band" | "surface";
export type MarkingFont = "modern" | "rounded" | "technical";

export interface BallMarking {
  id: string;
  type: Exclude<MarkingType, "none">;
  operation: MarkingOperation;
  text: string;
  logoMask: string;
  vectorData?: string;
  logoName: string;
  font?: MarkingFont;
  placement?: MarkingPlacement;
  size: number;
  height: number;
  bandIndex: number;
  position: number;
  latitude?: number;
  rotation?: number;
  framePadding?: number;
  frameHeight?: number;
}

export interface CustomBand {
  id: string;
  rotation: number;
  tilt: number;
  curveAngle: number;
  curvature: number;
}

export interface BallParameters {
  designKind: DesignKind;
  template: BallTemplate;
  shape: BallShape;
  rugbyAspectRatio: number;
  mode: BallMode;
  pattern: BallPattern;
  effect: SurfaceEffect;
  seamPattern: SeamPattern;
  seamOperation: SurfaceEffect;
  seamProfile: SeamProfile;
  seamWidth: number;
  seamDepth: number;
  seamCurvature: number;
  baseballStitchDensity: number;
  baseballStitchThickness: number;
  customBands: CustomBand[];
  markingType: MarkingType;
  markingOperation: MarkingOperation;
  markingText: string;
  markingLogoMask: string;
  markingLogoName: string;
  markingSize: number;
  markingHeight: number;
  markings: BallMarking[];
  colorMode: ColorMode;
  ballColor: string;
  detailColor: string;
  markingColor: string;
  keychainEnabled: boolean;
  keychainOuterDiameter: number;
  keychainHoleDiameter: number;
  keychainSurfaceOffset: number;
  keychainRoundness: number;
  keychainRotation: number;
  diameter: number;
  wallThickness: number;
  featureWidth: number;
  featureHeight: number;
  cellSize: number;
  cellFrequency: number;
  density: number;
  standBaseShape: StandBaseShape;
  standBallDiameter: number;
  standBaseSize: number;
  standHeight: number;
  standSocketDepth: number;
  standClearance: number;
  standText: string;
  standTextVectorData: string;
  standTextFont: MarkingFont;
  standTextOperation: MarkingOperation;
  standTextSize: number;
  standTextDepth: number;
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
  triangleMaterials?: Uint8Array;
  previewTriangleMaterials?: Uint8Array;
  color: string;
  detailColor?: string;
  markingColor?: string;
  colorMode?: ColorMode;
  exportUpAxis?: "y";
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
  designKind: "ball",
  template: "creative",
  shape: "sphere",
  rugbyAspectRatio: 1.52,
  mode: "lattice",
  pattern: "hexagons",
  effect: "raised",
  seamPattern: "none",
  seamOperation: "grooved",
  seamProfile: "flat",
  seamWidth: 1.8,
  seamDepth: 0.9,
  seamCurvature: 50,
  baseballStitchDensity: 54,
  baseballStitchThickness: 0.9,
  customBands: [],
  markingType: "none",
  markingOperation: "engraved",
  markingText: "AIRLAB",
  markingLogoMask: "",
  markingLogoName: "",
  markingSize: 28,
  markingHeight: 0.8,
  markings: [],
  colorMode: "multi",
  ballColor: "#7fa84f",
  detailColor: "#f2f1ea",
  markingColor: "#20231f",
  keychainEnabled: false,
  keychainOuterDiameter: 10,
  keychainHoleDiameter: 5,
  keychainSurfaceOffset: 0,
  keychainRoundness: 85,
  keychainRotation: 0,
  diameter: 72,
  wallThickness: 1.8,
  featureWidth: 2.4,
  featureHeight: 1.4,
  cellSize: 16,
  cellFrequency: 3,
  density: 1,
  standBaseShape: "circle",
  standBallDiameter: 72,
  standBaseSize: 86,
  standHeight: 22,
  standSocketDepth: 8,
  standClearance: 0.6,
  standText: "AIRLAB",
  standTextVectorData: "",
  standTextFont: "modern",
  standTextOperation: "engraved",
  standTextSize: 30,
  standTextDepth: 0.8,
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
            vectorData: "",
            logoName: input.markingLogoName ?? "",
            font: "modern",
            placement:
              input.seamPattern && input.seamPattern !== "none"
                ? "band"
                : "surface",
            size: input.markingSize ?? 28,
            height: input.markingHeight ?? 0.8,
            bandIndex: 0,
            position:
              input.seamPattern && input.seamPattern !== "none" ? 50 : 62,
            latitude:
              input.seamPattern && input.seamPattern !== "none" ? 0 : 20,
            rotation: 0,
            framePadding: 3,
            frameHeight: Math.max(0.9, (input.markingHeight ?? 0.8) * 0.72),
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
        vectorData:
          typeof marking.vectorData === "string" ? marking.vectorData : "",
        logoName:
          typeof marking.logoName === "string" ? marking.logoName : "",
        font:
          marking.font === "rounded" || marking.font === "technical"
            ? marking.font
            : "modern",
        placement:
          marking.placement === "surface" || marking.placement === "band"
            ? marking.placement
            : input.seamPattern && input.seamPattern !== "none"
              ? "band"
              : "surface",
        size: Number.isFinite(marking.size) ? marking.size : 28,
        height: Number.isFinite(marking.height) ? marking.height : 0.8,
        bandIndex: Number.isFinite(marking.bandIndex)
          ? Math.max(0, Math.round(marking.bandIndex))
          : 0,
        position: Number.isFinite(marking.position)
          ? Math.max(0, Math.min(100, marking.position))
          : marking.placement === "surface" ||
              (!marking.placement &&
                (!input.seamPattern || input.seamPattern === "none"))
            ? 62
            : 50,
        latitude: Number.isFinite(marking.latitude)
          ? Math.max(-75, Math.min(75, marking.latitude!))
          : marking.placement === "surface" ||
              (!marking.placement &&
                (!input.seamPattern || input.seamPattern === "none"))
            ? 20
            : 0,
        rotation: Number.isFinite(marking.rotation)
          ? Math.max(-180, Math.min(180, marking.rotation!))
          : 0,
        framePadding: Number.isFinite(marking.framePadding)
          ? Math.max(1, Math.min(20, marking.framePadding!))
          : 3,
        frameHeight: Number.isFinite(marking.frameHeight)
          ? Math.max(0, Math.min(4, marking.frameHeight!))
          : Math.max(
              0.9,
              (Number.isFinite(marking.height) ? marking.height : 0.8) *
                0.72,
            ),
      }))
    : legacyMarking;
  const parameters: BallParameters = {
    ...DEFAULT_PARAMETERS,
    ...input,
    designKind:
      input.designKind === "stand" || input.template === "stand"
        ? "stand"
        : "ball",
    colorMode: input.colorMode === "single" ? "single" : "multi",
    baseballStitchDensity: Number.isFinite(input.baseballStitchDensity)
      ? Math.max(
          18,
          Math.min(96, Math.round(input.baseballStitchDensity!)),
        )
      : 54,
    baseballStitchThickness: Number.isFinite(
      input.baseballStitchThickness,
    )
      ? Math.max(
          0.3,
          Math.min(2, input.baseballStitchThickness!),
        )
      : 0.9,
    shape:
      input.shape === "rugby" || input.template === "rugby"
        ? "rugby"
        : "sphere",
    rugbyAspectRatio: Number.isFinite(input.rugbyAspectRatio)
      ? Math.max(1.2, Math.min(1.8, input.rugbyAspectRatio!))
      : 1.52,
    standBaseShape:
      input.standBaseShape === "square" ||
      input.standBaseShape === "octagon"
        ? input.standBaseShape
        : "circle",
    standBallDiameter: Number.isFinite(input.standBallDiameter)
      ? Math.max(20, Math.min(300, input.standBallDiameter!))
      : 72,
    standBaseSize: Number.isFinite(input.standBaseSize)
      ? Math.max(30, Math.min(320, input.standBaseSize!))
      : 86,
    standHeight: Number.isFinite(input.standHeight)
      ? Math.max(6, Math.min(100, input.standHeight!))
      : 22,
    standSocketDepth: Number.isFinite(input.standSocketDepth)
      ? Math.max(1, Math.min(60, input.standSocketDepth!))
      : 8,
    standClearance: Number.isFinite(input.standClearance)
      ? Math.max(0, Math.min(3, input.standClearance!))
      : 0.6,
    standText:
      typeof input.standText === "string"
        ? input.standText.slice(0, 24)
        : "AIRLAB",
    standTextVectorData:
      typeof input.standTextVectorData === "string"
        ? input.standTextVectorData
        : "",
    standTextFont:
      input.standTextFont === "rounded" ||
      input.standTextFont === "technical"
        ? input.standTextFont
        : "modern",
    standTextOperation:
      input.standTextOperation === "raised" ? "raised" : "engraved",
    standTextSize: Number.isFinite(input.standTextSize)
      ? Math.max(6, Math.min(100, input.standTextSize!))
      : 30,
    standTextDepth: Number.isFinite(input.standTextDepth)
      ? Math.max(0.2, Math.min(4, input.standTextDepth!))
      : 0.8,
    keychainOuterDiameter: Number.isFinite(input.keychainOuterDiameter)
      ? Math.max(6, Math.min(24, input.keychainOuterDiameter!))
      : 10,
    keychainHoleDiameter: Number.isFinite(input.keychainHoleDiameter)
      ? Math.max(2.5, Math.min(18, input.keychainHoleDiameter!))
      : 5,
    keychainSurfaceOffset: Number.isFinite(input.keychainSurfaceOffset)
      ? Math.max(-8, Math.min(4, input.keychainSurfaceOffset!))
      : 0,
    keychainRoundness: Number.isFinite(input.keychainRoundness)
      ? Math.max(0, Math.min(100, input.keychainRoundness!))
      : 85,
    keychainRotation: Number.isFinite(input.keychainRotation)
      ? Math.max(-180, Math.min(180, input.keychainRotation!))
      : 0,
    keychainEnabled: input.keychainEnabled === true,
    customBands: normalizedCustomBands,
    markings: normalizedMarkings,
  };
  parameters.keychainHoleDiameter = Math.min(
    parameters.keychainHoleDiameter,
    parameters.keychainOuterDiameter - 1.6,
  );
  const keychainWall =
    (parameters.keychainOuterDiameter -
      parameters.keychainHoleDiameter) /
    2;
  parameters.keychainSurfaceOffset = Math.min(
    parameters.keychainSurfaceOffset,
    Math.max(0.2, keychainWall * 0.32),
  );
  parameters.standSocketDepth = Math.min(
    parameters.standSocketDepth,
    Math.max(1, parameters.standHeight - 1.2),
    parameters.standBallDiameter / 2,
  );
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
