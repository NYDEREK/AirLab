import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { export3mf, exportBinaryStl } from "./exporters";
import type { GeneratedBall } from "./types";

const tetrahedron: GeneratedBall = {
  positions: new Float32Array([
    1, 1, 1,
    -1, -1, 1,
    -1, 1, -1,
    1, -1, -1,
  ]),
  indices: new Uint32Array([
    0, 2, 1,
    0, 1, 3,
    1, 2, 3,
    2, 0, 3,
  ]),
  previewPositions: new Float32Array(),
  previewIndices: new Uint32Array(),
  previewNormals: new Float32Array(),
  stats: {
    vertices: 4,
    triangles: 4,
    volume: 8 / 3,
    surfaceArea: 8 * Math.sqrt(3),
    genus: 0,
    watertight: true,
    nonManifoldEdges: 0,
    buildTimeMs: 0,
    dimensions: [2, 2, 2],
    warnings: [],
  },
};

describe("manufacturing exports", () => {
  it("writes a valid binary STL record count", () => {
    const stl = exportBinaryStl(tetrahedron);
    expect(stl.byteLength).toBe(84 + 4 * 50);
    expect(new DataView(stl.buffer).getUint32(80, true)).toBe(4);
  });

  it("writes a minimal millimeter-based 3MF package", () => {
    const archive = unzipSync(export3mf(tetrahedron));
    expect(Object.keys(archive).sort()).toEqual([
      "3D/3dmodel.model",
      "[Content_Types].xml",
      "_rels/.rels",
    ]);
    const model = strFromU8(archive["3D/3dmodel.model"]);
    expect(model).toContain('unit="millimeter"');
    expect(model.match(/<vertex /g)).toHaveLength(4);
    expect(model.match(/<triangle /g)).toHaveLength(4);
  });
});
