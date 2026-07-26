import { describe, expect, it } from "vitest";
import {
  createIcosphere,
  dualCells,
  dualEdges,
  uniqueEdges,
} from "./icosphere";

describe("spherical topology", () => {
  it("builds a valid base icosahedron", () => {
    const topology = createIcosphere(0);
    expect(topology.vertices).toHaveLength(12);
    expect(topology.faces).toHaveLength(20);
    expect(uniqueEdges(topology.faces)).toHaveLength(30);
  });

  it("creates the expected pentagon/hexagon dual", () => {
    const topology = createIcosphere(1);
    const cells = dualCells(topology);
    expect(cells.filter((cell) => cell.boundary.length === 5)).toHaveLength(12);
    expect(cells.filter((cell) => cell.boundary.length === 6)).toHaveLength(30);
    expect(dualEdges(topology).edges).toHaveLength(120);
  });
});
