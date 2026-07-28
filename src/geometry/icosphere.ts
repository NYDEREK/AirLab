export type Vec3Tuple = [number, number, number];
export type Face = [number, number, number];

export interface SphereTopology {
  vertices: Vec3Tuple[];
  faces: Face[];
}

const length = ([x, y, z]: Vec3Tuple) => Math.hypot(x, y, z);

export const normalize = (point: Vec3Tuple): Vec3Tuple => {
  const magnitude = length(point) || 1;
  return [point[0] / magnitude, point[1] / magnitude, point[2] / magnitude];
};

export const add = (a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];

export const scale = (point: Vec3Tuple, amount: number): Vec3Tuple => [
  point[0] * amount,
  point[1] * amount,
  point[2] * amount,
];

export const dot = (a: Vec3Tuple, b: Vec3Tuple) =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const cross = (a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const baseIcosahedron = (): SphereTopology => {
  const golden = (1 + Math.sqrt(5)) / 2;
  const vertices: Vec3Tuple[] = [
    [-1, golden, 0],
    [1, golden, 0],
    [-1, -golden, 0],
    [1, -golden, 0],
    [0, -1, golden],
    [0, 1, golden],
    [0, -1, -golden],
    [0, 1, -golden],
    [golden, 0, -1],
    [golden, 0, 1],
    [-golden, 0, -1],
    [-golden, 0, 1],
  ].map((point) => normalize(point as Vec3Tuple));

  const faces: Face[] = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];
  return { vertices, faces };
};

export const createIcosphere = (subdivisions: number): SphereTopology => {
  let { vertices, faces } = baseIcosahedron();

  for (let step = 0; step < subdivisions; step += 1) {
    const midpointCache = new Map<string, number>();
    const midpoint = (left: number, right: number) => {
      const key = left < right ? `${left}:${right}` : `${right}:${left}`;
      const cached = midpointCache.get(key);
      if (cached !== undefined) return cached;

      const vertex = normalize(scale(add(vertices[left], vertices[right]), 0.5));
      const index = vertices.length;
      vertices.push(vertex);
      midpointCache.set(key, index);
      return index;
    };

    const refined: Face[] = [];
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      refined.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = refined;
  }

  return { vertices, faces };
};

export const createGeodesicSphere = (frequency: number): SphereTopology => {
  const safeFrequency = Math.max(1, Math.round(frequency));
  const base = baseIcosahedron();
  const vertices: Vec3Tuple[] = [];
  const faces: Face[] = [];
  const vertexIndices = new Map<string, number>();

  const vertexIndex = (point: Vec3Tuple) => {
    const normalized = normalize(point);
    const key = normalized.map((value) => value.toFixed(9)).join(":");
    const existing = vertexIndices.get(key);
    if (existing !== undefined) return existing;
    const index = vertices.length;
    vertices.push(normalized);
    vertexIndices.set(key, index);
    return index;
  };

  for (const [aIndex, bIndex, cIndex] of base.faces) {
    const a = base.vertices[aIndex];
    const b = base.vertices[bIndex];
    const c = base.vertices[cIndex];
    const local = new Map<string, number>();
    const at = (barycentricB: number, barycentricC: number) => {
      const key = `${barycentricB}:${barycentricC}`;
      const existing = local.get(key);
      if (existing !== undefined) return existing;
      const barycentricA =
        safeFrequency - barycentricB - barycentricC;
      const point: Vec3Tuple = [
        (a[0] * barycentricA +
          b[0] * barycentricB +
          c[0] * barycentricC) /
          safeFrequency,
        (a[1] * barycentricA +
          b[1] * barycentricB +
          c[1] * barycentricC) /
          safeFrequency,
        (a[2] * barycentricA +
          b[2] * barycentricB +
          c[2] * barycentricC) /
          safeFrequency,
      ];
      const index = vertexIndex(point);
      local.set(key, index);
      return index;
    };

    for (let row = 0; row < safeFrequency; row += 1) {
      for (
        let column = 0;
        column < safeFrequency - row;
        column += 1
      ) {
        const lowerLeft = at(row, column);
        const lowerRight = at(row + 1, column);
        const upperLeft = at(row, column + 1);
        faces.push([lowerLeft, lowerRight, upperLeft]);
        if (row + column < safeFrequency - 1) {
          const upperRight = at(row + 1, column + 1);
          faces.push([lowerRight, upperRight, upperLeft]);
        }
      }
    }
  }

  return { vertices, faces };
};

