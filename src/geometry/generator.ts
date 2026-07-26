import Module, {
  type Manifold as ManifoldSolid,
  type ManifoldToplevel,
  type Mat4,
  type Vec2,
} from "manifold-3d";
import { Matrix4, Quaternion, Vector3 } from "three";
import {
  createIcosphere,
  dualCells,
  dualEdges,
  fibonacciPoints,
  normalize,
  projectCellToTangentPlane,
  scale,
  triangleCells,
  uniqueEdges,
  type PatternCell,
  type Vec3Tuple,
} from "./icosphere";
import {
  FEATURE_SEGMENTS,
  QUALITY_SEGMENTS,
  STRUT_SEGMENTS,
  type BallParameters,
  type GeneratedBall,
} from "./types";
import {
  countNonManifoldEdges,
  makeWarnings,
  meshDimensions,
} from "./validate";

let modulePromise: Promise<ManifoldToplevel> | undefined;

const getModule = async () => {
  if (!modulePromise) {
    modulePromise = Module().then((wasm) => {
      wasm.setup();
      return wasm;
    });
  }
  return modulePromise;
};

const matrixElements = (matrix: Matrix4): Mat4 =>
  [...matrix.elements] as Mat4;

const orientedMatrix = (direction: Vec3Tuple, position: Vec3Tuple) => {
  const zAxis = new Vector3(0, 0, 1);
  const target = new Vector3(...direction).normalize();
  const rotation = new Quaternion().setFromUnitVectors(zAxis, target);
  return new Matrix4().compose(
    new Vector3(...position),
    rotation,
    new Vector3(1, 1, 1),
  );
};

const subtract = (
  base: ManifoldSolid,
  cutter: ManifoldSolid,
): ManifoldSolid => {
  const output = base.subtract(cutter);
  base.delete();
  cutter.delete();
  return output;
};

const combine = (
  wasm: ManifoldToplevel,
  parts: ManifoldSolid[],
): ManifoldSolid => {
  if (parts.length === 0) {
    throw new Error("The selected settings produced no printable geometry.");
  }
  if (parts.length === 1) return parts[0];
  const output = wasm.Manifold.union(parts);
  const status = output.status();
  parts.forEach((part) => part.delete());
  if (status !== "NoError") {
    output.delete();
    throw new Error(`Geometry union failed: ${status}`);
  }
  return output;
};

const cylinderBetween = (
  wasm: ManifoldToplevel,
  start: Vec3Tuple,
  end: Vec3Tuple,
  radius: number,
  segments: number,
  radiusEnd = radius,
) => {
  const direction = new Vector3(...end).sub(new Vector3(...start));
  const distance = direction.length();
  const midpoint = new Vector3(...start).add(new Vector3(...end)).multiplyScalar(0.5);
  const primitive = wasm.Manifold.cylinder(
    distance,
    radius,
    radiusEnd,
    segments,
    true,
  );
  const transformed = primitive.transform(
    matrixElements(
      orientedMatrix(
        [direction.x, direction.y, direction.z],
        [midpoint.x, midpoint.y, midpoint.z],
      ),
    ),
  );
  primitive.delete();
  return transformed;
};

const coneFromBase = (
  wasm: ManifoldToplevel,
  base: Vec3Tuple,
  tip: Vec3Tuple,
  radius: number,
  segments: number,
) => {
  const direction = new Vector3(...tip).sub(new Vector3(...base));
  const distance = direction.length();
  const primitive = wasm.Manifold.cylinder(
    distance,
    radius,
    Math.max(0.04, radius * 0.04),
    segments,
    false,
  );
  const transformed = primitive.transform(
    matrixElements(
      orientedMatrix(
        [direction.x, direction.y, direction.z],
        base,
      ),
    ),
  );
  primitive.delete();
  return transformed;
};

const sphereAt = (
  wasm: ManifoldToplevel,
  center: Vec3Tuple,
  radius: number,
  segments: number,
) => {
  const primitive = wasm.Manifold.sphere(radius, segments);
  const transformed = primitive.translate(center);
  primitive.delete();
  return transformed;
};

