export type BallMode = "solid" | "shell" | "perforated" | "lattice";
export type BallPattern = "triangles" | "hexagons" | "dots" | "spikes";
export type SurfaceEffect = "raised" | "grooved";
export type MeshQuality = "draft" | "standard" | "fine";

export interface BallParameters {
  mode: BallMode;
  pattern: BallPattern;
  effect: SurfaceEffect;
  diameter: number;
  wallThickness: number;
  featureWidth: number;
  featureHeight: number;
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
  mode: "lattice",
  pattern: "hexagons",
  effect: "raised",
  diameter: 72,
  wallThickness: 1.8,
  featureWidth: 2.4,
  featureHeight: 1.4,
  density: 1,
  quality: "standard",
};

export const QUALITY_SEGMENTS: Record<MeshQuality, number> = {
  draft: 32,
  standard: 56,
  fine: 80,
};

export const STRUT_SEGMENTS: Record<MeshQuality, number> = {
  draft: 8,
  standard: 12,
  fine: 16,
};

export const FEATURE_SEGMENTS: Record<MeshQuality, number> = {
  draft: 16,
  standard: 28,
  fine: 40,
};