export const uniqueEdges = (faces: Face[]): Array<[number, number]> => {
  const edges = new Map<string, [number, number]>();
  for (const [a, b, c] of faces) {
    for (const [left, right] of [
      [a, b],
      [b, c],
      [c, a],
    ] as Array<[number, number]>) {
      const edge: [number, number] =
        left < right ? [left, right] : [right, left];
      edges.set(`${edge[0]}:${edge[1]}`, edge);
    }
  }
  return [...edges.values()];
};

export const faceCenters = (topology: SphereTopology): Vec3Tuple[] =>
  topology.faces.map(([a, b, c]) =>
    normalize(add(add(topology.vertices[a], topology.vertices[b]), topology.vertices[c])),
  );

export const dualEdges = (
  topology: SphereTopology,
): { vertices: Vec3Tuple[]; edges: Array<[number, number]> } => {
  const centers = faceCenters(topology);
  const adjacentFaces = new Map<string, number[]>();

  topology.faces.forEach(([a, b, c], faceIndex) => {
    for (const [left, right] of [
      [a, b],
      [b, c],
      [c, a],
    ] as Array<[number, number]>) {
      const key = left < right ? `${left}:${right}` : `${right}:${left}`;
      const list = adjacentFaces.get(key) ?? [];
      list.push(faceIndex);
      adjacentFaces.set(key, list);
    }
  });

  const edges: Array<[number, number]> = [];
  for (const faces of adjacentFaces.values()) {
    if (faces.length === 2) edges.push([faces[0], faces[1]]);
  }

  return { vertices: centers, edges };
};

const tangentBasis = (normal: Vec3Tuple): [Vec3Tuple, Vec3Tuple] => {
  const helper: Vec3Tuple =
    Math.abs(normal[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  const tangent = normalize(cross(helper, normal));
  const bitangent = normalize(cross(normal, tangent));
  return [tangent, bitangent];
};

const sortAroundNormal = (
  points: Vec3Tuple[],
  normal: Vec3Tuple,
): Vec3Tuple[] => {
  const [tangent, bitangent] = tangentBasis(normal);
  return [...points].sort((a, b) => {
    const angleA = Math.atan2(dot(a, bitangent), dot(a, tangent));
    const angleB = Math.atan2(dot(b, bitangent), dot(b, tangent));
    return angleA - angleB;
  });
};

export interface PatternCell {
  normal: Vec3Tuple;
  boundary: Vec3Tuple[];
}

export const triangleCells = (topology: SphereTopology): PatternCell[] =>
  topology.faces.map(([a, b, c]) => ({
    normal: normalize(
      add(add(topology.vertices[a], topology.vertices[b]), topology.vertices[c]),
    ),
    boundary: [topology.vertices[a], topology.vertices[b], topology.vertices[c]],
  }));

export const dualCells = (topology: SphereTopology): PatternCell[] => {
  const centers = faceCenters(topology);
  const adjacent = topology.vertices.map(() => [] as number[]);
  topology.faces.forEach((face, faceIndex) => {
    face.forEach((vertexIndex) => adjacent[vertexIndex].push(faceIndex));
  });

  return topology.vertices.map((normal, vertexIndex) => ({
    normal,
    boundary: sortAroundNormal(
      adjacent[vertexIndex].map((faceIndex) => centers[faceIndex]),
      normal,
    ),
  }));
};

export const projectCellToTangentPlane = (
  cell: PatternCell,
  radius: number,
): Array<[number, number]> => {
  const [tangent, bitangent] = tangentBasis(cell.normal);
  return cell.boundary.map((point) => [
    dot(scale(point, radius), tangent),
    dot(scale(point, radius), bitangent),
  ]);
};

export const fibonacciPoints = (count: number): Vec3Tuple[] => {
  const points: Vec3Tuple[] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let index = 0; index < count; index += 1) {
    const y = 1 - ((index + 0.5) / Math.max(1, count)) * 2;
    const circleRadius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * index;
    points.push([
      Math.cos(theta) * circleRadius,
      y,
      Math.sin(theta) * circleRadius,
    ]);
  }
  return points;
};