const slerp = (a: Vec3Tuple, b: Vec3Tuple, amount: number): Vec3Tuple => {
  const clampedDot = Math.max(
    -1,
    Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]),
  );
  const angle = Math.acos(clampedDot);
  if (angle < 1e-5) return normalize(a);
  const sinAngle = Math.sin(angle);
  const left = Math.sin((1 - amount) * angle) / sinAngle;
  const right = Math.sin(amount * angle) / sinAngle;
  return normalize([
    a[0] * left + b[0] * right,
    a[1] * left + b[1] * right,
    a[2] * left + b[2] * right,
  ]);
};

interface Network {
  vertices: Vec3Tuple[];
  edges: Array<[number, number]>;
}

const patternNetwork = (parameters: BallParameters): Network => {
  const subdivisions =
    parameters.pattern === "hexagons"
      ? parameters.density
      : Math.max(0, parameters.density - 1);
  const topology = createIcosphere(subdivisions);
  if (parameters.pattern === "hexagons") return dualEdges(topology);
  return {
    vertices: topology.vertices,
    edges: uniqueEdges(topology.faces),
  };
};

const networkSolid = (
  wasm: ManifoldToplevel,
  network: Network,
  radius: number,
  strutRadius: number,
  segments: number,
  curved: boolean,
) => {
  const parts: ManifoldSolid[] = [];
  const nodes = new Map<string, Vec3Tuple>();

  const addNode = (point: Vec3Tuple) => {
    const key = point.map((value) => value.toFixed(6)).join(":");
    nodes.set(key, point);
  };

  for (const [leftIndex, rightIndex] of network.edges) {
    const left = network.vertices[leftIndex];
    const right = network.vertices[rightIndex];
    const arcAngle = Math.acos(
      Math.max(-1, Math.min(1, left[0] * right[0] + left[1] * right[1] + left[2] * right[2])),
    );
    const sectionCount = curved
      ? Math.max(2, Math.ceil(arcAngle / (Math.PI / 14)))
      : 1;

    let previous = scale(left, radius);
    addNode(previous);
    for (let section = 1; section <= sectionCount; section += 1) {
      const current = scale(slerp(left, right, section / sectionCount), radius);
      parts.push(
        cylinderBetween(wasm, previous, current, strutRadius, segments),
      );
      addNode(current);
      previous = current;
    }
  }

  for (const point of nodes.values()) {
    parts.push(sphereAt(wasm, point, strutRadius, segments));
  }
  return combine(wasm, parts);
};

const baseSolid = (
  wasm: ManifoldToplevel,
  outerRadius: number,
  parameters: BallParameters,
) => {
  const outer = wasm.Manifold.sphere(
    outerRadius,
    QUALITY_SEGMENTS[parameters.quality],
  );
  if (parameters.mode === "solid") return outer;

  const innerRadius = outerRadius - parameters.wallThickness;
  if (innerRadius <= 0) {
    outer.delete();
    throw new Error("Wall thickness must be smaller than the ball radius.");
  }
  const inner = wasm.Manifold.sphere(
    innerRadius,
    QUALITY_SEGMENTS[parameters.quality],
  );
  return subtract(outer, inner);
};

const makeCellCutter = (
  wasm: ManifoldToplevel,
  cell: PatternCell,
  radius: number,
  wallThickness: number,
  gapWidth: number,
) => {
  let polygon = projectCellToTangentPlane(cell, radius);
  const averageRadius =
    polygon.reduce((sum, [x, y]) => sum + Math.hypot(x, y), 0) /
    polygon.length;
  const shrink = Math.max(
    0.22,
    Math.min(0.9, 1 - gapWidth / Math.max(averageRadius, gapWidth * 1.2)),
  );
  polygon = polygon.map(([x, y]) => [x * shrink, y * shrink]);

  const signedArea = polygon.reduce((area, [x, y], index) => {
    const [nextX, nextY] = polygon[(index + 1) % polygon.length];
    return area + x * nextY - nextX * y;
  }, 0);
  if (signedArea < 0) polygon.reverse();

  const depth = wallThickness * 2 + 2;
  const primitive = wasm.Manifold.extrude(
    polygon as Vec2[],
    depth,
    0,
    0,
    [1, 1],
    true,
  );
  const centerRadius = radius - wallThickness / 2;
  const transformed = primitive.transform(
    matrixElements(
      orientedMatrix(cell.normal, scale(cell.normal, centerRadius)),
    ),
  );
  primitive.delete();
  return transformed;
};

