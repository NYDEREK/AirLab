import Module, {
  type Manifold as ManifoldSolid,
  type ManifoldToplevel,
  type Mat4,
  type Vec2,
} from "manifold-3d";
import { Matrix4, Quaternion, Vector3 } from "three";
import {
  createGeodesicSphere,
  createIcosphere,
  dualCells,
  dualEdges,
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
  type BallMarking,
  type BallParameters,
  type CustomBand,
  type GeneratedBall,
} from "./types";
import {
  countNonManifoldEdges,
  makeWarnings,
  meshDimensions,
} from "./validate";

let modulePromise: Promise<ManifoldToplevel> | undefined;

type MaterialSlot = 0 | 1 | 2;
type MaterialKind = "body" | "detail" | "marking";

interface MaterialRegistry {
  body: Set<number>;
  detail: Set<number>;
  marking: Set<number>;
}

const createMaterialRegistry = (): MaterialRegistry => ({
  body: new Set(),
  detail: new Set(),
  marking: new Set(),
});

const materialSlot = (kind: MaterialKind): MaterialSlot =>
  kind === "body" ? 0 : kind === "detail" ? 1 : 2;

const tagSolid = (
  solid: ManifoldSolid,
  registry: MaterialRegistry,
  kind: MaterialKind,
) => {
  const tagged = solid.asOriginal();
  solid.delete();
  registry[kind].add(tagged.originalID());
  return tagged;
};

const triangleMaterials = (
  mesh: ReturnType<ManifoldSolid["getMesh"]>,
  registry: MaterialRegistry,
) => {
  const materials = new Uint8Array(mesh.triVerts.length / 3);
  for (let run = 0; run < mesh.runOriginalID.length; run += 1) {
    const originalId = mesh.runOriginalID[run];
    const slot: MaterialSlot = registry.marking.has(originalId)
      ? materialSlot("marking")
      : registry.detail.has(originalId)
        ? materialSlot("detail")
        : materialSlot("body");
    const firstTriangle = mesh.runIndex[run] / 3;
    const lastTriangle =
      (mesh.runIndex[run + 1] ?? mesh.triVerts.length) / 3;
    materials.fill(slot, firstTriangle, lastTriangle);
  }
  return materials;
};

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

