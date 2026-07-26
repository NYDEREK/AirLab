import { describe, expect, it } from "vitest";
import { countNonManifoldEdges, meshDimensions } from "./validate";

describe("mesh validation", () => {
  it("recognizes a closed tetrahedron", () => {
    const indices = new Uint32Array([
      0, 2, 1,
      0, 1, 3,
      1, 2, 3,
      2, 0, 3,
    ]);
    expect(countNonManifoldEdges(indices)).toBe(0);
  });

  it("detects boundary edges", () => {
    expect(countNonManifoldEdges(new Uint32Array([0, 1, 2]))).toBe(3);
  });

  it("calculates physical extents", () => {
    const positions = new Float32Array([-2, 1, -4, 3, 7, 6]);
    expect(meshDimensions(positions)).toEqual([5, 6, 10]);
  });
});