const perforationCutters = (
  wasm: ManifoldToplevel,
  parameters: BallParameters,
  radius: number,
) => {
  const cutters: ManifoldSolid[] = [];
  const segments = FEATURE_SEGMENTS[parameters.quality];
  const depth = parameters.wallThickness * 2 + 2;
  const centerRadius = radius - parameters.wallThickness / 2;

  if (parameters.pattern === "triangles" || parameters.pattern === "hexagons") {
    const subdivisions =
      parameters.pattern === "hexagons"
        ? parameters.density
        : Math.max(0, parameters.density - 1);
    const topology = createIcosphere(subdivisions);
    const cells =
      parameters.pattern === "hexagons"
        ? dualCells(topology)
        : triangleCells(topology);
    for (const cell of cells) {
      cutters.push(
        makeCellCutter(
          wasm,
          cell,
          radius,
          parameters.wallThickness,
          parameters.featureWidth,
        ),
      );
    }
    return combine(wasm, cutters);
  }

  const points = fibonacciPoints(18 + parameters.density * 18);
  for (const normal of points) {
    const center = scale(normal, centerRadius);
    const half = scale(normal, depth / 2);
    const start: Vec3Tuple = [
      center[0] - half[0],
      center[1] - half[1],
      center[2] - half[2],
    ];
    const end: Vec3Tuple = [
      center[0] + half[0],
      center[1] + half[1],
      center[2] + half[2],
    ];
    cutters.push(
      cylinderBetween(
        wasm,
        start,
        end,
        parameters.featureWidth / 2,
        segments,
        parameters.pattern === "spikes"
          ? Math.max(0.15, parameters.featureWidth * 0.12)
          : parameters.featureWidth / 2,
      ),
    );
  }
  return combine(wasm, cutters);
};

const pointFeatures = (
  wasm: ManifoldToplevel,
  parameters: BallParameters,
  bodyRadius: number,
  envelopeRadius: number,
) => {
  const parts: ManifoldSolid[] = [];
  const points = fibonacciPoints(18 + parameters.density * 18);
  const segments = FEATURE_SEGMENTS[parameters.quality];
  const featureRadius = parameters.featureWidth / 2;

  for (const normal of points) {
    if (parameters.effect === "raised") {
      if (parameters.pattern === "spikes") {
        parts.push(
          coneFromBase(
            wasm,
            scale(normal, bodyRadius - 0.25),
            scale(normal, envelopeRadius),
            featureRadius,
            segments,
          ),
        );
      } else {
        parts.push(
          sphereAt(
            wasm,
            scale(normal, envelopeRadius - featureRadius),
            featureRadius,
            segments,
          ),
        );
      }
    } else if (parameters.pattern === "spikes") {
      parts.push(
        coneFromBase(
          wasm,
          scale(normal, bodyRadius + 0.35),
          scale(normal, bodyRadius - parameters.featureHeight),
          featureRadius,
          segments,
        ),
      );
    } else {
      parts.push(
        sphereAt(
          wasm,
          scale(
            normal,
            bodyRadius + featureRadius - parameters.featureHeight,
          ),
          featureRadius,
          segments,
        ),
      );
    }
  }

  return combine(wasm, parts);
};

const applySurfacePattern = (
  wasm: ManifoldToplevel,
  base: ManifoldSolid,
  parameters: BallParameters,
  bodyRadius: number,
  envelopeRadius: number,
) => {
  let features: ManifoldSolid;
  if (parameters.pattern === "triangles" || parameters.pattern === "hexagons") {
    const network = patternNetwork(parameters);
    const featureRadius = parameters.featureWidth / 2;
    const networkRadius =
      parameters.effect === "raised"
        ? envelopeRadius - featureRadius
        : bodyRadius + featureRadius - parameters.featureHeight;
    features = networkSolid(
      wasm,
      network,
      networkRadius,
      featureRadius,
      STRUT_SEGMENTS[parameters.quality],
      true,
    );
  } else {
    features = pointFeatures(
      wasm,
      parameters,
      bodyRadius,
      envelopeRadius,
    );
  }

  const result =
    parameters.effect === "raised"
      ? base.add(features)
      : base.subtract(features);
  base.delete();
  features.delete();
  return result;
};

