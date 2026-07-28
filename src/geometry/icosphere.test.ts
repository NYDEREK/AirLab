import { describe, expect, it } from "vitest";
import {
  createGeodesicSphere,
  createIcosphere,
  dualCells,
  dualEdges,
  fibonacciPoints,
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

  it("builds a shared arbitrary-frequency geodesic grid", () => {
    const topology = createGeodesicSphere(3);
    expect(topology.vertices).toHaveLength(92);
    expect(topology.faces).toHaveLength(180);
    expect(uniqueEdges(topology.faces)).toHaveLength(270);
    expect(
      topology.vertices.length -
        uniqueEdges(topology.faces).length +
        topology.faces.length,
    ).toBe(2);
  });

  it("keeps dense fibonacci points separated at the poles", () => {
    const points = fibonacciPoints(168);
    let minimumDistance = Infinity;
    for (let left = 0; left < points.length; left += 1) {
      for (let right = left + 1; right < points.length; right += 1) {
        minimumDistance = Math.min(
          minimumDistance,
          Math.hypot(
            points[left][0] - points[right][0],
            points[left][1] - points[right][1],
            points[left][2] - points[right][2],
          ),
        );
      }
    }
    expect(minimumDistance).toBeGreaterThan(0.2);
  });
});
