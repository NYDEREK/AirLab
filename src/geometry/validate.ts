import type { MeshStats } from "./types";

export interface RawMesh {
  positions: Float32Array;
  indices: Uint32Array;
}

export const countNonManifoldEdges = (indices: Uint32Array) => {
  const edgeCounts = new Map<string, number>();
  for (let offset = 0; offset < indices.length; offset += 3) {
    const a = indices[offset];
    const b = indices[offset + 1];
    const c = indices[offset + 2];
    for (const [left, right] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const key =
        left < right ? `${left}:${right}` : `${right}:${left}`;
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }
  }

  let invalid = 0;
  for (const count of edgeCounts.values()) {
    if (count !== 2) invalid += 1;
  }
  return invalid;
};

export const meshDimensions = (
  positions: Float32Array,
): [number, number, number] => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (let offset = 0; offset < positions.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], positions[offset + axis]);
      max[axis] = Math.max(max[axis], positions[offset + axis]);
    }
  }

  return [
    max[0] - min[0],
    max[1] - min[1],
    max[2] - min[2],
  ];
};

export const makeWarnings = (
  wallThickness: number,
  featureWidth: number,
  stats: Pick<MeshStats, "watertight" | "triangles">,
) => {
  const warnings: string[] = [];
  if (!stats.watertight) {
    warnings.push("Mesh contains open or non-manifold edges.");
  }
  if (wallThickness < 0.8) {
    warnings.push("Wall thickness below 0.8 mm may be fragile on FDM printers.");
  }
  if (featureWidth < 0.8) {
    warnings.push("Features below 0.8 mm may not print reliably with a 0.4 mm nozzle.");
  }
  if (stats.triangles > 500_000) {
    warnings.push("Very dense mesh; slicing and export can take longer.");
  }
  return warnings;
};