const soccerPanelNetwork = (): Network => {
  const topology = createIcosphere(0);
  const vertices: Vec3Tuple[] = [];
  const directed = new Map<string, number>();
  const edgeKeys = new Set<string>();
  const edges: Array<[number, number]> = [];

  const truncatedVertex = (from: number, to: number) => {
    const key = `${from}:${to}`;
    const existing = directed.get(key);
    if (existing !== undefined) return existing;
    const left = topology.vertices[from];
    const right = topology.vertices[to];
    const index = vertices.length;
    vertices.push(
      normalize([
        left[0] * 2 + right[0],
        left[1] * 2 + right[1],
        left[2] * 2 + right[2],
      ]),
    );
    directed.set(key, index);
    return index;
  };

  const addEdge = (left: number, right: number) => {
    const key =
      left < right ? `${left}:${right}` : `${right}:${left}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push([left, right]);
  };

  for (const [a, b, c] of topology.faces) {
    const face = [
      truncatedVertex(a, b),
      truncatedVertex(b, a),
      truncatedVertex(b, c),
      truncatedVertex(c, b),
      truncatedVertex(c, a),
      truncatedVertex(a, c),
    ];
    for (let index = 0; index < face.length; index += 1) {
      addEdge(face[index], face[(index + 1) % face.length]);
    }
  }
  return { vertices, edges };
};

const alignNetworkPole = (
  network: Network,
  parameters: BallParameters,
): Network => {
  if (network.vertices.length === 0) {
    return network;
  }
  const target =
    parameters.shape === "rugby"
      ? new Vector3(1, 0, 0)
      : new Vector3(0, 1, 0);
  const source = network.vertices.reduce((closest, candidate) =>
    candidate[0] * target.x +
      candidate[1] * target.y +
      candidate[2] * target.z >
    closest[0] * target.x +
      closest[1] * target.y +
      closest[2] * target.z
      ? candidate
      : closest,
  );
  const rotation = new Quaternion().setFromUnitVectors(
    new Vector3(...source).normalize(),
    target,
  );
  return {
    vertices: network.vertices.map((vertex) => {
      const rotated = new Vector3(...vertex).applyQuaternion(rotation);
      return [rotated.x, rotated.y, rotated.z];
    }),
    edges: network.edges,
  };
};

const patternNetwork = (
  parameters: BallParameters,
  _radius: number,
): Network => {
  let network: Network;
  if (parameters.seamPattern === "football") {
    network = soccerPanelNetwork();
  } else {
    const topology = createGeodesicSphere(
      Math.max(1, Math.min(8, Math.round(parameters.cellFrequency))),
    );
    network =
      parameters.pattern === "hexagons"
        ? dualEdges(topology)
        : {
            vertices: topology.vertices,
            edges: uniqueEdges(topology.faces),
          };
  }
  // Keep a real lattice node at the keychain pole even before the loop is
  // enabled. This lets the bare ring fuse directly to an existing rib and
  // avoids rotating the user's pattern when the option is toggled.
  return alignNetworkPole(network, parameters);
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

const ribbonMatrix = (
  lateral: Vector3,
  radial: Vector3,
  tangent: Vector3,
  position: Vector3,
) =>
  new Matrix4()
    .makeBasis(lateral, radial, tangent)
    .setPosition(position);

const closedNetworkLoops = (network: Network): Vec3Tuple[][] | null => {
  const adjacency = network.vertices.map(() => [] as number[]);
  for (const [left, right] of network.edges) {
    adjacency[left].push(right);
    adjacency[right].push(left);
  }
  if (adjacency.some((neighbors) => neighbors.length !== 2)) return null;

  const visited = new Set<number>();
  const loops: Vec3Tuple[][] = [];
  for (let start = 0; start < network.vertices.length; start += 1) {
    if (visited.has(start)) continue;
    const loop: Vec3Tuple[] = [];
    let previous = -1;
    let current = start;
    do {
      if (visited.has(current) && current !== start) return null;
      visited.add(current);
      loop.push(network.vertices[current]);
      const [first, second] = adjacency[current];
      const next = first === previous ? second : first;
      previous = current;
      current = next;
    } while (current !== start);
    if (loop.length < 3) return null;
    loops.push(loop);
  }
  return loops;
};

const ribbonLoopSolid = (
  wasm: ManifoldToplevel,
  loop: Vec3Tuple[],
  innerRadius: number,
  outerRadius: number,
  width: number,
  rounded: boolean,
) => {
  const positions: number[] = [];
  const triangles: number[] = [];
  const halfAngle = width / Math.max(1, innerRadius + outerRadius);
  const acrossSegments = rounded ? 8 : 1;

  for (let index = 0; index < loop.length; index += 1) {
    const normal = new Vector3(...loop[index]).normalize();
    const previous = new Vector3(
      ...loop[(index - 1 + loop.length) % loop.length],
    );
    const next = new Vector3(...loop[(index + 1) % loop.length]);
    const tangent = next.sub(previous).normalize();
    const lateral = normal.clone().cross(tangent).normalize();
    for (let across = 0; across <= acrossSegments; across += 1) {
      const unit = -1 + (across / acrossSegments) * 2;
      const offsetNormal = normal
        .clone()
        .add(lateral.clone().multiplyScalar(unit * halfAngle))
        .normalize();
      const profile = rounded
        ? 0.1 + Math.sqrt(Math.max(0, 1 - unit * unit)) * 0.9
        : 1;
      const topRadius =
        innerRadius + (outerRadius - innerRadius) * profile;
      const top = offsetNormal.clone().multiplyScalar(topRadius);
      const bottom = offsetNormal.clone().multiplyScalar(innerRadius);
      positions.push(
        top.x,
        top.y,
        top.z,
        bottom.x,
        bottom.y,
        bottom.z,
      );
    }
  }

  const vertex = (loopIndex: number, across: number, bottom: boolean) =>
    (loopIndex * (acrossSegments + 1) + across) * 2 +
    (bottom ? 1 : 0);
  for (let index = 0; index < loop.length; index += 1) {
    const next = (index + 1) % loop.length;
    for (let across = 0; across < acrossSegments; across += 1) {
      const topLeft = vertex(index, across, false);
      const topRight = vertex(index, across + 1, false);
      const nextTopLeft = vertex(next, across, false);
      const nextTopRight = vertex(next, across + 1, false);
      const bottomLeft = vertex(index, across, true);
      const bottomRight = vertex(index, across + 1, true);
      const nextBottomLeft = vertex(next, across, true);
      const nextBottomRight = vertex(next, across + 1, true);
      triangles.push(
        topLeft,
        nextTopLeft,
        nextTopRight,
        topLeft,
        nextTopRight,
        topRight,
        bottomLeft,
        bottomRight,
        nextBottomRight,
        bottomLeft,
        nextBottomRight,
        nextBottomLeft,
      );
    }
    const topLeft = vertex(index, 0, false);
    const bottomLeft = vertex(index, 0, true);
    const nextTopLeft = vertex(next, 0, false);
    const nextBottomLeft = vertex(next, 0, true);
    const topRight = vertex(index, acrossSegments, false);
    const bottomRight = vertex(index, acrossSegments, true);
    const nextTopRight = vertex(next, acrossSegments, false);
    const nextBottomRight = vertex(next, acrossSegments, true);
    triangles.push(
      topLeft,
      bottomLeft,
      nextBottomLeft,
      topLeft,
      nextBottomLeft,
      nextTopLeft,
      topRight,
      nextTopRight,
      nextBottomRight,
      topRight,
      nextBottomRight,
      bottomRight,
    );
  }

  const mesh = new wasm.Mesh({
    numProp: 3,
    vertProperties: new Float32Array(positions),
    triVerts: new Uint32Array(triangles),
  });
  return new wasm.Manifold(mesh);
};

interface NetworkPath {
  points: Vec3Tuple[];
  closed: boolean;
}

const networkPaths = (network: Network): NetworkPath[] => {
  const adjacency = network.vertices.map(() => [] as number[]);
  network.edges.forEach(([left, right]) => {
    adjacency[left].push(right);
    adjacency[right].push(left);
  });
  const visitedEdges = new Set<string>();
  const edgeKey = (left: number, right: number) =>
    left < right ? `${left}:${right}` : `${right}:${left}`;
  const visit = (left: number, right: number) =>
    visitedEdges.add(edgeKey(left, right));
  const wasVisited = (left: number, right: number) =>
    visitedEdges.has(edgeKey(left, right));
  const paths: NetworkPath[] = [];

  const walk = (start: number, first: number): number[] => {
    const indices = [start];
    let previous = start;
    let current = first;
    visit(previous, current);
    while (true) {
      indices.push(current);
      if (adjacency[current].length !== 2) break;
      const next =
        adjacency[current][0] === previous
          ? adjacency[current][1]
          : adjacency[current][0];
      if (wasVisited(current, next)) break;
      visit(current, next);
      previous = current;
      current = next;
      if (current === start) break;
    }
    return indices;
  };

  adjacency.forEach((neighbors, start) => {
    if (neighbors.length === 2) return;
    neighbors.forEach((next) => {
      if (wasVisited(start, next)) return;
      const indices = walk(start, next);
      paths.push({
        points: indices.map((index) => network.vertices[index]),
        closed: false,
      });
    });
  });

  network.edges.forEach(([left, right]) => {
    if (wasVisited(left, right)) return;
    const indices = walk(left, right);
    const closed = indices.at(-1) === left;
    paths.push({
      points: (closed ? indices.slice(0, -1) : indices).map(
        (index) => network.vertices[index],
      ),
      closed,
    });
  });

  return paths;
};

const resamplePath = (
  points: Vec3Tuple[],
  closed: boolean,
  maximumAngle: number,
) => {
  const result: Vec3Tuple[] = [];
  const segmentCount = closed ? points.length : points.length - 1;
  for (let index = 0; index < segmentCount; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const angle = Math.acos(
      Math.max(
        -1,
        Math.min(
          1,
          start[0] * end[0] +
            start[1] * end[1] +
            start[2] * end[2],
        ),
      ),
    );
    const sections = Math.max(1, Math.ceil(angle / maximumAngle));
    for (let section = 0; section < sections; section += 1) {
      result.push(slerp(start, end, section / sections));
    }
  }
  if (!closed) result.push(normalize(points.at(-1)!));
  return result;
};

const ribbonOpenPathSolid = (
  wasm: ManifoldToplevel,
  sourcePath: Vec3Tuple[],
  innerRadius: number,
  outerRadius: number,
  width: number,
  maximumAngle: number,
) => {
  const path = resamplePath(sourcePath, false, maximumAngle);
  const positions: number[] = [];
  const triangles: number[] = [];
  const halfAngle = width / Math.max(1, innerRadius + outerRadius);

  path.forEach((point, index) => {
    const normal = new Vector3(...point).normalize();
    const previous = new Vector3(...path[Math.max(0, index - 1)]);
    const next = new Vector3(
      ...path[Math.min(path.length - 1, index + 1)],
    );
    const tangent = next.sub(previous);
    tangent.addScaledVector(normal, -tangent.dot(normal)).normalize();
    const lateral = normal.clone().cross(tangent).normalize();
    for (const unit of [-1, 1]) {
      const offsetNormal = normal
        .clone()
        .add(lateral.clone().multiplyScalar(unit * halfAngle))
        .normalize();
      const top = offsetNormal.clone().multiplyScalar(outerRadius);
      const bottom = offsetNormal.clone().multiplyScalar(innerRadius);
      positions.push(
        top.x,
        top.y,
        top.z,
        bottom.x,
        bottom.y,
        bottom.z,
      );
    }
  });

  const vertex = (pathIndex: number, across: number, bottom: boolean) =>
    (pathIndex * 2 + across) * 2 + (bottom ? 1 : 0);
  for (let index = 0; index < path.length - 1; index += 1) {
    const next = index + 1;
    const topLeft = vertex(index, 0, false);
    const topRight = vertex(index, 1, false);
    const nextTopLeft = vertex(next, 0, false);
    const nextTopRight = vertex(next, 1, false);
    const bottomLeft = vertex(index, 0, true);
    const bottomRight = vertex(index, 1, true);
    const nextBottomLeft = vertex(next, 0, true);
    const nextBottomRight = vertex(next, 1, true);
    triangles.push(
      topLeft,
      nextTopLeft,
      nextTopRight,
      topLeft,
      nextTopRight,
      topRight,
      bottomLeft,
      bottomRight,
      nextBottomRight,
      bottomLeft,
      nextBottomRight,
      nextBottomLeft,
      topLeft,
      bottomLeft,
      nextBottomLeft,
      topLeft,
      nextBottomLeft,
      nextTopLeft,
      topRight,
      nextTopRight,
      nextBottomRight,
      topRight,
      nextBottomRight,
      bottomRight,
    );
  }

  const last = path.length - 1;
  for (const [pathIndex, reverse] of [
    [0, true],
    [last, false],
  ] as const) {
    const topLeft = vertex(pathIndex, 0, false);
    const topRight = vertex(pathIndex, 1, false);
    const bottomLeft = vertex(pathIndex, 0, true);
    const bottomRight = vertex(pathIndex, 1, true);
    triangles.push(
      ...(reverse
        ? [
            topLeft,
            topRight,
            bottomRight,
            topLeft,
            bottomRight,
            bottomLeft,
          ]
        : [
            topLeft,
            bottomLeft,
            bottomRight,
            topLeft,
            bottomRight,
            topRight,
          ]),
    );
  }

  const mesh = new wasm.Mesh({
    numProp: 3,
    vertProperties: new Float32Array(positions),
    triVerts: new Uint32Array(triangles),
  });
  return new wasm.Manifold(mesh);
};

const ribbonNetworkSolid = (
  wasm: ManifoldToplevel,
  network: Network,
  innerRadius: number,
  outerRadius: number,
  width: number,
  sphereSegments: number,
  rounded = false,
) => {
  const safeInnerRadius = Math.max(0.1, innerRadius);
  const safeOuterRadius = Math.max(safeInnerRadius + 0.2, outerRadius);
  const loops = closedNetworkLoops(network);
  if (loops) {
    return combine(
      wasm,
      loops.map((loop) =>
        ribbonLoopSolid(
          wasm,
          loop,
          safeInnerRadius,
          safeOuterRadius,
          width,
          rounded,
        ),
      ),
    );
  }
  if (rounded) {
    const centerRadius = (safeInnerRadius + safeOuterRadius) / 2;
    const raw = networkSolid(
      wasm,
      network,
      centerRadius,
      width / 2,
      Math.max(8, Math.round(sphereSegments / 4)),
      true,
    );
    const outer = wasm.Manifold.sphere(
      safeOuterRadius,
      sphereSegments,
    );
    const clipped = raw.intersect(outer);
    raw.delete();
    outer.delete();
    const inner = wasm.Manifold.sphere(
      safeInnerRadius,
      sphereSegments,
    );
    const result = clipped.subtract(inner);
    clipped.delete();
    inner.delete();
    return result;
  }
  const centerRadius = (safeInnerRadius + safeOuterRadius) / 2;
  const radialThickness = safeOuterRadius - safeInnerRadius;
  const maximumAngle = Math.PI / Math.max(48, sphereSegments);
  const parts = networkPaths(network).map((path) =>
    path.closed
      ? ribbonLoopSolid(
          wasm,
          resamplePath(path.points, true, maximumAngle),
          safeInnerRadius,
          safeOuterRadius,
          width,
          false,
        )
      : ribbonOpenPathSolid(
          wasm,
          path.points,
          safeInnerRadius,
          safeOuterRadius,
          width,
          maximumAngle,
        ),
  );
  const degrees = network.vertices.map(() => 0);
  network.edges.forEach(([left, right]) => {
    degrees[left] += 1;
    degrees[right] += 1;
  });
  network.vertices.forEach((point, index) => {
    if (degrees[index] === 2) return;
    const primitive = wasm.Manifold.cylinder(
      radialThickness + 0.5,
      width * 0.56,
      width * 0.56,
      Math.max(16, Math.round(sphereSegments / 2)),
      true,
    );
    const transformed = primitive.transform(
      matrixElements(
        orientedMatrix(point, scale(point, centerRadius)),
      ),
    );
    primitive.delete();
    parts.push(transformed);
  });

  const rawRibbon = combine(wasm, parts);
  const outer = wasm.Manifold.sphere(safeOuterRadius, sphereSegments);
  const clippedOuter = rawRibbon.intersect(outer);
  rawRibbon.delete();
  outer.delete();
  const inner = wasm.Manifold.sphere(safeInnerRadius, sphereSegments);
  const ribbon = clippedOuter.subtract(inner);
  clippedOuter.delete();
  inner.delete();
  return ribbon;
};

const perforatedPatternSolid = (
  wasm: ManifoldToplevel,
  parameters: BallParameters,
  outerRadius: number,
) =>
  ribbonNetworkSolid(
    wasm,
    patternNetwork(parameters, outerRadius),
    Math.max(0.1, outerRadius - parameters.wallThickness),
    outerRadius,
    parameters.seamPattern === "football"
      ? parameters.seamWidth
      : parameters.featureWidth,
    QUALITY_SEGMENTS[parameters.quality],
  );

const patternPoints = (parameters: BallParameters) => {
  const frequency =
    parameters.mode === "perforated"
      ? 2 ** Math.max(1, parameters.density)
      : parameters.density + 1;
  return createGeodesicSphere(frequency).vertices;
};

interface FittedBallShape {
  solid: ManifoldSolid;
  center: Vector3;
  keychainPole: Vector3;
}

const fitBallShape = (
  solid: ManifoldSolid,
  parameters: BallParameters,
): FittedBallShape => {
  const shapeScale: Vec3Tuple =
    parameters.shape === "rugby"
      ? [parameters.rugbyAspectRatio, 1, 1]
      : [1, 1, 1];
  const shaped =
    parameters.shape === "rugby" ? solid.scale(shapeScale) : solid;
  if (shaped !== solid) solid.delete();

  const bounds = shaped.boundingBox();
  const boundsCenter: Vec3Tuple = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  const size = Math.max(
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  );
  const scale = size > 0 ? parameters.diameter / size : 1;
  const centered = shaped.translate([
    -boundsCenter[0],
    -boundsCenter[1],
    -boundsCenter[2],
  ]);
  shaped.delete();
  const fitted = scale === 1 ? centered : centered.scale(scale);
  if (fitted !== centered) centered.delete();

  // Decorations can make the fitted bounding box asymmetric. Preserve the
  // transformed position of the original sphere center instead of assuming
  // that it is still the world origin when positioning the keychain.
  const center = new Vector3(
    -boundsCenter[0] * scale,
    -boundsCenter[1] * scale,
    -boundsCenter[2] * scale,
  );
  const sourceRadius = parameters.diameter / 2;
  const poleOffset =
    parameters.shape === "rugby"
      ? new Vector3(
          (bounds.max[0] - boundsCenter[0]) * scale - center.x,
          0,
          0,
        )
      : new Vector3(0, sourceRadius * scale, 0);
  return {
    solid: fitted,
    center,
    keychainPole: center.clone().add(poleOffset),
  };
};

const keychainProfile = (
  majorRadius: number,
  thickness: number,
  roundness: number,
  cornerSegments: number,
): Vec2[] => {
  const half = thickness / 2;
  const radius = half * Math.max(0, Math.min(1, roundness / 100));
  if (radius <= 0.02) {
    return [
      [majorRadius - half, -half],
      [majorRadius + half, -half],
      [majorRadius + half, half],
      [majorRadius - half, half],
    ];
  }
  const points: Vec2[] = [];
  const corners = [
    [majorRadius + half - radius, half - radius, 0],
    [majorRadius - half + radius, half - radius, 90],
    [majorRadius - half + radius, -half + radius, 180],
    [majorRadius + half - radius, -half + radius, 270],
  ] as const;
  corners.forEach(([centerX, centerY, startDegrees]) => {
    for (let step = 0; step <= cornerSegments; step += 1) {
      const angle =
        ((startDegrees + (step / cornerSegments) * 90) * Math.PI) / 180;
      points.push([
        centerX + Math.cos(angle) * radius,
        centerY + Math.sin(angle) * radius,
      ]);
    }
  });
  return points;
};

const applyKeychain = (
  wasm: ManifoldToplevel,
  base: ManifoldSolid,
  parameters: BallParameters,
  registry: MaterialRegistry,
  ballCenter: Vector3,
  keychainPole: Vector3,
) => {
  if (!parameters.keychainEnabled) return base;
  const outerRadius = Math.max(3, parameters.keychainOuterDiameter / 2);
  const innerRadius = Math.max(
    1.25,
    Math.min(
      outerRadius - 0.8,
      parameters.keychainHoleDiameter / 2,
    ),
  );
  const ringThickness = outerRadius - innerRadius;
  const segments = STRUT_SEGMENTS[parameters.quality];
  const profile = keychainProfile(
    (outerRadius + innerRadius) / 2,
    ringThickness,
    parameters.keychainRoundness,
    parameters.quality === "fine"
      ? 10
      : parameters.quality === "standard"
        ? 7
        : 4,
  );
  const section = new wasm.CrossSection([profile], "EvenOdd");
  let ring = section.revolve(segments);
  section.delete();

  // Always use the exact geometric pole. Snapping to a nearby pattern vertex
  // visibly moved the loop away from the ball axis on perforated models.
  const anchor = keychainPole.clone();
  const outward = anchor.clone().sub(ballCenter).normalize();
  const surfaceOffset = Math.max(
    -outerRadius * 0.8,
    Math.min(
      ringThickness * 0.32,
      parameters.keychainSurfaceOffset,
    ),
  );
  const center = anchor
    .clone()
    .addScaledVector(
      outward,
      outerRadius - ringThickness * 0.42 + surfaceOffset,
    );
  const rotation = new Matrix4().makeRotationAxis(
    outward,
    (parameters.keychainRotation * Math.PI) / 180,
  );
  rotation.setPosition(center);
  const positionedRing = ring.transform(matrixElements(rotation));
  ring.delete();
  ring = positionedRing;
  const tagged = tagSolid(ring, registry, "body");
  const result = base.add(tagged);
  base.delete();
  tagged.delete();
  return result;
};

const keepLargestPrintableComponent = (solid: ManifoldSolid) => {
  const components = solid.decompose();
  if (components.length <= 1) {
    components.forEach((component) => component.delete());
    return solid;
  }
  components.sort(
    (left, right) => Math.abs(right.volume()) - Math.abs(left.volume()),
  );
  const largest = components[0];
  components.slice(1).forEach((component) => component.delete());
  solid.delete();
  return largest;
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

interface CellPolygon {
  polygon: Vec2[];
  maxRadius: number;
}

const polygonCells = (
  parameters: BallParameters,
  _radius: number,
): PatternCell[] => {
  const topology = createGeodesicSphere(
    Math.max(1, Math.min(8, Math.round(parameters.cellFrequency))),
  );
  return parameters.pattern === "hexagons"
    ? dualCells(topology)
    : triangleCells(topology);
};

const cellPolygon = (
  cell: PatternCell,
  radius: number,
  gapWidth: number,
): CellPolygon => {
  const projected = projectCellToTangentPlane(cell, radius);
  let apothem = Number.POSITIVE_INFINITY;
  for (let index = 0; index < projected.length; index += 1) {
    const [x1, y1] = projected[index];
    const [x2, y2] = projected[(index + 1) % projected.length];
    const edgeLength = Math.hypot(x2 - x1, y2 - y1);
    if (edgeLength <= 1e-6) continue;
    apothem = Math.min(
      apothem,
      Math.abs(x1 * y2 - y1 * x2) / edgeLength,
    );
  }

  const gapScale = Number.isFinite(apothem)
    ? 1 - gapWidth / Math.max(0.2, apothem * 2)
    : 0.94;
  const shrink = Math.max(0.12, Math.min(0.96, gapScale));
  const polygon = projected.map(
    ([x, y]) => [x * shrink, y * shrink] as Vec2,
  );

  const signedArea = polygon.reduce((area, [x, y], index) => {
    const [nextX, nextY] = polygon[(index + 1) % polygon.length];
    return area + x * nextY - nextX * y;
  }, 0);
  if (signedArea < 0) polygon.reverse();

  return {
    polygon,
    maxRadius: polygon.reduce(
      (maximum, [x, y]) => Math.max(maximum, Math.hypot(x, y)),
      0,
    ),
  };
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

  const points = patternPoints(parameters);
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

const cellSurfaceFeatures = (
  wasm: ManifoldToplevel,
  parameters: BallParameters,
  bodyRadius: number,
  envelopeRadius: number,
) => {
  const cells = polygonCells(parameters, bodyRadius);
  const overlap = 0.55;
  const parts: ManifoldSolid[] = [];

  for (const cell of cells) {
    const { polygon, maxRadius } = cellPolygon(
      cell,
      bodyRadius,
      parameters.featureWidth,
    );
    const sagitta =
      bodyRadius -
      Math.sqrt(
        Math.max(0, bodyRadius * bodyRadius - maxRadius * maxRadius),
      );
    const outward =
      parameters.effect === "raised" ? parameters.featureHeight : overlap;
    const inward =
      parameters.effect === "raised"
        ? overlap
        : parameters.featureHeight;
    const depth = outward + inward + sagitta + overlap;
    const centerRadius =
      bodyRadius + (outward - inward - sagitta) / 2;
    const primitive = wasm.Manifold.extrude(
      polygon,
      depth,
      0,
      0,
      [1, 1],
      true,
    );
    const transformed = primitive.transform(
      matrixElements(
        orientedMatrix(
          cell.normal,
          scale(cell.normal, centerRadius),
        ),
      ),
    );
    primitive.delete();
    parts.push(transformed);
  }

  const rawFeatures = combine(wasm, parts);
  const outerRadius =
    parameters.effect === "raised"
      ? envelopeRadius
      : bodyRadius + overlap;
  const innerRadius =
    parameters.effect === "raised"
      ? Math.max(0.1, bodyRadius - overlap)
      : Math.max(0.1, bodyRadius - parameters.featureHeight);
  const outer = wasm.Manifold.sphere(
    outerRadius,
    QUALITY_SEGMENTS[parameters.quality],
  );
  const clipped = rawFeatures.intersect(outer);
  rawFeatures.delete();
  outer.delete();
  const inner = wasm.Manifold.sphere(
    innerRadius,
    QUALITY_SEGMENTS[parameters.quality],
  );
  const features = clipped.subtract(inner);
  clipped.delete();
  inner.delete();
  return features;
};

const pointFeatures = (
  wasm: ManifoldToplevel,
  parameters: BallParameters,
  bodyRadius: number,
  envelopeRadius: number,
) => {
  const parts: ManifoldSolid[] = [];
  const points = patternPoints(parameters);
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

const sampledLoop = (
  sampler: (angle: number) => Vec3Tuple,
  samples = 96,
) => {
  const vertices: Vec3Tuple[] = [];
  const edges: Array<[number, number]> = [];
  for (let index = 0; index < samples; index += 1) {
    vertices.push(normalize(sampler((index / samples) * Math.PI * 2)));
    edges.push([index, (index + 1) % samples]);
  }
  return { vertices, edges };
};

const sampledPath = (
  sampler: (amount: number) => Vec3Tuple,
  samples = 64,
) => {
  const vertices: Vec3Tuple[] = [];
  const edges: Array<[number, number]> = [];
  for (let index = 0; index <= samples; index += 1) {
    vertices.push(normalize(sampler(index / samples)));
    if (index > 0) edges.push([index - 1, index]);
  }
  return { vertices, edges };
};

const joinNetworks = (networks: Network[]): Network => {
  const vertices: Vec3Tuple[] = [];
  const edges: Array<[number, number]> = [];
  for (const network of networks) {
    const offset = vertices.length;
    vertices.push(...network.vertices);
    edges.push(
      ...network.edges.map(
        ([left, right]) => [left + offset, right + offset] as [number, number],
      ),
    );
  }
  return { vertices, edges };
};

const rotateAroundY = (point: Vec3Tuple, angle: number): Vec3Tuple => {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [
    point[0] * cosine + point[2] * sine,
    point[1],
    -point[0] * sine + point[2] * cosine,
  ];
};

const rotateAroundX = (point: Vec3Tuple, angle: number): Vec3Tuple => {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [
    point[0],
    point[1] * cosine - point[2] * sine,
    point[1] * sine + point[2] * cosine,
  ];
};

const rotateAroundZ = (point: Vec3Tuple, angle: number): Vec3Tuple => {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [
    point[0] * cosine - point[1] * sine,
    point[0] * sine + point[1] * cosine,
    point[2],
  ];
};

const sportsBallSeamPoint = (
  angle: number,
  curvature: number,
): Vec3Tuple => {
  const pathAngle = angle * 2;
  const bend =
    0.22 + Math.max(0, Math.min(100, curvature)) * 0.005;
  const polarAngle =
    Math.PI / 2 -
    (Math.PI / 2 - bend) * Math.cos(pathAngle);
  const azimuth =
    pathAngle / 2 + bend * Math.sin(pathAngle * 2);
  return [
    Math.sin(polarAngle) * Math.cos(azimuth),
    Math.sin(polarAngle) * Math.sin(azimuth),
    Math.cos(polarAngle),
  ];
};

const tennisSeamNetwork = (curvature: number): Network =>
  sampledLoop(
    (angle) =>
      rotateAroundY(
        rotateAroundX(
          sportsBallSeamPoint(angle, curvature),
          -0.46,
        ),
        Math.PI / 5,
      ),
    256,
  );

const basketballPanelNetwork = (
  curvature: number,
): Network => {
  const front = normalize([0.66, 0.48, 0.76]);
  const right = normalize([front[2], 0, -front[0]]);
  const up = normalize([
    front[1] * right[2] - front[2] * right[1],
    front[2] * right[0] - front[0] * right[2],
    front[0] * right[1] - front[1] * right[0],
  ]);
  const toWorld = ([x, y, z]: Vec3Tuple): Vec3Tuple =>
    normalize([
      right[0] * x + up[0] * y + front[0] * z,
      right[1] * x + up[1] * y + front[1] * z,
      right[2] * x + up[2] * y + front[2] * z,
    ]);
  const curvedLoop = sampledLoop((angle) => {
    const [curveX, curveY, curveZ] = sportsBallSeamPoint(
      angle,
      curvature,
    );
    return toWorld([
      curveY,
      -curveX,
      curveZ,
    ]);
  }, 256);

  return joinNetworks([
    sampledLoop(
      (angle) => toWorld([Math.cos(angle), 0, Math.sin(angle)]),
      160,
    ),
    sampledLoop(
      (angle) => toWorld([0, Math.cos(angle), Math.sin(angle)]),
      160,
    ),
    curvedLoop,
  ]);
};

const customBandNetwork = (band: CustomBand): Network =>
  sampledLoop((angle) => {
    const bend =
      (Math.max(0, Math.min(100, band.curvature)) / 100) * 0.82;
    const latitude = bend * Math.sin(angle * 2);
    const point: Vec3Tuple = [
      Math.cos(latitude) * Math.cos(angle),
      Math.sin(latitude),
      Math.cos(latitude) * Math.sin(angle),
    ];
    const curved = rotateAroundZ(
      point,
      (band.curveAngle * Math.PI) / 180,
    );
    const tilted = rotateAroundX(
      curved,
      (band.tilt * Math.PI) / 180,
    );
    return rotateAroundY(
      tilted,
      (band.rotation * Math.PI) / 180,
    );
  }, 192);

const customBandNetworkSet = (bands: CustomBand[]): Network | null => {
  if (bands.length === 0) return null;
  return joinNetworks(bands.slice(0, 8).map(customBandNetwork));
};

const rugbyPanelNetwork = (): Network =>
  joinNetworks([
    sampledLoop((angle) => [Math.cos(angle), Math.sin(angle), 0], 192),
    sampledLoop((angle) => [Math.cos(angle), 0, Math.sin(angle)], 192),
    sampledPath((amount) => {
      const x = -0.38 + amount * 0.76;
      return [x, 0, Math.sqrt(Math.max(0, 1 - x * x))];
    }, 64),
  ]);

const baseballPoint = (
  angle: number,
  curvature: number,
): Vec3Tuple =>
  rotateAroundY(
    sportsBallSeamPoint(angle, curvature),
    Math.PI / 5,
  );

const volleyballPanelNetwork = (): Network => {
  const vertices: Vec3Tuple[] = [];
  const edges: Array<[number, number]> = [];
  const vertexIndices = new Map<string, number>();
  const edgeKeys = new Set<string>();
  const samples = 24;

  const vertexIndex = (point: Vec3Tuple) => {
    const unit = normalize(point);
    const key = unit.map((value) => value.toFixed(7)).join(":");
    const existing = vertexIndices.get(key);
    if (existing !== undefined) return existing;
    const index = vertices.length;
    vertices.push(unit);
    vertexIndices.set(key, index);
    return index;
  };
  const addPolyline = (sampler: (amount: number) => Vec3Tuple) => {
    let previous = vertexIndex(sampler(0));
    for (let sample = 1; sample <= samples; sample += 1) {
      const current = vertexIndex(sampler(sample / samples));
      const key =
        previous < current
          ? `${previous}:${current}`
          : `${current}:${previous}`;
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        edges.push([previous, current]);
      }
      previous = current;
    }
  };

  const faces: Array<{
    normal: Vec3Tuple;
    u: Vec3Tuple;
    v: Vec3Tuple;
    splitAlongU: boolean;
  }> = [
    { normal: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1], splitAlongU: true },
    { normal: [-1, 0, 0], u: [0, 1, 0], v: [0, 0, -1], splitAlongU: true },
    { normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1], splitAlongU: false },
    { normal: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1], splitAlongU: false },
    { normal: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], splitAlongU: true },
    { normal: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], splitAlongU: true },
  ];
  const pointOnFace = (
    face: (typeof faces)[number],
    u: number,
    v: number,
  ): Vec3Tuple => [
    face.normal[0] + face.u[0] * u + face.v[0] * v,
    face.normal[1] + face.u[1] * u + face.v[1] * v,
    face.normal[2] + face.u[2] * u + face.v[2] * v,
  ];

  for (const face of faces) {
    for (const fixed of [-1, 1]) {
      addPolyline((amount) =>
        pointOnFace(face, fixed, -1 + amount * 2),
      );
      addPolyline((amount) =>
        pointOnFace(face, -1 + amount * 2, fixed),
      );
    }
    for (const split of [-1 / 3, 1 / 3]) {
      addPolyline((amount) =>
        face.splitAlongU
          ? pointOnFace(face, -1 + amount * 2, split)
          : pointOnFace(face, split, -1 + amount * 2),
      );
    }
  }
  return { vertices, edges };
};

const seamNetwork = (parameters: BallParameters): Network | null => {
  switch (parameters.seamPattern) {
    case "custom":
      return customBandNetworkSet(parameters.customBands);
    case "tennis":
      return tennisSeamNetwork(parameters.seamCurvature);
    case "basketball":
      return basketballPanelNetwork(parameters.seamCurvature);
    case "volleyball":
      return volleyballPanelNetwork();
    case "football":
      return soccerPanelNetwork();
    case "baseball":
      return sampledLoop(
        (angle) => baseballPoint(angle, parameters.seamCurvature),
        256,
      );
    case "rugby":
      return rugbyPanelNetwork();
    default:
      return null;
  }
};

const rugbyLaces = (
  wasm: ManifoldToplevel,
  parameters: BallParameters,
  surfaceRadius: number,
  segments: number,
) => {
  const parts: ManifoldSolid[] = [];
  const laceRadius = Math.max(
    0.25,
    Math.min(1.15, parameters.seamWidth * 0.13),
  );
  const halfSpan = Math.min(
    0.12,
    (parameters.seamWidth * 0.72) / Math.max(1, surfaceRadius),
  );
  const count = 8;
  for (let index = 0; index < count; index += 1) {
    const x = -0.3 + (index / (count - 1)) * 0.6;
    const z = Math.sqrt(
      Math.max(0, 1 - x * x - halfSpan * halfSpan),
    );
    const radius = surfaceRadius + laceRadius * 0.22;
    parts.push(
      cylinderBetween(
        wasm,
        [x * radius, -halfSpan * radius, z * radius],
        [x * radius, halfSpan * radius, z * radius],
        laceRadius,
        Math.max(8, segments),
      ),
    );
  }
  return combine(wasm, parts);
};

const baseballStitches = (
  wasm: ManifoldToplevel,
  parameters: BallParameters,
  surfaceRadius: number,
  seamWidth: number,
  segments: number,
) => {
  const parts: ManifoldSolid[] = [];
  const stitchRadius = Math.max(
    0.15,
    Math.min(
      seamWidth * 0.22,
      parameters.baseballStitchThickness / 2,
    ),
  );
  const count = Math.max(
    18,
    Math.min(96, Math.round(parameters.baseballStitchDensity)),
  );
  const centerRadius = surfaceRadius + stitchRadius * 0.12;

  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    const normal = new Vector3(
      ...baseballPoint(angle, parameters.seamCurvature),
    ).normalize();
    const before = new Vector3(
      ...baseballPoint(angle - 0.012, parameters.seamCurvature),
    );
    const after = new Vector3(
      ...baseballPoint(angle + 0.012, parameters.seamCurvature),
    );
    const tangent = after.sub(before).normalize();
    const lateral = normal.clone().cross(tangent).normalize();
    const center = normal.clone().multiplyScalar(centerRadius);
    const forward = tangent.clone().multiplyScalar(seamWidth * 0.2);
    const back = tangent.clone().multiplyScalar(-seamWidth * 0.16);
    const left = center
      .clone()
      .add(lateral.clone().multiplyScalar(-seamWidth * 0.36))
      .add(forward);
    const right = center
      .clone()
      .add(lateral.clone().multiplyScalar(seamWidth * 0.36))
      .add(forward);
    const tip = center.clone().add(back);
    parts.push(
      cylinderBetween(
        wasm,
        [left.x, left.y, left.z],
        [tip.x, tip.y, tip.z],
        stitchRadius,
        segments,
      ),
      cylinderBetween(
        wasm,
        [tip.x, tip.y, tip.z],
        [right.x, right.y, right.z],
        stitchRadius,
        segments,
      ),
    );
  }

  return combine(wasm, parts);
};

const applySeams = (
  wasm: ManifoldToplevel,
  base: ManifoldSolid,
  parameters: BallParameters,
  bodyRadius: number,
  envelopeRadius: number,
  registry: MaterialRegistry,
  openStructure = false,
) => {
  const network = seamNetwork(parameters);
  if (!network) return base;
  const segments = QUALITY_SEGMENTS[parameters.quality];

  if (openStructure || parameters.seamOperation === "raised") {
    const outerRadius =
      parameters.seamOperation === "raised"
        ? envelopeRadius
        : envelopeRadius - parameters.seamDepth;
    const connectionDepth = openStructure
      ? Math.max(parameters.featureWidth * 1.35, parameters.seamDepth + 0.8)
      : Math.max(parameters.wallThickness * 0.72, 0.55);
    const innerRadius = Math.min(
      bodyRadius - connectionDepth,
      outerRadius - Math.max(0.65, parameters.seamDepth + 0.35),
    );
    let seams = ribbonNetworkSolid(
      wasm,
      network,
      innerRadius,
      outerRadius,
      parameters.seamWidth,
      segments,
      parameters.seamProfile === "rounded",
    );

    if (
      parameters.seamPattern === "baseball" &&
      parameters.seamOperation === "raised"
    ) {
      const stitches = baseballStitches(
        wasm,
        parameters,
        outerRadius,
        parameters.seamWidth,
        STRUT_SEGMENTS[parameters.quality],
      );
      const stitchedSeams = seams.add(stitches);
      seams.delete();
      stitches.delete();
      seams = stitchedSeams;
    }

    if (
      parameters.seamPattern === "rugby" &&
      parameters.seamOperation === "raised"
    ) {
      const laces = rugbyLaces(
        wasm,
        parameters,
        outerRadius,
        STRUT_SEGMENTS[parameters.quality],
      );
      const lacedSeams = seams.add(laces);
      seams.delete();
      laces.delete();
      seams = lacedSeams;
    }

    seams = tagSolid(seams, registry, "detail");
    const result = base.add(seams);
    base.delete();
    seams.delete();
    return result;
  }

  let cutter = ribbonNetworkSolid(
    wasm,
    network,
    Math.max(0.1, bodyRadius - parameters.seamDepth),
    bodyRadius + 0.45,
    parameters.seamWidth,
    segments,
    parameters.seamProfile === "rounded",
  );
  cutter = tagSolid(cutter, registry, "detail");
  const result = base.subtract(cutter);
  base.delete();
  cutter.delete();
  return result;
};

const GLYPHS: Record<string, number[]> = {
  " ": [0, 0, 0, 0, 0, 0, 0],
  "?": [14, 17, 1, 2, 4, 0, 4],
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 14],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  "0": [14, 17, 19, 21, 25, 17, 14],
  "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 2, 4, 8, 31],
  "3": [30, 1, 1, 14, 1, 1, 30],
  "4": [2, 6, 10, 18, 31, 2, 2],
  "5": [31, 16, 16, 30, 1, 1, 30],
  "6": [14, 16, 16, 30, 17, 17, 14],
  "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14],
  "9": [14, 17, 17, 15, 1, 1, 14],
};

const textMask = (text: string) => {
  const characters = [...text.toUpperCase().slice(0, 12)];
  const rows = Array.from({ length: 7 }, () => "");
  for (const [characterIndex, character] of characters.entries()) {
    const glyph = GLYPHS[character] ?? GLYPHS["?"];
    for (let row = 0; row < 7; row += 1) {
      rows[row] += Array.from({ length: 5 }, (_, column) =>
        glyph[row] & (1 << (4 - column)) ? "1" : "0",
      ).join("");
      if (characterIndex < characters.length - 1) rows[row] += "0";
    }
  }
  return rows;
};

const effectiveMarkings = (parameters: BallParameters): BallMarking[] => {
  if (Array.isArray(parameters.markings) && parameters.markings.length > 0) {
    return parameters.markings.slice(0, 8);
  }
  if (parameters.markingType === "none") return [];
  return [
    {
      id: "legacy-marking",
      type: parameters.markingType,
      operation: parameters.markingOperation,
      text: parameters.markingText,
      logoMask: parameters.markingLogoMask,
      vectorData: "",
      logoName: parameters.markingLogoName,
      font: "modern",
      placement:
        parameters.seamPattern === "none" ? "surface" : "band",
      size: parameters.markingSize,
      height: parameters.markingHeight,
      bandIndex: 0,
      position:
        parameters.seamPattern === "none" ? 62 : 50,
      latitude:
        parameters.seamPattern === "none" ? 20 : 0,
      rotation: 0,
      framePadding: 3,
    },
  ];
};

const markingMask = (marking: BallMarking) => {
  if (marking.type === "logo") {
    return marking.logoMask
      .split("/")
      .filter((row) => /^[01]+$/.test(row))
      .slice(0, 96);
  }
  if (marking.type === "text") {
    return textMask(marking.text.trim() || "AIRLAB");
  }
  return [];
};

interface PlanarMarking {
  contours: Vec2[][];
  groups: Vec2[][][];
  width: number;
  height: number;
}

interface ParsedVectorGeometry {
  contours: Vec2[][];
  groups: number[][];
}

const parsedVectorGeometry = (source: string): ParsedVectorGeometry => {
  if (!source) return { contours: [], groups: [] };
  try {
    const parsed = JSON.parse(source) as unknown;
    const rawContours = Array.isArray(parsed)
      ? parsed
      : parsed &&
          typeof parsed === "object" &&
          Array.isArray((parsed as { contours?: unknown }).contours)
        ? (parsed as { contours: unknown[] }).contours
        : [];
    const contours = rawContours
      .filter((contour): contour is unknown[] => Array.isArray(contour))
      .map((contour) =>
        contour
          .filter(
            (point): point is [number, number] =>
              Array.isArray(point) &&
              point.length === 2 &&
              Number.isFinite(point[0]) &&
              Number.isFinite(point[1]),
          )
          .map(([x, y]) => [x, y] as Vec2),
      )
      .filter((contour) => contour.length >= 3);
    const rawGroups =
      !Array.isArray(parsed) &&
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { groups?: unknown }).groups)
        ? (parsed as { groups: unknown[] }).groups
        : [];
    const groups = rawGroups
      .filter((group): group is unknown[] => Array.isArray(group))
      .map((group) =>
        group.filter(
          (index): index is number =>
            typeof index === "number" &&
            Number.isInteger(index) &&
            index >= 0 &&
            index < contours.length,
        ),
      )
      .filter((group) => group.length > 0);
    return { contours, groups };
  } catch {
    return { contours: [], groups: [] };
  }
};

const maskContours = (rows: string[]): Vec2[][] => {
  const rowCount = rows.length;
  const columnCount = Math.max(0, ...rows.map((row) => row.length));
  if (rowCount === 0 || columnCount === 0) return [];
  const scale = 1 / Math.max(rowCount, columnCount);
  const contours: Vec2[][] = [];
  rows.forEach((row, rowIndex) => {
    let column = 0;
    while (column < row.length) {
      if (row[column] !== "1") {
        column += 1;
        continue;
      }
      const start = column;
      while (column < row.length && row[column] === "1") column += 1;
      const end = column;
      const left = (start - columnCount / 2) * scale;
      const right = (end - columnCount / 2) * scale;
      const top = (rowCount / 2 - rowIndex) * scale;
      const bottom = (rowCount / 2 - rowIndex - 1) * scale;
      contours.push([
        [left, bottom],
        [right, bottom],
        [right, top],
        [left, top],
      ]);
    }
  });
  return contours;
};

const markingPlanarGeometry = (marking: BallMarking): PlanarMarking | null => {
  const vector = parsedVectorGeometry(marking.vectorData ?? "");
  const contours =
    vector.contours.length > 0
      ? vector.contours
      : maskContours(markingMask(marking));
  const points = contours.flat();
  if (points.length === 0) return null;
  const minX = Math.min(...points.map(([x]) => x));
  const maxX = Math.max(...points.map(([x]) => x));
  const minY = Math.min(...points.map(([, y]) => y));
  const maxY = Math.max(...points.map(([, y]) => y));
  const sourceWidth = Math.max(1e-5, maxX - minX);
  const sourceHeight = Math.max(1e-5, maxY - minY);
  const targetScale =
    marking.size /
    (marking.type === "text"
      ? sourceWidth
      : Math.max(sourceWidth, sourceHeight));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const scaledContours = contours.map((contour) =>
      contour.map(
        ([x, y]) =>
          [
            (x - centerX) * targetScale,
            (y - centerY) * targetScale,
          ] as Vec2,
      ),
    );
  const groupIndexes =
    marking.type === "text" && vector.groups.length > 0
      ? vector.groups
      : scaledContours.map((_, index) => [index]);
  return {
    contours: scaledContours,
    groups: groupIndexes.map((group) =>
      group.map((index) => scaledContours[index]).filter(Boolean),
    ),
    width: sourceWidth * targetScale,
    height: sourceHeight * targetScale,
  };
};

const roundedRectangle = (
  width: number,
  height: number,
  cornerRadius: number,
): Vec2[] => {
  const radius = Math.max(
    0.4,
    Math.min(cornerRadius, width / 2, height / 2),
  );
  const points: Vec2[] = [];
  const corners = [
    [width / 2 - radius, height / 2 - radius, 0],
    [-width / 2 + radius, height / 2 - radius, 90],
    [-width / 2 + radius, -height / 2 + radius, 180],
    [width / 2 - radius, -height / 2 + radius, 270],
  ] as const;
  corners.forEach(([centerX, centerY, startDegrees]) => {
    for (let step = 0; step <= 6; step += 1) {
      const angle = ((startDegrees + (step / 6) * 90) * Math.PI) / 180;
      points.push([
        centerX + Math.cos(angle) * radius,
        centerY + Math.sin(angle) * radius,
      ]);
    }
  });
  return points;
};

const extrudeContours = (
  wasm: ManifoldToplevel,
  contours: Vec2[][],
  depth: number,
  maximumEdgeLength?: number,
  topScale: Vec2 = [1, 1],
) => {
  const section = new wasm.CrossSection(contours, "EvenOdd");
  const solid = wasm.Manifold.extrude(
    section,
    Math.max(0.2, depth),
    0,
    0,
    topScale,
    true,
  );
  section.delete();
  const refined =
    maximumEdgeLength === undefined
      ? solid.refine(2)
      : solid.refineToLength(Math.max(0.45, maximumEdgeLength));
  solid.delete();
  return refined;
};

const markingEdgeLength = (surfaceRadius: number) =>
  Math.max(0.45, Math.min(0.85, surfaceRadius / 55));

const markingFrame = (marking: BallMarking) => {
  const longitude = ((marking.position - 50) / 100) * Math.PI * 2;
  const latitude = ((marking.latitude ?? 0) * Math.PI) / 180;
  const normal = new Vector3(
    Math.cos(latitude) * Math.sin(longitude),
    Math.sin(latitude),
    Math.cos(latitude) * Math.cos(longitude),
  ).normalize();
  const east = new Vector3(Math.cos(longitude), 0, -Math.sin(longitude));
  const north = normal.clone().cross(east).normalize();
  const rotation = ((marking.rotation ?? 0) * Math.PI) / 180;
  const tangent = east
    .clone()
    .multiplyScalar(Math.cos(rotation))
    .addScaledVector(north, Math.sin(rotation))
    .normalize();
  const across = normal.clone().cross(tangent).normalize();
  return { normal, tangent, across };
};

const sphericalSurfaceSolid = (
  wasm: ManifoldToplevel,
  contours: Vec2[][],
  depth: number,
  surfaceRadius: number,
  centerRadius: number,
  marking: BallMarking,
  maximumEdgeLength: number,
  topScale: Vec2 = [1, 1],
) => {
  const { normal, tangent, across } = markingFrame(marking);
  const flat = extrudeContours(
    wasm,
    contours,
    depth,
    maximumEdgeLength,
    topScale,
  );
  const positioned = flat.warp((vertex) => {
    const localX = vertex[0];
    const localY = vertex[1];
    const distance = Math.hypot(localX, localY);
    const direction = normal.clone();
    if (distance > 1e-8) {
      const angle = distance / Math.max(1, surfaceRadius);
      direction
        .multiplyScalar(Math.cos(angle))
        .addScaledVector(
          tangent,
          (localX / distance) * Math.sin(angle),
        )
        .addScaledVector(
          across,
          (localY / distance) * Math.sin(angle),
        )
        .normalize();
    }
    const radius = centerRadius + vertex[2];
    vertex[0] = direction.x * radius;
    vertex[1] = direction.y * radius;
    vertex[2] = direction.z * radius;
  });
  flat.delete();
  return positioned;
};

const applySingleSurfaceMarking = (
  wasm: ManifoldToplevel,
  base: ManifoldSolid,
  parameters: BallParameters,
  marking: BallMarking,
  surfaceRadius: number,
  registry: MaterialRegistry,
  needsBacking = false,
) => {
  const planar = markingPlanarGeometry(marking);
  if (!planar) return base;
  const padding = Math.max(1, marking.framePadding ?? 3);
  const frameWidth = planar.width + padding * 2;
  const frameHeight = planar.height + padding * 2;
  const frameContour = roundedRectangle(
    frameWidth,
    frameHeight,
    Math.min(padding, frameHeight * 0.3),
  );
  const operation = marking.operation;
  const overlap = 0.4;
  const markingDepth = Math.max(0.25, marking.height);
  const frameRise = Math.max(
    0,
    Math.min(
      4,
      marking.frameHeight ?? Math.max(0.9, marking.height * 0.72),
    ),
  );
  const islandBevel = Math.min(
    1.6,
    Math.max(0.65, padding * 0.48),
    Math.max(0.65, padding - 0.7),
  );
  const frameTopWidth = Math.max(
    planar.width + 1.4,
    frameWidth - islandBevel * 2,
  );
  const frameTopHeight = Math.max(
    planar.height + 1.4,
    frameHeight - islandBevel * 2,
  );
  const frameTopScale: Vec2 = [
    Math.min(1, frameTopWidth / frameWidth),
    Math.min(1, frameTopHeight / frameHeight),
  ];
  const raisedPatternInset =
    parameters.mode !== "lattice" &&
    parameters.pattern !== "none" &&
    (parameters.mode === "solid" || parameters.mode === "shell") &&
    parameters.effect === "raised"
      ? parameters.featureHeight
      : 0;
  const raisedSeamInset =
    parameters.mode !== "lattice" &&
    parameters.seamPattern !== "none" &&
    parameters.seamOperation === "raised"
      ? parameters.seamDepth
      : 0;
  const printableSkinDepth =
    parameters.mode === "lattice"
      ? parameters.featureWidth +
        (parameters.seamPattern !== "none" &&
        parameters.seamOperation === "raised"
          ? parameters.seamDepth
          : 0)
      : parameters.wallThickness +
        Math.max(raisedPatternInset, raisedSeamInset);
  // Stop the island at the model's inner skin. The previous feature-width
  // multiplier pushed a thick plug several millimetres into small balls.
  const structuralBacking = needsBacking
    ? Math.max(0.5, printableSkinDepth + 0.08)
    : overlap;
  const backingDepth = Math.max(
    structuralBacking,
    markingDepth - frameRise + 0.45,
  );
  let result = base;

  let frame = sphericalSurfaceSolid(
    wasm,
    [frameContour],
    backingDepth + frameRise,
    surfaceRadius,
    surfaceRadius + (frameRise - backingDepth) / 2,
    marking,
    markingEdgeLength(surfaceRadius) * 1.6,
    frameTopScale,
  );
  frame = tagSolid(frame, registry, "detail");
  const framed = result.add(frame);
  result.delete();
  frame.delete();
  result = framed;

  const markingOverlap = 0.28;
  const artworkSurface = surfaceRadius + frameRise;
  const makeArtwork = (depth: number, centerRadius: number) =>
    sphericalSurfaceSolid(
      wasm,
      planar.contours,
      depth,
      surfaceRadius,
      centerRadius,
      marking,
      markingEdgeLength(surfaceRadius),
    );
  let artwork = makeArtwork(
    markingDepth + markingOverlap,
    operation === "raised"
      ? artworkSurface + (markingDepth - markingOverlap) / 2
      : artworkSurface + (markingOverlap - markingDepth) / 2,
  );
  artwork = tagSolid(
    artwork,
    registry,
    operation === "raised" ? "marking" : "detail",
  );
  let finished =
    operation === "raised"
      ? result.add(artwork)
      : result.subtract(artwork);
  result.delete();
  artwork.delete();
  if (operation === "engraved") {
    const inlayThickness = Math.min(0.14, markingDepth * 0.3);
    const inlayOverlap = 0.04;
    let inlay = makeArtwork(
      inlayThickness + inlayOverlap,
      artworkSurface -
        markingDepth +
        (inlayThickness - inlayOverlap) / 2,
    );
    inlay = tagSolid(inlay, registry, "marking");
    const withInlay = inlay.add(finished);
    finished.delete();
    inlay.delete();
    finished = withInlay;
  }
  return finished;
};

const applyMarking = (
  wasm: ManifoldToplevel,
  base: ManifoldSolid,
  parameters: BallParameters,
  surfaceRadius: number,
  registry: MaterialRegistry,
) =>
  effectiveMarkings(parameters).reduce(
    (result, marking) =>
      applySingleSurfaceMarking(
        wasm,
        result,
        parameters,
        marking,
        surfaceRadius,
        registry,
        parameters.mode === "perforated" ||
          parameters.pattern !== "none",
      ),
    base,
  );

interface SeamMarkingPath {
  points: Vec3Tuple[];
  cumulativeAngles: number[];
  totalAngle: number;
  centerAngle: number;
  closed: boolean;
}

const angleBetween = (left: Vec3Tuple, right: Vec3Tuple) =>
  Math.acos(
    Math.max(
      -1,
      Math.min(
        1,
        left[0] * right[0] +
          left[1] * right[1] +
          left[2] * right[2],
      ),
    ),
  );

const pathCumulativeAngles = (points: Vec3Tuple[]) => {
  const cumulativeAngles = [0];
  for (let index = 1; index < points.length; index += 1) {
    cumulativeAngles.push(
      cumulativeAngles[index - 1] +
        angleBetween(points[index - 1], points[index]),
    );
  }
  return cumulativeAngles;
};

const seamMarkingPath = (
  parameters: BallParameters,
  bandIndex: number,
): SeamMarkingPath | null => {
  const network = seamNetwork(parameters);
  if (!network) return null;
  const viewDirection = new Vector3(0.66, 0.48, 0.76).normalize();
  const maximumAngle = Math.PI / 240;
  const paths = networkPaths(network)
    .map((path) => ({
      points: resamplePath(path.points, path.closed, maximumAngle),
      closed: path.closed,
    }))
    .filter((path) => path.points.length >= 2);

  const candidates: Array<{
    score: number;
    pathIndex: number;
    pointIndex: number;
  }> = [];
  paths.forEach((path, pathIndex) => {
    let bestForPath:
      | {
          score: number;
          pathIndex: number;
          pointIndex: number;
        }
      | undefined;
    const evaluate = (avoidIntersections: boolean) => {
      path.points.forEach((point, pointIndex) => {
        if (
          !path.closed &&
          (pointIndex < path.points.length * 0.18 ||
            pointIndex > path.points.length * 0.82)
        ) {
          return;
        }
        if (
          avoidIntersections &&
          path.closed &&
          paths.length > 1
        ) {
          let nearestOtherPath = Number.POSITIVE_INFINITY;
          paths.forEach((otherPath, otherPathIndex) => {
            if (otherPathIndex === pathIndex) return;
            const stride = Math.max(
              1,
              Math.floor(otherPath.points.length / 96),
            );
            for (
              let otherIndex = 0;
              otherIndex < otherPath.points.length;
              otherIndex += stride
            ) {
              nearestOtherPath = Math.min(
                nearestOtherPath,
                angleBetween(point, otherPath.points[otherIndex]),
              );
            }
          });
          if (nearestOtherPath < 0.18) return;
        }
        const previous = new Vector3(
          ...path.points[
            path.closed
              ? (pointIndex - 1 + path.points.length) %
                path.points.length
              : Math.max(0, pointIndex - 1)
          ],
        );
        const next = new Vector3(
          ...path.points[
            path.closed
              ? (pointIndex + 1) % path.points.length
              : Math.min(path.points.length - 1, pointIndex + 1)
          ],
        );
        const normal = new Vector3(...point);
        const tangent = next.sub(previous);
        tangent.addScaledVector(normal, -tangent.dot(normal)).normalize();
        if (!Number.isFinite(tangent.x)) return;
        const availableLengthBonus = Math.min(
          0.35,
          path.points.length / 600,
        );
        const score =
          normal.dot(viewDirection) * 2.4 +
          Math.abs(tangent.x) * 0.55 -
          Math.abs(tangent.y) * 0.18 +
          availableLengthBonus;
        if (!bestForPath || score > bestForPath.score) {
          bestForPath = { score, pathIndex, pointIndex };
        }
      });
    };
    evaluate(true);
    if (!bestForPath) evaluate(false);
    if (bestForPath) {
      candidates.push(bestForPath);
    }
  });
  if (candidates.length === 0) return null;
  candidates.sort((left, right) =>
    parameters.seamPattern === "basketball" ||
    parameters.seamPattern === "custom"
      ? left.pathIndex - right.pathIndex
      : right.score - left.score || left.pathIndex - right.pathIndex,
  );
  const roundedBandIndex = Math.max(0, Math.round(bandIndex));
  const selectedIndex =
    parameters.seamPattern === "basketball" ||
    parameters.seamPattern === "custom"
      ? Math.min(roundedBandIndex, candidates.length - 1)
      : roundedBandIndex % candidates.length;
  const selected = candidates[selectedIndex];

  let points = paths[selected.pathIndex].points;
  let centerIndex = selected.pointIndex;
  const closed = paths[selected.pathIndex].closed;
  const previous = new Vector3(
    ...points[
      closed
        ? (centerIndex - 1 + points.length) % points.length
        : Math.max(0, centerIndex - 1)
    ],
  );
  const next = new Vector3(
    ...points[
      closed
        ? (centerIndex + 1) % points.length
        : Math.min(points.length - 1, centerIndex + 1)
    ],
  );
  if (next.sub(previous).x < 0) {
    points = [...points].reverse();
    centerIndex = points.length - 1 - centerIndex;
  }

  const cumulativeAngles = pathCumulativeAngles(points);
  const totalAngle =
    cumulativeAngles.at(-1)! +
    (closed ? angleBetween(points.at(-1)!, points[0]) : 0);
  return {
    points,
    cumulativeAngles,
    totalAngle,
    centerAngle: cumulativeAngles[centerIndex],
    closed,
  };
};

const sampleSeamMarkingPath = (
  path: SeamMarkingPath,
  angularOffset: number,
) => {
  let targetAngle = path.centerAngle + angularOffset;
  if (path.closed) {
    targetAngle =
      ((targetAngle % path.totalAngle) + path.totalAngle) %
      path.totalAngle;
  } else {
    targetAngle = Math.max(0, Math.min(path.totalAngle, targetAngle));
  }

  let startIndex = path.points.length - 1;
  let endIndex = path.closed ? 0 : startIndex;
  let segmentStart = path.cumulativeAngles[startIndex];
  let segmentEnd = path.totalAngle;
  for (let index = 0; index < path.points.length - 1; index += 1) {
    const nextAngle = path.cumulativeAngles[index + 1];
    if (targetAngle <= nextAngle) {
      startIndex = index;
      endIndex = index + 1;
      segmentStart = path.cumulativeAngles[index];
      segmentEnd = nextAngle;
      break;
    }
  }

  const amount =
    segmentEnd - segmentStart <= 1e-7
      ? 0
      : (targetAngle - segmentStart) / (segmentEnd - segmentStart);
  const normalTuple = slerp(
    path.points[startIndex],
    path.points[endIndex],
    Math.max(0, Math.min(1, amount)),
  );
  const normal = new Vector3(...normalTuple);
  const tangent = new Vector3(...path.points[endIndex]).sub(
    new Vector3(...path.points[startIndex]),
  );
  tangent.addScaledVector(normal, -tangent.dot(normal)).normalize();
  return { normal, tangent };
};

const applySingleSeamMarking = (
  wasm: ManifoldToplevel,
  base: ManifoldSolid,
  parameters: BallParameters,
  marking: BallMarking,
  surfaceRadius: number,
  registry: MaterialRegistry,
) => {
  const planar = markingPlanarGeometry(marking);
  const path = seamMarkingPath(parameters, marking.bandIndex);
  if (!planar || !path) return base;
  const verticalScale = Math.min(
    1,
    (parameters.seamWidth * 0.72) / Math.max(0.2, planar.height),
  );
  const contours = planar.contours.map((contour) =>
    contour.map(([x, y]) => [x, y * verticalScale] as Vec2),
  );
  const operation = marking.operation;
  const requestedHeight = Math.max(0.2, marking.height);
  const height =
    operation === "raised"
      ? requestedHeight
      : Math.min(
          requestedHeight,
          Math.max(0.45, parameters.seamDepth + 0.25),
        );
  const overlap = operation === "raised" ? 0.48 : 0.36;
  const centerRadius =
    operation === "raised"
      ? surfaceRadius + (height - overlap) / 2
      : surfaceRadius + (overlap - height) / 2;
  const seamSolid = (depth: number, radialCenter: number) => {
    const flat = extrudeContours(
      wasm,
      contours,
      depth,
      markingEdgeLength(surfaceRadius),
    );
    const curved = flat.warp((vertex) => {
      const horizontal = vertex[0];
      const vertical = vertex[1];
      const sample = sampleSeamMarkingPath(
        path,
        (path.closed
          ? ((marking.position - 50) / 100) * path.totalAngle
          : (marking.position / 100) * path.totalAngle -
            path.centerAngle) +
          horizontal / surfaceRadius,
      );
      const across = sample.normal
        .clone()
        .cross(sample.tangent)
        .normalize();
      const verticalAngle = vertical / surfaceRadius;
      const normal = sample.normal
        .clone()
        .multiplyScalar(Math.cos(verticalAngle))
        .addScaledVector(across, Math.sin(verticalAngle))
        .normalize();
      const radius = radialCenter + vertex[2];
      vertex[0] = normal.x * radius;
      vertex[1] = normal.y * radius;
      vertex[2] = normal.z * radius;
    });
    flat.delete();
    return curved;
  };
  // Treat the marking as a layer between two concentric spherical
  // surfaces. Vertices on both faces share the same radial direction,
  // so raised text cannot fan into wedges and engraved walls stay radial.
  let markingSolid = seamSolid(height + overlap, centerRadius);
  markingSolid = tagSolid(
    markingSolid,
    registry,
    operation === "raised" ? "marking" : "detail",
  );
  let result =
    operation === "raised"
      ? base.add(markingSolid)
      : base.subtract(markingSolid);
  base.delete();
  markingSolid.delete();
  return result;
};

const applySeamMarking = (
  wasm: ManifoldToplevel,
  base: ManifoldSolid,
  parameters: BallParameters,
  bandSurfaceRadius: number,
  outerSurfaceRadius: number,
  registry: MaterialRegistry,
) =>
  effectiveMarkings(parameters).reduce(
    (result, marking) =>
      marking.placement === "surface"
        ? applySingleSurfaceMarking(
            wasm,
            result,
            parameters,
            marking,
            outerSurfaceRadius,
            registry,
            parameters.mode === "lattice" ||
              parameters.mode === "perforated" ||
              parameters.pattern !== "none",
          )
        : applySingleSeamMarking(
            wasm,
            result,
            parameters,
            marking,
            bandSurfaceRadius,
            registry,
          ),
    base,
  );

const applyAirlessMarking = (
  wasm: ManifoldToplevel,
  base: ManifoldSolid,
  parameters: BallParameters,
  surfaceRadius: number,
  registry: MaterialRegistry,
) => {
  return effectiveMarkings(parameters).reduce(
    (result, marking) =>
      applySingleSurfaceMarking(
        wasm,
        result,
        parameters,
        marking,
        surfaceRadius,
        registry,
        true,
      ),
    base,
  );
};

const standBaseSolid = (
  wasm: ManifoldToplevel,
  parameters: BallParameters,
) => {
  const size = parameters.standBaseSize;
  const height = parameters.standHeight;
  let base: ManifoldSolid;
  if (parameters.standBaseShape === "square") {
    base = wasm.Manifold.cube([size, size, height], true);
  } else {
    const radius =
      parameters.standBaseShape === "octagon"
        ? size / (2 * Math.cos(Math.PI / 8))
        : size / 2;
    base = wasm.Manifold.cylinder(
      height,
      radius,
      radius,
      parameters.standBaseShape === "octagon"
        ? 8
        : QUALITY_SEGMENTS[parameters.quality],
      true,
    );
    if (parameters.standBaseShape === "octagon") {
      const rotated = base.rotate([0, 0, 22.5]);
      base.delete();
      base = rotated;
    }
  }
  return base.translate([0, 0, height / 2]);
};

const standTextSolid = (
  wasm: ManifoldToplevel,
  parameters: BallParameters,
) => {
  if (!parameters.standText.trim()) return null;
  const marking: BallMarking = {
    id: "stand-label",
    type: "text",
    operation: parameters.standTextOperation,
    text: parameters.standText,
    logoMask: "",
    vectorData: parameters.standTextVectorData,
    logoName: "",
    font: parameters.standTextFont,
    size: Math.min(parameters.standTextSize, parameters.standBaseSize * 0.82),
    height: parameters.standTextDepth,
    bandIndex: 0,
    position: 50,
  };
  const planar = markingPlanarGeometry(marking);
  if (!planar) return null;
  const overlap = 0.32;
  const depth = parameters.standTextDepth;
  const totalDepth = depth + overlap;
  const verticalCenter = parameters.standHeight * 0.43;
  let text = extrudeContours(
    wasm,
    planar.contours,
    totalDepth,
    Math.max(0.45, parameters.standBaseSize / 120),
  );

  if (parameters.standBaseShape === "circle") {
    const surfaceRadius = parameters.standBaseSize / 2;
    const centerRadius =
      parameters.standTextOperation === "raised"
        ? surfaceRadius + (depth - overlap) / 2
        : surfaceRadius + (overlap - depth) / 2;
    const wrapped = text.warp((vertex) => {
      const localY = vertex[1];
      const angle = vertex[0] / Math.max(1, surfaceRadius);
      const radius = centerRadius + vertex[2];
      vertex[0] = Math.sin(angle) * radius;
      vertex[1] = -Math.cos(angle) * radius;
      vertex[2] = verticalCenter + localY;
    });
    text.delete();
    text = wrapped;
  } else {
    const frontDistance = parameters.standBaseSize / 2;
    const outward = new Vector3(0, -1, 0);
    const surface = new Vector3(0, -frontDistance, verticalCenter);
    const center = surface.addScaledVector(
      outward,
      parameters.standTextOperation === "raised"
        ? (depth - overlap) / 2
        : -(depth - overlap) / 2,
    );
    const transformed = text.transform(
      matrixElements(
        orientedMatrix(
          [outward.x, outward.y, outward.z],
          [center.x, center.y, center.z],
        ),
      ),
    );
    text.delete();
    text = transformed;
  }
  return text;
};

const generateStandSolid = (
  wasm: ManifoldToplevel,
  parameters: BallParameters,
  registry: MaterialRegistry,
) => {
  let result = standBaseSolid(wasm, parameters);
  result = tagSolid(result, registry, "body");

  const socketRadius =
    parameters.standBallDiameter / 2 + parameters.standClearance;
  const cutter = wasm.Manifold.sphere(
    socketRadius,
    QUALITY_SEGMENTS[parameters.quality],
  ).translate([
    0,
    0,
    parameters.standHeight + socketRadius - parameters.standSocketDepth,
  ]);
  const socketed = result.subtract(cutter);
  result.delete();
  cutter.delete();
  result = socketed;

  let text = standTextSolid(wasm, parameters);
  if (text) {
    text = tagSolid(
      text,
      registry,
      "marking",
    );
    const labeled =
      parameters.standTextOperation === "raised"
        ? result.add(text)
        : result.subtract(text);
    result.delete();
    text.delete();
    result = labeled;
  }

  // The viewport uses Y as its vertical axis. Exporters rotate this model
  // back to conventional Z-up coordinates for immediate slicing.
  const upright = result.rotate([-90, 0, 0]);
  result.delete();
  return upright;
};

const applySurfacePattern = (
  wasm: ManifoldToplevel,
  base: ManifoldSolid,
  parameters: BallParameters,
  bodyRadius: number,
  envelopeRadius: number,
) => {
  if (parameters.pattern === "none") return base;
  let features: ManifoldSolid;
  if (parameters.pattern === "triangles" || parameters.pattern === "hexagons") {
    features = cellSurfaceFeatures(
      wasm,
      parameters,
      bodyRadius,
      envelopeRadius,
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

const finalizeGeneratedModel = (
  input: ManifoldSolid,
  parameters: BallParameters,
  registry: MaterialRegistry,
  startedAt: number,
  exportUpAxis?: "y",
): GeneratedBall => {
  const result = keepLargestPrintableComponent(input);
  const status = result.status();
  if (status !== "NoError") {
    result.delete();
    throw new Error(`Geometry kernel returned ${status}.`);
  }

  const mesh = result.getMesh();
  const positions = readPositions(mesh.vertProperties, mesh.numProp);
  const indices = new Uint32Array(mesh.triVerts);
  const meshTriangleMaterials = triangleMaterials(mesh, registry);
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
  const previewMeshTriangleMaterials = triangleMaterials(
    shadedMesh,
    registry,
  );
  const nonManifoldEdges = countNonManifoldEdges(indices);
  const triangles = indices.length / 3;
  const watertight = nonManifoldEdges === 0;
  const decomposed = result.decompose();
  const componentVolumes = decomposed
    .map((component) => component.volume())
    .filter((volume) => Math.abs(volume) > 1e-6)
    .sort((left, right) => right - left);
  const components = componentVolumes.length;
  decomposed.forEach((component) => component.delete());
  const warningThickness =
    parameters.designKind === "stand"
      ? Math.max(1, Math.min(parameters.standHeight, parameters.standBaseSize) / 4)
      : parameters.wallThickness;
  const warningFeature =
    parameters.designKind === "stand"
      ? Math.max(0.8, parameters.standTextDepth)
      : parameters.featureWidth;
  const stats = {
    vertices: positions.length / 3,
    triangles,
    volume: result.volume(),
    surfaceArea: result.surfaceArea(),
    genus: result.genus(),
    watertight,
    nonManifoldEdges,
    components,
    componentVolumes,
    buildTimeMs: performance.now() - startedAt,
    dimensions: meshDimensions(positions),
    warnings: makeWarnings(warningThickness, warningFeature, {
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
    triangleMaterials: meshTriangleMaterials,
    previewTriangleMaterials: previewMeshTriangleMaterials,
    color: parameters.ballColor,
    detailColor: parameters.detailColor,
    markingColor: parameters.markingColor,
    colorMode: parameters.colorMode,
    exportUpAxis,
    stats,
  };
};

export const generateBall = async (
  parameters: BallParameters,
): Promise<GeneratedBall> => {
  const startedAt = performance.now();
  const wasm = await getModule();
  const materialRegistry = createMaterialRegistry();
  if (parameters.designKind === "stand") {
    return finalizeGeneratedModel(
      generateStandSolid(wasm, parameters, materialRegistry),
      parameters,
      materialRegistry,
      startedAt,
      "y",
    );
  }
  const envelopeRadius = parameters.diameter / 2;
  const raised = parameters.effect === "raised";
  const hasSurfaceRelief =
    parameters.pattern !== "none" &&
    (parameters.mode === "solid" || parameters.mode === "shell");
  const patternRelief =
    hasSurfaceRelief && raised ? parameters.featureHeight : 0;
  const seamRelief =
    parameters.mode !== "lattice" &&
    parameters.seamPattern !== "none" &&
    parameters.seamOperation === "raised"
      ? parameters.seamDepth
      : 0;
  const bodyRadius =
    envelopeRadius - Math.max(patternRelief, seamRelief);

  if (bodyRadius <= parameters.wallThickness) {
    throw new Error("Feature height and wall thickness leave no printable body.");
  }

  let result: ManifoldSolid;
  if (parameters.mode === "lattice") {
    if (parameters.pattern === "dots" || parameters.pattern === "spikes") {
      throw new Error("Lattice mode requires a triangle or hexagon pattern.");
    }
    const latticeRadius =
      envelopeRadius -
      parameters.featureWidth / 2 -
      (parameters.seamPattern !== "none" &&
      parameters.seamOperation === "raised"
        ? parameters.seamDepth
        : 0);
    const network = patternNetwork(parameters, latticeRadius);
    result = networkSolid(
      wasm,
      network,
      latticeRadius,
      parameters.featureWidth / 2,
      STRUT_SEGMENTS[parameters.quality],
      true,
    );
    result = tagSolid(result, materialRegistry, "body");
    result = applySeams(
      wasm,
      result,
      parameters,
      latticeRadius,
      envelopeRadius,
      materialRegistry,
      true,
    );
    result =
      parameters.seamPattern === "none"
        ? applyAirlessMarking(
            wasm,
            result,
            parameters,
            envelopeRadius,
            materialRegistry,
          )
        : applySeamMarking(
            wasm,
            result,
            parameters,
            parameters.seamOperation === "raised"
              ? envelopeRadius
              : envelopeRadius - parameters.seamDepth,
            envelopeRadius,
            materialRegistry,
          );
  } else {
    const continuousPolygonPattern =
      parameters.mode === "perforated" &&
      (parameters.pattern === "hexagons" ||
        parameters.pattern === "triangles");
    const footballPattern =
      continuousPolygonPattern &&
      parameters.seamPattern === "football";
    result = continuousPolygonPattern
      ? perforatedPatternSolid(wasm, parameters, bodyRadius)
      : baseSolid(wasm, bodyRadius, parameters);
    if (
      parameters.mode === "perforated" &&
      parameters.pattern !== "none" &&
      !continuousPolygonPattern
    ) {
      const cutters = perforationCutters(wasm, parameters, bodyRadius);
      result = subtract(result, cutters);
    } else if (parameters.mode !== "perforated") {
      result = applySurfacePattern(
        wasm,
        result,
        parameters,
        bodyRadius,
        envelopeRadius,
      );
    }
    result = tagSolid(result, materialRegistry, "body");
    const detailIsBasePattern = footballPattern;
    if (!detailIsBasePattern) {
      result = applySeams(
        wasm,
        result,
        parameters,
        bodyRadius,
        envelopeRadius,
        materialRegistry,
      );
    }
    result =
      parameters.seamPattern === "none"
        ? applyMarking(
            wasm,
            result,
            parameters,
            envelopeRadius,
            materialRegistry,
          )
        : applySeamMarking(
            wasm,
            result,
            parameters,
            parameters.seamOperation === "raised"
              ? envelopeRadius
              : bodyRadius - parameters.seamDepth,
            envelopeRadius,
            materialRegistry,
          );
  }

  const fitted = fitBallShape(result, parameters);
  result = applyKeychain(
    wasm,
    fitted.solid,
    parameters,
    materialRegistry,
    fitted.center,
    fitted.keychainPole,
  );
  return finalizeGeneratedModel(
    result,
    parameters,
    materialRegistry,
    startedAt,
  );
};