const readPositions = (
  interleaved: Float32Array,
  numProp: number,
): Float32Array => {
  if (numProp === 3) return new Float32Array(interleaved);
  const positions = new Float32Array((interleaved.length / numProp) * 3);
  for (
    let source = 0, destination = 0;
    source < interleaved.length;
    source += numProp, destination += 3
  ) {
    positions[destination] = interleaved[source];
    positions[destination + 1] = interleaved[source + 1];
    positions[destination + 2] = interleaved[source + 2];
  }
  return positions;
};

const readNormals = (
  interleaved: Float32Array,
  numProp: number,
): Float32Array => {
  const normals = new Float32Array((interleaved.length / numProp) * 3);
  for (
    let source = 0, destination = 0;
    source < interleaved.length;
    source += numProp, destination += 3
  ) {
    normals[destination] = interleaved[source + 3];
    normals[destination + 1] = interleaved[source + 4];
    normals[destination + 2] = interleaved[source + 5];
  }
  return normals;
};

export const generateBall = async (
  parameters: BallParameters,
): Promise<GeneratedBall> => {
  const startedAt = performance.now();
  const wasm = await getModule();
  const envelopeRadius = parameters.diameter / 2;
  const raised = parameters.effect === "raised";
  const hasSurfaceRelief =
    parameters.mode === "solid" || parameters.mode === "shell";
  const bodyRadius =
    hasSurfaceRelief && raised
      ? envelopeRadius - parameters.featureHeight
      : envelopeRadius;

  if (bodyRadius <= parameters.wallThickness) {
    throw new Error("Feature height and wall thickness leave no printable body.");
  }

  let result: ManifoldSolid;
  if (parameters.mode === "lattice") {
    if (parameters.pattern === "dots" || parameters.pattern === "spikes") {
      throw new Error("Lattice mode requires a triangle or hexagon pattern.");
    }
    const network = patternNetwork(parameters);
    result = networkSolid(
      wasm,
      network,
      envelopeRadius - parameters.featureWidth / 2,
      parameters.featureWidth / 2,
      STRUT_SEGMENTS[parameters.quality],
      false,
    );
  } else {
    result = baseSolid(wasm, bodyRadius, parameters);
    if (parameters.mode === "perforated") {
      const cutters = perforationCutters(wasm, parameters, bodyRadius);
      result = subtract(result, cutters);
    } else {
      result = applySurfacePattern(
        wasm,
        result,
        parameters,
        bodyRadius,
        envelopeRadius,
      );
    }
  }

  const status = result.status();
  if (status !== "NoError") {
    result.delete();
    throw new Error(`Geometry kernel returned ${status}.`);
  }

  const mesh = result.getMesh();
  const positions = readPositions(mesh.vertProperties, mesh.numProp);
  const indices = new Uint32Array(mesh.triVerts);
  const shaded = result.calculateNormals(0, 32);
  const shadedMesh = shaded.getMesh(0);
  const previewPositions = readPositions(
    shadedMesh.vertProperties,
    shadedMesh.numProp,
  );
  const previewIndices = new Uint32Array(shadedMesh.triVerts);
  const previewNormals = readNormals(
    shadedMesh.vertProperties,
    shadedMesh.numProp,
  );
  const nonManifoldEdges = countNonManifoldEdges(indices);
  const triangles = indices.length / 3;
  const watertight = nonManifoldEdges === 0;
  const stats = {
    vertices: positions.length / 3,
    triangles,
    volume: result.volume(),
    surfaceArea: result.surfaceArea(),
    genus: result.genus(),
    watertight,
    nonManifoldEdges,
    buildTimeMs: performance.now() - startedAt,
    dimensions: meshDimensions(positions),
    warnings: makeWarnings(parameters.wallThickness, parameters.featureWidth, {
      watertight,
      triangles,
    }),
  };
  shaded.delete();
  result.delete();
  return {
    positions,
    indices,
    previewPositions,
    previewIndices,
    previewNormals,
    stats,
  };
};
