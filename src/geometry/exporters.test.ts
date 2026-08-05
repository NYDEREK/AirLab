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
  triangleMaterials: new Uint8Array([0, 1, 2, 0]),
  previewTriangleMaterials: new Uint8Array(),
  color: "#7fa84f",
  detailColor: "#f2f1ea",
  markingColor: "#20231f",
  stats: {
    vertices: 4,
    triangles: 4,
    volume: 8 / 3,
    surfaceArea: 8 * Math.sqrt(3),
    genus: 0,
    watertight: true,
    nonManifoldEdges: 0,
    components: 1,
    componentVolumes: [8 / 3],
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

  it("rotates Y-up stand previews to Z-up export coordinates", () => {
    const stand = {
      ...tetrahedron,
      positions: new Float32Array([
        0, 2, 3,
        -1, -1, 1,
        -1, 1, -1,
        1, -1, -1,
      ]),
      exportUpAxis: "y" as const,
    };
    const stl = exportBinaryStl(stand);
    const view = new DataView(stl.buffer);
    expect(view.getFloat32(96, true)).toBeCloseTo(0, 5);
    expect(view.getFloat32(100, true)).toBeCloseTo(-3, 5);
    expect(view.getFloat32(104, true)).toBeCloseTo(2, 5);

    const archive = unzipSync(export3mf(stand));
    const model = strFromU8(archive["3D/3dmodel.model"]);
    expect(model).toContain('<vertex x="0" y="-3" z="2"/>');
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
    expect(model).toContain('displaycolor="#7fa84f"');
    expect(model).toContain('displaycolor="#f2f1ea"');
    expect(model).toContain('displaycolor="#20231f"');
    expect(model).toContain('p1="1" p2="1" p3="1"');
    expect(model).toContain('p1="2" p2="2" p3="2"');
  });

  it("writes one material for single-color 3MF models", () => {
    const archive = unzipSync(
      export3mf({ ...tetrahedron, colorMode: "single" }),
    );
    const model = strFromU8(archive["3D/3dmodel.model"]);

    expect(model.match(/<base /g)).toHaveLength(1);
    expect(model).toContain('displaycolor="#7fa84f"');
    expect(model).not.toContain('displaycolor="#f2f1ea"');
    expect(model).not.toContain('displaycolor="#20231f"');
    expect(model).not.toMatch(/p1="[12]"/);
    expect(model.match(/p1="0" p2="0" p3="0"/g)).toHaveLength(4);
  });
});
