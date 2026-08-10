import { describe, expect, it } from "vitest";
import { generateBall } from "./generator";
import {
  DEFAULT_PARAMETERS,
  normalizeParameters,
  type BallParameters,
} from "./types";
import {
  BALL_TEMPLATES,
  parametersForTemplate,
} from "../projects/templates";

const dotBall = (effect: BallParameters["effect"]) => ({
  ...DEFAULT_PARAMETERS,
  mode: "solid" as const,
  pattern: "dots" as const,
  effect,
  quality: "standard" as const,
});

const maximumVertexRadius = (positions: Float32Array) => {
  let maximum = 0;
  for (let index = 0; index < positions.length; index += 3) {
    maximum = Math.max(
      maximum,
      Math.hypot(
        positions[index],
        positions[index + 1],
        positions[index + 2],
      ),
    );
  }
  return maximum;
};

describe("ball generator", () => {
  it("builds the default lattice as one connected component", async () => {
    const ball = await generateBall({
      ...DEFAULT_PARAMETERS,
      quality: "draft",
    });
    expect(
      ball.stats.components,
      JSON.stringify(ball.stats.componentVolumes),
    ).toBe(1);
  }, 30_000);

  it("uses cell count to control lattice topology", async () => {
    const largeCells = await generateBall({
      ...DEFAULT_PARAMETERS,
      cellFrequency: 2,
      quality: "draft",
    });
    const smallCells = await generateBall({
      ...DEFAULT_PARAMETERS,
      cellFrequency: 4,
      quality: "draft",
    });

    expect(largeCells.stats.components).toBe(1);
    expect(smallCells.stats.components).toBe(1);
    expect(smallCells.stats.triangles).toBeGreaterThan(
      largeCells.stats.triangles,
    );
  }, 30_000);

  it.each([
    ["hexagons", 2, 41],
    ["triangles", 2, 79],
  ] as const)(
    "builds %s perforations as one continuous shared-edge grid",
    async (pattern, cellFrequency, expectedGenus) => {
      const ball = await generateBall({
        ...DEFAULT_PARAMETERS,
        mode: "perforated",
        pattern,
        cellFrequency,
        diameter: 72,
        wallThickness: 1.8,
        featureWidth: 2,
        quality: "draft",
      });

      expect(ball.stats.watertight).toBe(true);
      expect(ball.stats.nonManifoldEdges).toBe(0);
      expect(ball.stats.components).toBe(1);
      expect(ball.stats.genus).toBe(expectedGenus);
    },
    30_000,
  );

  it.each(["raised", "grooved"] as const)(
    "keeps a %s dot ball closed and supplies smooth preview normals",
    async (effect) => {
      const ball = await generateBall(dotBall(effect));

      expect(ball.stats.watertight).toBe(true);
      expect(ball.stats.nonManifoldEdges).toBe(0);
      expect(
        ball.stats.components,
        JSON.stringify(ball.stats.componentVolumes),
      ).toBe(1);
      expect(ball.previewPositions.length).toBeGreaterThan(0);
      expect(ball.previewNormals.length).toBe(ball.previewPositions.length);
      expect(ball.previewIndices.length).toBeGreaterThan(0);
      expect(Array.from(ball.previewNormals).every(Number.isFinite)).toBe(true);

      const firstNormalLength = Math.hypot(
        ball.previewNormals[0],
        ball.previewNormals[1],
        ball.previewNormals[2],
      );
      expect(firstNormalLength).toBeCloseTo(1, 3);
    },
    20_000,
  );

  it.each([
    ["hexagons", "raised"],
    ["hexagons", "grooved"],
    ["triangles", "raised"],
    ["triangles", "grooved"],
  ] as const)(
    "builds a regular %s %s cell field as one printable body",
    async (pattern, effect) => {
      const ball = await generateBall({
        ...DEFAULT_PARAMETERS,
        mode: "solid",
        pattern,
        effect,
        density: 1,
        cellSize: 14,
        featureWidth: 1.8,
        featureHeight: 1.4,
        quality: "draft",
      });

      expect(ball.stats.watertight).toBe(true);
      expect(ball.stats.nonManifoldEdges).toBe(0);
      expect(ball.stats.components).toBe(1);
      expect(ball.stats.triangles).toBeGreaterThan(100);
    },
    30_000,
  );

  it("builds a rounded tennis detail band as closed geometry", async () => {
    const template = BALL_TEMPLATES.find(
      (candidate) => candidate.id === "tennis",
    )!;
    const ball = await generateBall({
      ...parametersForTemplate(template, "#7fa84f"),
      seamProfile: "rounded",
      quality: "draft",
    });

    expect(ball.stats.watertight).toBe(true);
    expect(ball.stats.nonManifoldEdges).toBe(0);
    expect(ball.stats.components).toBe(1);
  }, 30_000);

  it("changes the tennis seam when band curvature changes", async () => {
    const template = BALL_TEMPLATES.find(
      (candidate) => candidate.id === "tennis",
    )!;
    const base = {
      ...parametersForTemplate(template, "#7fa84f"),
      quality: "draft" as const,
    };
    const compact = await generateBall({
      ...base,
      seamCurvature: 20,
    });
    const full = await generateBall({
      ...base,
      seamCurvature: 80,
    });

    expect(compact.stats.watertight).toBe(true);
    expect(full.stats.watertight).toBe(true);
    expect(
      Math.abs(full.stats.volume - compact.stats.volume),
    ).toBeGreaterThan(1);
  }, 30_000);

  it("controls baseball stitch density and thickness", async () => {
    const template = BALL_TEMPLATES.find(
      (candidate) => candidate.id === "baseball",
    )!;
    const parameters = {
      ...parametersForTemplate(template, "#7fa84f"),
      quality: "draft" as const,
    };
    const sparse = await generateBall({
      ...parameters,
      baseballStitchDensity: 24,
      baseballStitchThickness: 0.5,
    });
    const dense = await generateBall({
      ...parameters,
      baseballStitchDensity: 72,
      baseballStitchThickness: 1.2,
    });

    expect(sparse.stats.watertight).toBe(true);
    expect(dense.stats.watertight).toBe(true);
    expect(dense.stats.nonManifoldEdges).toBe(0);
    expect(dense.stats.components).toBe(1);
    expect(dense.stats.triangles).toBeGreaterThan(sparse.stats.triangles);
    expect(
      Math.abs(dense.stats.volume - sparse.stats.volume),
    ).toBeGreaterThan(10);
  }, 30_000);

  it("changes polygon relief geometry when cell count changes", async () => {
    const base = {
      ...DEFAULT_PARAMETERS,
      mode: "solid" as const,
      pattern: "hexagons" as const,
      effect: "raised" as const,
      density: 1,
      featureWidth: 1.4,
      featureHeight: 1.5,
      quality: "draft" as const,
    };
    const sparse = await generateBall({ ...base, cellFrequency: 2 });
    const dense = await generateBall({ ...base, cellFrequency: 4 });

    expect(dense.stats.triangles).not.toBe(sparse.stats.triangles);
    expect(Math.abs(dense.stats.volume - sparse.stats.volume)).toBeGreaterThan(
      100,
    );
  }, 30_000);

  it.each([
    "tennis",
    "football",
    "basketball",
    "volleyball",
    "baseball",
  ] as const)(
    "builds a closed %s seam template",
    async (templateId) => {
      const template = BALL_TEMPLATES.find(
        (candidate) => candidate.id === templateId,
      );
      expect(template).toBeDefined();
      const parameters = {
        ...parametersForTemplate(template!, "#7fa84f"),
        quality: "draft",
      } as const;
      const ball = await generateBall(parameters);

      expect(ball.stats.watertight).toBe(true);
      expect(ball.stats.nonManifoldEdges).toBe(0);
      expect(
        ball.stats.components,
        JSON.stringify(ball.stats.componentVolumes),
      ).toBe(1);
      expect(ball.stats.triangles).toBeGreaterThan(100);
      expect(Math.max(...ball.stats.dimensions)).toBeCloseTo(
        parameters.diameter,
        1,
      );
      expect(Math.min(...ball.stats.dimensions)).toBeGreaterThan(
        parameters.diameter * 0.97,
      );
      if (templateId === "football") {
        expect(ball.stats.genus).toBe(31);
      }
    },
    30_000,
  );

  it.each(["ping-pong", "golf"] as const)(
    "builds the dense circular perforations for %s",
    async (templateId) => {
      const template = BALL_TEMPLATES.find(
        (candidate) => candidate.id === templateId,
      );
      expect(template).toBeDefined();
      const ball = await generateBall({
        ...parametersForTemplate(template!, "#7fa84f"),
        quality: "draft",
      });

      expect(ball.stats.watertight).toBe(true);
      expect(ball.stats.nonManifoldEdges).toBe(0);
      expect(ball.stats.components).toBe(1);
      expect(ball.stats.genus).toBeGreaterThan(20);
    },
    30_000,
  );

  it.each(["massage", "pet-toy"] as const)(
    "keeps the %s preset solid and printable",
    async (templateId) => {
      const template = BALL_TEMPLATES.find(
        (candidate) => candidate.id === templateId,
      );
      expect(template).toBeDefined();
      const parameters = {
        ...parametersForTemplate(template!, "#7fa84f"),
        quality: "draft" as const,
      };
      const ball = await generateBall(parameters);

      expect(parameters.mode).toBe("solid");
      expect(ball.stats.watertight).toBe(true);
      expect(ball.stats.components).toBe(1);
      expect(Math.max(...ball.stats.dimensions)).toBeCloseTo(
        parameters.diameter,
        1,
      );
    },
    30_000,
  );

  it("embeds text as closed engraved geometry", async () => {
    const ball = await generateBall({
      ...DEFAULT_PARAMETERS,
      mode: "perforated",
      pattern: "hexagons",
      cellFrequency: 2,
      featureWidth: 1.8,
      markingType: "text",
      markingText: "AIR",
      markingOperation: "engraved",
      quality: "draft",
    });

    expect(ball.stats.watertight).toBe(true);
    expect(ball.stats.nonManifoldEdges).toBe(0);
    expect(
      ball.stats.components,
      JSON.stringify(ball.stats.componentVolumes),
    ).toBe(1);
  }, 30_000);

  it("embeds a rasterized logo mask as closed raised geometry", async () => {
    const ball = await generateBall({
      ...DEFAULT_PARAMETERS,
      mode: "solid",
      pattern: "none",
      markingType: "logo",
      markingLogoMask: [
        "0011100",
        "0110110",
        "1100011",
        "1100011",
        "0110110",
        "0011100",
      ].join("/"),
      markingOperation: "raised",
      quality: "draft",
    });

    expect(ball.stats.watertight).toBe(true);
    expect(ball.stats.nonManifoldEdges).toBe(0);
    expect(ball.stats.components).toBe(1);
  }, 30_000);

  it("connects an engraved branding badge to an airless lattice", async () => {
    const ball = await generateBall({
      ...DEFAULT_PARAMETERS,
      mode: "lattice",
      pattern: "hexagons",
      markingType: "text",
      markingText: "AIR",
      markingOperation: "engraved",
      quality: "draft",
    });

    expect(ball.stats.watertight).toBe(true);
    expect(ball.stats.nonManifoldEdges).toBe(0);
    expect(ball.stats.components).toBe(1);
    expect(ball.stats.triangles).toBeGreaterThan(100);
  }, 30_000);

  it.each(["text", "logo"] as const)(
    "embeds a %s marking directly into a tennis detail band",
    async (markingType) => {
      const template = BALL_TEMPLATES.find(
        (candidate) => candidate.id === "tennis",
      )!;
      const ball = await generateBall({
        ...parametersForTemplate(template, "#7fa84f"),
        markingType,
        markingText: "AIR",
        markingLogoMask: [
          "0011100",
          "0110110",
          "1100011",
          "1100011",
          "0110110",
          "0011100",
        ].join("/"),
        markingOperation: markingType === "text" ? "engraved" : "raised",
        quality: "draft",
      });

      expect(ball.stats.watertight).toBe(true);
      expect(ball.stats.nonManifoldEdges).toBe(0);
      expect(ball.stats.components).toBe(1);
    },
    30_000,
  );

  it("wraps a basketball marking onto a clear section of a detail band", async () => {
    const template = BALL_TEMPLATES.find(
      (candidate) => candidate.id === "basketball",
    )!;
    const base = {
      ...parametersForTemplate(template, "#7fa84f"),
      cellFrequency: 2,
      quality: "draft" as const,
    };
    const plain = await generateBall({
      ...base,
      markingType: "none",
    });
    const marked = await generateBall({
      ...base,
      markingType: "text",
      markingText: "AIR",
      markingOperation: "raised",
    });

    expect(marked.stats.watertight).toBe(true);
    expect(marked.stats.nonManifoldEdges).toBe(0);
    expect(marked.stats.components).toBe(1);
    expect(marked.stats.volume).toBeGreaterThan(plain.stats.volume + 0.2);
  }, 30_000);

  it("uses basketball curvature to bow the upper and lower channels", async () => {
    const template = BALL_TEMPLATES.find(
      (candidate) => candidate.id === "basketball",
    )!;
    const base = {
      ...parametersForTemplate(template, "#7fa84f"),
      cellFrequency: 2,
      quality: "draft" as const,
    };
    const shallow = await generateBall({
      ...base,
      seamCurvature: 0,
    });
    const deep = await generateBall({
      ...base,
      seamCurvature: 100,
    });

    expect(shallow.stats.watertight).toBe(true);
    expect(deep.stats.watertight).toBe(true);
    expect(Math.abs(deep.stats.volume - shallow.stats.volume)).toBeGreaterThan(
      1,
    );
  }, 30_000);

  it("builds multiple independently curved custom bands as one body", async () => {
    const base = {
      ...DEFAULT_PARAMETERS,
      mode: "lattice" as const,
      pattern: "hexagons" as const,
      seamPattern: "custom" as const,
      seamOperation: "raised" as const,
      seamWidth: 2.6,
      seamDepth: 0.6,
      diameter: 64,
      cellFrequency: 2,
      quality: "draft" as const,
    };
    const straight = await generateBall({
      ...base,
      customBands: [
        {
          id: "horizontal",
          rotation: 0,
          tilt: 0,
          curveAngle: 0,
          curvature: 0,
        },
      ],
    });
    const curved = await generateBall({
      ...base,
      customBands: [
        {
          id: "horizontal",
          rotation: 0,
          tilt: 0,
          curveAngle: 0,
          curvature: 70,
        },
        {
          id: "diagonal",
          rotation: 48,
          tilt: 32,
          curveAngle: -35,
          curvature: 42,
        },
      ],
      markings: [
        {
          id: "custom-band-label",
          type: "text",
          operation: "raised",
          text: "A",
          logoMask: "",
          logoName: "",
          size: 10,
          height: 0.8,
          bandIndex: 1,
          position: 62,
        },
      ],
    });

    expect(straight.stats.watertight).toBe(true);
    expect(curved.stats.watertight).toBe(true);
    expect(curved.stats.nonManifoldEdges).toBe(0);
    expect(curved.stats.components).toBe(1);
    expect(curved.stats.volume).toBeGreaterThan(straight.stats.volume + 20);
  }, 30_000);

  it("normalizes saved custom band controls into safe ranges", () => {
    const parameters = normalizeParameters({
      seamPattern: "custom",
      customBands: [
        {
          id: "saved",
          rotation: 260,
          tilt: -130,
          curveAngle: 240,
          curvature: 140,
        },
      ],
    });

    expect(parameters.customBands).toEqual([
      {
        id: "saved",
        rotation: 180,
        tilt: -90,
        curveAngle: 180,
        curvature: 100,
      },
    ]);
  });

  it("places multiple text and logo markings on separate basketball bands", async () => {
    const template = BALL_TEMPLATES.find(
      (candidate) => candidate.id === "basketball",
    )!;
    const base = {
      ...parametersForTemplate(template, "#7fa84f"),
      cellFrequency: 2,
      quality: "draft" as const,
      markingType: "none" as const,
    };
    const first = {
      id: "first",
      type: "text" as const,
      operation: "raised" as const,
      text: "AIR",
      logoMask: "",
      logoName: "",
      size: 18,
      height: 1.2,
      bandIndex: 0,
      position: 50,
    };
    const single = await generateBall({
      ...base,
      markings: [first],
    });
    const multiple = await generateBall({
      ...base,
      markings: [
        first,
        {
          ...first,
          id: "second",
          text: "LAB",
          bandIndex: 2,
          position: 72,
        },
        {
          ...first,
          id: "logo",
          type: "logo",
          text: "",
          logoMask: [
            "01110",
            "11011",
            "10001",
            "11011",
            "01110",
          ].join("/"),
          logoName: "mark.png",
          bandIndex: 1,
          position: 28,
        },
      ],
    });

    expect(multiple.stats.watertight).toBe(true);
    expect(multiple.stats.nonManifoldEdges).toBe(0);
    expect(multiple.stats.components).toBe(1);
    expect(multiple.stats.volume).toBeGreaterThan(single.stats.volume + 0.5);
  }, 30_000);

  it("builds the rugby template as a closed elongated airless body", async () => {
    const template = BALL_TEMPLATES.find(
      (candidate) => candidate.id === "rugby",
    )!;
    const parameters = {
      ...parametersForTemplate(template, "#7fa84f"),
      cellFrequency: 2,
      quality: "draft" as const,
    };
    const ball = await generateBall(parameters);
    const dimensions = [...ball.stats.dimensions].sort(
      (left, right) => right - left,
    );

    expect(ball.stats.watertight).toBe(true);
    expect(ball.stats.nonManifoldEdges).toBe(0);
    expect(ball.stats.components).toBe(1);
    expect(dimensions[0]).toBeCloseTo(parameters.diameter, 1);
    expect(dimensions[0] / dimensions[1]).toBeCloseTo(
      parameters.rugbyAspectRatio,
      1,
    );
  }, 30_000);

  it.each(["circle", "square", "octagon"] as const)(
    "builds a fitted %s ball stand as one printable body",
    async (standBaseShape) => {
      const template = BALL_TEMPLATES.find(
        (candidate) => candidate.id === "stand",
      )!;
      const parameters = {
        ...parametersForTemplate(template, "#7fa84f"),
        standBaseShape,
        standText: "AIRLAB",
        standTextVectorData: JSON.stringify([
          [
            [-1, -0.35],
            [1, -0.35],
            [1, 0.35],
            [-1, 0.35],
          ],
        ]),
        standTextOperation: "raised" as const,
        quality: "draft" as const,
      };
      const stand = await generateBall(parameters);

      expect(stand.stats.watertight).toBe(true);
      expect(stand.stats.nonManifoldEdges).toBe(0);
      expect(stand.stats.components).toBe(1);
      expect(stand.exportUpAxis).toBe("y");
      expect(stand.stats.dimensions[1]).toBeCloseTo(parameters.standHeight, 0);
      expect(stand.stats.dimensions[0]).toBeGreaterThan(
        parameters.standBaseSize - 1,
      );
      expect(stand.triangleMaterials).toContain(2);
    },
    30_000,
  );

  it("uses ball diameter and socket depth for the stand recess", async () => {
    const template = BALL_TEMPLATES.find(
      (candidate) => candidate.id === "stand",
    )!;
    const parameters = {
      ...parametersForTemplate(template, "#7fa84f"),
      standText: "",
      standBallDiameter: 100,
      standBaseSize: 110,
      standHeight: 28,
      quality: "draft" as const,
    };
    const shallow = await generateBall({
      ...parameters,
      standSocketDepth: 4,
    });
    const deep = await generateBall({
      ...parameters,
      standSocketDepth: 14,
    });

    expect(shallow.stats.components).toBe(1);
    expect(deep.stats.components).toBe(1);
    expect(deep.stats.volume).toBeLessThan(shallow.stats.volume - 500);
  }, 30_000);

  it("adds a connected printable keychain loop without shrinking the ball", async () => {
    const diameter = 40;
    const ball = await generateBall({
      ...DEFAULT_PARAMETERS,
      mode: "solid",
      pattern: "none",
      diameter,
      keychainEnabled: true,
      keychainOuterDiameter: 10,
      keychainHoleDiameter: 5,
      quality: "draft",
    });

    expect(ball.stats.watertight).toBe(true);
    expect(ball.stats.components).toBe(1);
    expect(Math.max(...ball.stats.dimensions)).toBeGreaterThan(diameter + 4);
  }, 30_000);

  it("controls keychain embedding, profile roundness, and rotation without a center rod", async () => {
    const parameters = {
      ...DEFAULT_PARAMETERS,
      mode: "solid" as const,
      pattern: "none" as const,
      diameter: 40,
      keychainEnabled: true,
      keychainOuterDiameter: 10,
      keychainHoleDiameter: 5,
      quality: "draft" as const,
    };
    const square = await generateBall({
      ...parameters,
      keychainRoundness: 0,
      keychainRotation: 0,
      keychainSurfaceOffset: 0,
    });
    const rounded = await generateBall({
      ...parameters,
      keychainRoundness: 100,
      keychainRotation: 0,
      keychainSurfaceOffset: 0,
    });
    const sunkAndRotated = await generateBall({
      ...parameters,
      keychainRoundness: 100,
      keychainRotation: 90,
      keychainSurfaceOffset: -2,
    });

    [square, rounded, sunkAndRotated].forEach((ball) => {import { describe, expect, it } from "vitest";
import { generateBall } from "./generator";
import {
  DEFAULT_PARAMETERS,
  normalizeParameters,
  type BallParameters,
} from "./types";
import {
  BALL_TEMPLATES,
  parametersForTemplate,
} from "../projects/templates";

const dotBall = (effect: BallParameters["effect"]) => ({
  ...DEFAULT_PARAMETERS,
  mode: "solid" as const,
  pattern: "dots" as const,
  effect,
  quality: "standard" as const,
});

const maximumVertexRadius = (positions: Float32Array) => {
  let maximum = 0;
  for (let index = 0; index < positions.length; index += 3) {
    maximum = Math.max(
      maximum,
      Math.hypot(
        positions[index],
        positions[index + 1],
        positions[index + 2],
      ),
    );
  }
  return maximum;
};

describe("ball generator", () => {
  it("builds the default lattice as one connected component", async () => {
    const ball = await generateBall({
      ...DEFAULT_PARAMETERS,
      quality: "draft",
    });
    expect(
      ball.stats.components,
      JSON.stringify(ball.stats.componentVolumes),
    ).toBe(1);
  }, 30_000);

  it("uses cell count to control lattice topology", async () => {
    const largeCells = await generateBall({
      ...DEFAULT_PARAMETERS,
      cellFrequency: 2,
      quality: "draft",
    });
    const smallCells = await generateBall({
      ...DEFAULT_PARAMETERS,
      cellFrequency: 4,
      quality: "draft",
    });

    expect(largeCells.stats.components).toBe(1);
    expect(smallCells.stats.components).toBe(1);
    expect(smallCells.stats.triangles).toBeGreaterThan(
      largeCells.stats.triangles,
    );
  }, 30_000);

  it.each([
    ["hexagons", 2, 41],
    ["triangles", 2, 79],
  ] as const)(
    "builds %s perforations as one continuous shared-edge grid",
    async (pattern, cellFrequency, expectedGenus) => {
      const ball = await generateBall({
        ...DEFAULT_PARAMETERS,
        mode: "perforated",
        pattern,
        cellFrequency,
        diameter: 72,
        wallThickness: 1.8,
        featureWidth: 2,
        quality: "draft",
      });

      expect(ball.stats.watertight).toBe(true);
      expect(ball.stats.nonManifoldEdges).toBe(0);
      expect(ball.stats.components).toBe(1);
      expect(ball.stats.genus).toBe(expectedGenus);
    },
    30_000,
  );

  it.each(["raised", "grooved"] as const)(
    "keeps a %s dot ball closed and supplies smooth preview normals",
    async (effect) => {
      const ball = await generateBall(dotBall(effect));

      expect(ball.stats.watertight).toBe(true);
      expect(ball.stats.nonManifoldEdges).toBe(0);
      expect(
        ball.stats.components,
        JSON.stringify(ball.stats.componentVolumes),
      ).toBe(1);
      expect(ball.previewPositions.length).toBeGreaterThan(0);
      expect(ball.previewNormals.length).toBe(ball.previewPositions.length);
      expect(ball.previewIndices.length).toBeGreaterThan(0);
      expect(Array.from(ball.previewNormals).every(Number.isFinite)).toBe(true);

      const firstNormalLength = Math.hypot(
        ball.previewNormals[0],
        ball.previewNormals[1],
        ball.previewNormals[2],
      );
      expect(firstNormalLength).toBeCloseTo(1, 3);
    },
    20_000,
  );

  it.each([
    ["hexagons", "raised"],
    ["hexagons", "grooved"],
    ["triangles", "raised"],
    ["triangles", "grooved"],
  ] as const)(
    "builds a regular %s %s cell field as one printable body",
    async (pattern, effect) => {
      const ball = await generateBall({
        ...DEFAULT_PARAMETERS,
        mode: "solid",
        pattern,
        effect,
        density: 1,
        cellSize: 14,
        featureWidth: 1.8,
        featureHeight: 1.4,
        quality: "draft",
      });

      expect(ball.stats.watertight).toBe(true);
      expect(ball.stats.nonManifoldEdges).toBe(0);
      expect(ball.stats.components).toBe(1);
      expect(ball.stats.triangles).toBeGreaterThan(100);
    },
    30_000,
  );

  it("builds a rounded tennis detail band as closed geometry", async () => {
    const template = BALL_TEMPLATES.find(
      (candidate) => candidate.id === "tennis",
    )!;
    const ball = await generateBall({
      ...parametersForTemplate(template, "#7fa84f"),
      seamProfile: "rounded",
      quality: "draft",
    });

    expect(ball.stats.watertight).toBe(true);
    expect(ball.stats.nonManifoldEdges).toBe(0);
    expect(ball.stats.components).toBe(1);
  }, 30_000);

  it("changes the tennis seam when band curvature changes", async () => {
    const template = BALL_TEMPLATES.find(
      (candidate) => candidate.id === "tennis",
    )!;
    const base = {
      ...parametersForTemplate(template, "#7fa84f"),
      quality: "draft" as const,
    };
    const compact = await generateBall({
      ...base,
      seamCurvature: 20,
    });
    const full = await generateBall({
      ...base,
      seamCurvature: 80,
    });

    expect(compact.stats.watertight).toBe(true);
    expect(full.stats.watertight).toBe(true);
    expect(
      Math.abs(full.stats.volume - compact.stats.volume),
    ).toBeGreaterThan(1);
  }, 30_000);

  it("controls baseball stitch density and thickness", async () => {
    const template = BALL_TEMPLATES.find(
      (candidate) => candidate.id === "baseball",
    )!;
    const parameters = {
      ...parametersForTemplate(template, "#7fa84f"),
      quality: "draft" as const,
    };
    const sparse = await generateBall({
      ...parameters,
      baseballStitchDensity: 24,
      baseballStitchThickness: 0.5,
    });
    const dense = await generateBall({
      ...parameters,
      baseballStitchDensity: 72,
      baseballStitchThickness: 1.2,
    });

    expect(sparse.stats.watertight).toBe(true);
    expect(dense.stats.watertight).toBe(true);
    expect(dense.stats.nonManifoldEdges).toBe(0);
    expect(dense.stats.components).toBe(1);
    expect(dense.stats.triangles).toBeGreaterThan(sparse.stats.triangles);
    expect(
      Math.abs(dense.stats.volume - sparse.stats.volume),
    ).toBeGreaterThan(10);
  }, 30_000);

  it("changes polygon relief geometry when cell count changes", async () => {
    const base = {
      ...DEFAULT_PARAMETERS,
      mode: "solid" as const,
      pattern: "hexagons" as const,
      effect: "raised" as const,
      density: 1,
      featureWidth: 1.4,
      featureHeight: 1.5,
      quality: "draft" as const,
    };
    const sparse = await generateBall({ ...base, cellFrequency: 2 });
    const dense = await generateBall({ ...base, cellFrequency: 4 });

    expect(dense.stats.triangles).not.toBe(sparse.stats.triangles);
    expect(Math.abs(dense.stats.volume - sparse.stats.volume)).toBeGreaterThan(
      100,
    );
  }, 30_000);

  it.each([
    "tennis",
    "football",
    "basketball",
    "volleyball",
    "baseball",
  ] as const)(
    "builds a closed %s seam template",
    async (templateId) => {
      const template = BALL_TEMPLATES.find(
        (candidate) => candidate.id === templateId,
      );
      expect(template).toBeDefined();
      const parameters = {
        ...parametersForTemplate(template!, "#7fa84f"),
        quality: "draft",
      } as const;
      const ball = await generateBall(parameters);

      expect(ball.stats.watertight).toBe(true);
      expect(ball.stats.nonManifoldEdges).toBe(0);
      expect(
        ball.stats.components,
        JSON.stringify(ball.stats.componentVolumes),
      ).toBe(1);
      expect(ball.stats.triangles).toBeGreaterThan(100);
      expect(Math.max(...ball.stats.dimensions)).toBeCloseTo(
        parameters.diameter,
        1,
      );
      expect(Math.min(...ball.stats.dimensions)).toBeGreaterThan(
        parameters.diameter * 0.97,
      );
      if (templateId === "football") {
        expect(ball.stats.genus).toBe(31);
      }
    },
    120_000,
  );

  it.each(["ping-pong", "golf"] as const)(
    "builds the dense circular perforations for %s",
    async (templateId) => {
      const template = BALL_TEMPLATES.find(
        (candidate) => candidate.id === templateId,
      );
      expect(template).toBeDefined();
      const ball = await generateBall({
        ...parametersForTemplate(template!, "#7fa84f"),
        quality: "draft",
      });

      expect(ball.stats.watertight).toBe(true);
      expect(ball.stats.nonManifoldEdges).toBe(0);
      expect(ball.stats.components).toBe(1);
      expect(ball.stats.genus).toBeGreaterThan(20);
    },
    30_000,
  );

  it.each(["massage", "pet-toy"] as const)(
    "keeps the %s preset solid and printable",
    async (templateId) => {
      const template = BALL_TEMPLATES.find(
        (candidate) => candidate.id === templateId,
      );
      expect(template).toBeDefined();
      const parameters = {
        ...parametersForTemplate(template!, "#7fa84f"),
        quality: "draft" as const,
      };
      const ball = await generateBall(parameters);

      expect(parameters.mode).toBe("solid");
      expect(ball.stats.watertight).toBe(true);
      expect(ball.stats.components).toBe(1);
      expect(Math.max(...ball.stats.dimensions)).toBeCloseTo(
        parameters.diameter,
        1,
      );
    },
    30_000,
  );

  it("embeds text as closed engraved geometry", async () => {
    const ball = await generateBall({
      ...DEFAULT_PARAMETERS,
      mode: "perforated",
      pattern: "hexagons",
      cellFrequency: 2,
      featureWidth: 1.8,
      markingType: "text",
      markingText: "AIR",
      markingOperation: "engraved",
      quality: "draft",
    });

    expect(ball.stats.watertight).toBe(true);
    expect(ball.stats.nonManifoldEdges).toBe(0);
    expect(
      ball.stats.components,
      JSON.stringify(ball.stats.componentVolumes),
    ).toBe(1);
  }, 30_000);

  it("embeds a rasterized logo mask as closed raised geometry", async () => {
    const ball = await generateBall({
      ...DEFAULT_PARAMETERS,
      mode: "solid",
      pattern: "none",
      markingType: "logo",
      markingLogoMask: [
        "0011100",
        "0110110",
        "1100011",
        "1100011",
        "0110110",
        "0011100",
      ].join("/"),
      markingOperation: "raised",
      quality: "draft",
    });

    expect(ball.stats.watertight).toBe(true);
    expect(ball.stats.nonManifoldEdges).toBe(0);
    expect(ball.stats.components).toBe(1);
  }, 30_000);

  it("connects an engraved branding badge to an airless lattice", async () => {
    const ball = await generateBall({
      ...DEFAULT_PARAMETERS,
      mode: "lattice",
      pattern: "hexagons",
      markingType: "text",
      markingText: "AIR",
      markingOperation: "engraved",
      quality: "draft",
    });

    expect(ball.stats.watertight).toBe(true);
    expect(ball.stats.nonManifoldEdges).toBe(0);
    expect(ball.stats.components).toBe(1);
    expect(ball.stats.triangles).toBeGreaterThan(100);
  }, 30_000);

  it.each(["text", "logo"] as const)(
    "embeds a %s marking directly into a tennis detail band",
    async (markingType) => {
      const template = BALL_TEMPLATES.find(
        (candidate) => candidate.id === "tennis",
      )!;
      const ball = await generateBall({
        ...parametersForTemplate(template, "#7fa84f"),
        markingType,
        markingText: "AIR",
        markingLogoMask: [
          "0011100",
          "0110110",
          "1100011",
          "1100011",
          "0110110",
          "0011100",
        ].join("/"),
        markingOperation: markingType === "text" ? "engraved" : "raised",
        quality: "draft",
      });

      expect(ball.stats.watertight).toBe(true);
      expect(ball.stats.nonManifoldEdges).toBe(0);
      expect(ball.stats.components).toBe(1);
    },
    30_000,
  );

  it("wraps a basketball marking onto a clear section of a detail band", async () => {
    const template = BALL_TEMPLATES.find(
      (candidate) => candidate.id === "basketball",
    )!;
    const base = {
      ...parametersForTemplate(template, "#7fa84f"),
      cellFrequency: 2,
      quality: "draft" as const,
    };
    const plain = await generateBall({
      ...base,
      markingType: "none",
    });
    const marked = await generateBall({
      ...base,
      markingType: "text",
      markingText: "AIR",
      markingOperation: "raised",
    });

    expect(marked.stats.watertight).toBe(true);
    expect(marked.stats.nonManifoldEdges).toBe(0);
    expect(marked.stats.components).toBe(1);
    expect(marked.stats.volume).toBeGreaterThan(plain.stats.volume + 0.2);
  }, 30_000);

  it("uses basketball curvature to bow the upper and lower channels", async () => {
    const template = BALL_TEMPLATES.find(
      (candidate) => candidate.id === "basketball",
    )!;
    const base = {
      ...parametersForTemplate(template, "#7fa84f"),
      cellFrequency: 2,
      quality: "draft" as const,
    };
    const shallow = await generateBall({
      ...base,
      seamCurvature: 0,
    });
    const deep = await generateBall({
      ...base,
      seamCurvature: 100,
    });

    expect(shallow.stats.watertight).toBe(true);
    expect(deep.stats.watertight).toBe(true);
    expect(Math.abs(deep.stats.volume - shallow.stats.volume)).toBeGreaterThan(
      1,
    );
  }, 30_000);

  it("builds multiple independently curved custom bands as one body", async () => {
    const base = {
      ...DEFAULT_PARAMETERS,
      mode: "lattice" as const,
      pattern: "hexagons" as const,
      seamPattern: "custom" as const,
      seamOperation: "raised" as const,
      seamWidth: 2.6,
      seamDepth: 0.6,
      diameter: 64,
      cellFrequency: 2,
      quality: "draft" as const,
    };
    const straight = await generateBall({
      ...base,
      customBands: [
        {
          id: "horizontal",
          rotation: 0,
          tilt: 0,
          curveAngle: 0,
          curvature: 0,
        },
      ],
    });
    const curved = await generateBall({
      ...base,
      customBands: [
        {
          id: "horizontal",
          rotation: 0,
          tilt: 0,
          curveAngle: 0,
          curvature: 70,
        },
        {
          id: "diagonal",
          rotation: 48,
          tilt: 32,
          curveAngle: -35,
          curvature: 42,
        },
      ],
      markings: [
        {
          id: "custom-band-label",
          type: "text",
          operation: "raised",
          text: "A",
          logoMask: "",
          logoName: "",
          size: 10,
          height: 0.8,
          bandIndex: 1,
          position: 62,
        },
      ],
    });

    expect(straight.stats.watertight).toBe(true);
    expect(curved.stats.watertight).toBe(true);
    expect(curved.stats.nonManifoldEdges).toBe(0);
    expect(curved.stats.components).toBe(1);
    expect(curved.stats.volume).toBeGreaterThan(straight.stats.volume + 20);
  }, 30_000);

  it("normalizes saved custom band controls into safe ranges", () => {
    const parameters = normalizeParameters({
      seamPattern: "custom",
      customBands: [
        {
          id: "saved",
          rotation: 260,
          tilt: -130,
          curveAngle: 240,
          curvature: 140,
        },
      ],
    });

    expect(parameters.customBands).toEqual([
      {
        id: "saved",
        rotation: 180,
        tilt: -90,
        curveAngle: 180,
        curvature: 100,
      },
    ]);
  });

  it("places multiple text and logo markings on separate basketball bands", async () => {
    const template = BALL_TEMPLATES.find(
      (candidate) => candidate.id === "basketball",
    )!;
    const base = {
      ...parametersForTemplate(template, "#7fa84f"),
      cellFrequency: 2,
      quality: "draft" as const,
      markingType: "none" as const,
    };
    const first = {
      id: "first",
      type: "text" as const,
      operation: "raised" as const,
      text: "AIR",
      logoMask: "",
      logoName: "",
      size: 18,
      height: 1.2,
      bandIndex: 0,
      position: 50,
    };
    const single = await generateBall({
      ...base,
      markings: [first],
    });
    const multiple = await generateBall({
      ...base,
      markings: [
        first,
        {
          ...first,
          id: "second",
          text: "LAB",
          bandIndex: 2,
          position: 72,
        },
        {
          ...first,
          id: "logo",
          type: "logo",
          text: "",
          logoMask: [
            "01110",
            "11011",
            "10001",
            "11011",
            "01110",
          ].join("/"),
          logoName: "mark.png",
          bandIndex: 1,
          position: 28,
        },
      ],
    });

    expect(multiple.stats.watertight).toBe(true);
    expect(multiple.stats.nonManifoldEdges).toBe(0);
    expect(multiple.stats.components).toBe(1);
    expect(multiple.stats.volume).toBeGreaterThan(single.stats.volume + 0.5);
  }, 30_000);

  it("builds the rugby template as a closed elongated airless body", async () => {
    const template = BALL_TEMPLATES.find(
      (candidate) => candidate.id === "rugby",
    )!;
    const parameters = {
      ...parametersForTemplate(template, "#7fa84f"),
      cellFrequency: 2,
      quality: "draft" as const,
    };
    const ball = await generateBall(parameters);
    const dimensions = [...ball.stats.dimensions].sort(
      (left, right) => right - left,
    );

    expect(ball.stats.watertight).toBe(true);
    expect(ball.stats.nonManifoldEdges).toBe(0);
    expect(ball.stats.components).toBe(1);
    expect(dimensions[0]).toBeCloseTo(parameters.diameter, 1);
    expect(dimensions[0] / dimensions[1]).toBeCloseTo(
      parameters.rugbyAspectRatio,
      1,
    );
  }, 30_000);

  it.each(["circle", "square", "octagon"] as const)(
    "builds a fitted %s ball stand as one printable body",
    async (standBaseShape) => {
      const template = BALL_TEMPLATES.find(
        (candidate) => candidate.id === "stand",
      )!;
      const parameters = {
        ...parametersForTemplate(template, "#7fa84f"),
        standBaseShape,
        standText: "AIRLAB",
        standTextVectorData: JSON.stringify([
          [
            [-1, -0.35],
            [1, -0.35],
            [1, 0.35],
            [-1, 0.35],
          ],
        ]),
        standTextOperation: "raised" as const,
        quality: "draft" as const,
      };
      const stand = await generateBall(parameters);

      expect(stand.stats.watertight).toBe(true);
      expect(stand.stats.nonManifoldEdges).toBe(0);
      expect(stand.stats.components).toBe(1);
      expect(stand.exportUpAxis).toBe("y");
      expect(stand.stats.dimensions[1]).toBeCloseTo(parameters.standHeight, 0);
      expect(stand.stats.dimensions[0]).toBeGreaterThan(
        parameters.standBaseSize - 1,
      );
      expect(stand.triangleMaterials).toContain(2);
    },
    30_000,
  );

  it("uses ball diameter and socket depth for the stand recess", async () => {
    const template = BALL_TEMPLATES.find(
      (candidate) => candidate.id === "stand",
    )!;
    const parameters = {
      ...parametersForTemplate(template, "#7fa84f"),
      standText: "",
      standBallDiameter: 100,
      standBaseSize: 110,
      standHeight: 28,
      quality: "draft" as const,
    };
    const shallow = await generateBall({
      ...parameters,
      standSocketDepth: 4,
    });
    const deep = await generateBall({
      ...parameters,
      standSocketDepth: 14,
    });

    expect(shallow.stats.components).toBe(1);
    expect(deep.stats.components).toBe(1);
    expect(deep.stats.volume).toBeLessThan(shallow.stats.volume - 500);
  }, 30_000);

  it("adds a connected printable keychain loop without shrinking the ball", async () => {
    const diameter = 40;
    const ball = await generateBall({
      ...DEFAULT_PARAMETERS,
      mode: "solid",
      pattern: "none",
      diameter,
      keychainEnabled: true,
      keychainOuterDiameter: 10,
      keychainHoleDiameter: 5,
      quality: "draft",
    });

    expect(ball.stats.watertight).toBe(true);
    expect(ball.stats.components).toBe(1);
    expect(Math.max(...ball.stats.dimensions)).toBeGreaterThan(diameter + 4);
  }, 30_000);

  it("controls keychain embedding, profile roundness, and rotation without a center rod", async () => {
    const parameters = {
      ...DEFAULT_PARAMETERS,
      mode: "solid" as const,
      pattern: "none" as const,
      diameter: 40,
      keychainEnabled: true,
      keychainOuterDiameter: 10,
      keychainHoleDiameter: 5,
      quality: "draft" as const,
    };
    const square = await generateBall({
      ...parameters,
      keychainRoundness: 0,
      keychainRotation: 0,
      keychainSurfaceOffset: 0,
    });
    const rounded = await generateBall({
      ...parameters,
      keychainRoundness: 100,
      keychainRotation: 0,
      keychainSurfaceOffset: 0,
    });
    const sunkAndRotated = await generateBall({
      ...parameters,
      keychainRoundness: 100,
      keychainRotation: 90,
      keychainSurfaceOffset: -2,
    });

    [square, rounded, sunkAndRotated].forEach((ball) => {
      expect(ball.stats.watertight).toBe(true);
      expect(ball.stats.components).toBe(1);
      expect(ball.stats.nonManifoldEdges).toBe(0);
    });
    expect(Math.abs(square.stats.volume - rounded.stats.volume)).toBeGreaterThan(
      1,
    );
    expect(sunkAndRotated.stats.dimensions[1]).toBeLessThan(
      rounded.stats.dimensions[1] - 1,
    );

    const elevatedVertices = (ball: typeof rounded) => {
      const points: Array<[number, number]> = [];
      for (let index = 0; index < ball.positions.length; index += 3) {
        if (ball.positions[index + 1] > 21) {
          points.push([ball.positions[index], ball.positions[index + 2]]);
        }
      }
      return points;
    };
    const spread = (values: number[]) =>
      Math.max(...values) - Math.min(...values);
    const defaultTop = elevatedVertices(rounded);
    const rotatedTop = elevatedVertices(sunkAndRotated);
    expect(spread(defaultTop.map(([x]) => x))).toBeGreaterThan(
      spread(defaultTop.map(([, z]) => z)) * 2,
    );
    expect(spread(rotatedTop.map(([, z]) => z))).toBeGreaterThan(
      spread(rotatedTop.map(([x]) => x)) * 2,
    );
  }, 30_000);

  it("keeps the keychain centered on the ball pole beside an asymmetric frame", async () => {
    const ball = await generateBall({
      ...DEFAULT_PARAMETERS,
      mode: "solid",
      pattern: "none",
      diameter: 40,
      quality: "draft",
      keychainEnabled: true,
      keychainOuterDiameter: 10,
      keychainHoleDiameter: 5,
      markings: [
        {
          id: "side-frame",
          type: "logo",
          operation: "raised",
          text: "",
          logoMask: "",
          vectorData: JSON.stringify([
            [
              [-1, -0.45],
              [1, -0.45],
              [1, 0.45],
              [-1, 0.45],
            ],
          ]),
          logoName: "rectangle",
          font: "modern",
          placement: "surface",
          size: 24,
          height: 1,
          bandIndex: 0,
          position: 75,
          latitude: 0,
          rotation: 0,
          framePadding: 4,
        },
      ],
    });

    const bodyPoints: Array<[number, number, number]> = [];
    for (let triangle = 0; triangle < ball.indices.length / 3; triangle += 1) {
      if (ball.triangleMaterials?.[triangle] !== 0) continue;
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = ball.indices[triangle * 3 + corner];
        bodyPoints.push([
          ball.positions[vertex * 3],
          ball.positions[vertex * 3 + 1],
          ball.positions[vertex * 3 + 2],
        ]);
      }
    }
    const bounds = (axis: number) => [
      Math.min(...bodyPoints.map((point) => point[axis])),
      Math.max(...bodyPoints.map((point) => point[axis])),
    ];
    const [minimumX] = bounds(0);
    const [minimumY] = bounds(1);
    const [minimumZ, maximumZ] = bounds(2);
    const sphereCenterZ = (minimumZ + maximumZ) / 2;
    const sphereRadius = (maximumZ - minimumZ) / 2;
    const sphereCenterX = minimumX + sphereRadius;
    const sphereCenterY = minimumY + sphereRadius;
    const loopPoints = bodyPoints.filter(
      (point) => point[1] > sphereCenterY + sphereRadius + 0.25,
    );
    const loopCenter = (axis: number) =>
      (Math.min(...loopPoints.map((point) => point[axis])) +
        Math.max(...loopPoints.map((point) => point[axis]))) /
      2;

    expect(loopPoints.length).toBeGreaterThan(0);
    expect(loopCenter(0)).toBeCloseTo(sphereCenterX, 1);
    expect(loopCenter(2)).toBeCloseTo(sphereCenterZ, 1);
  }, 30_000);

  it("normalizes saved keychain controls into printable ranges", () => {
    const parameters = normalizeParameters({
      keychainEnabled: true,
      keychainOuterDiameter: 10,
      keychainHoleDiameter: 5,
      keychainSurfaceOffset: 12,
      keychainRoundness: -20,
      keychainRotation: 420,
    });

    expect(parameters.keychainSurfaceOffset).toBeCloseTo(0.8, 5);
    expect(parameters.keychainRoundness).toBe(0);
    expect(parameters.keychainRotation).toBe(180);
  });

  it("connects the keychain loop to an open rugby pattern", async () => {
    const template = BALL_TEMPLATES.find(
      (candidate) => candidate.id === "rugby",
    )!;
    const parameters = {
      ...parametersForTemplate(template, "#7fa84f"),
      keychainEnabled: true,
      quality: "draft" as const,
    };
    const ball = await generateBall(parameters);

    expect(ball.stats.watertight).toBe(true);
    expect(ball.stats.components).toBe(1);
    expect(Math.max(...ball.stats.dimensions)).toBeGreaterThan(
      parameters.diameter + 4,
    );
  }, 30_000);

  it("adds only a bare keychain ring to an open spherical pattern", async () => {
    const parameters = {
      ...DEFAULT_PARAMETERS,
      mode: "perforated" as const,
      pattern: "hexagons" as const,
      diameter: 40,
      cellFrequency: 2,
      featureWidth: 1.4,
      wallThickness: 1.8,
      quality: "draft" as const,
    };
    const plain = await generateBall(parameters);
    const withRing = await generateBall({
      ...parameters,
      keychainEnabled: true,
      keychainOuterDiameter: 10,
      keychainHoleDiameter: 5,
      keychainSurfaceOffset: 0,
    });
    const addedVolume = withRing.stats.volume - plain.stats.volume;

    expect(withRing.stats.watertight).toBe(true);
    expect(withRing.stats.components).toBe(1);
    expect(Math.max(...withRing.stats.dimensions)).toBeGreaterThan(44);
    expect(addedVolume).toBeGreaterThan(35);
    expect(addedVolume).toBeLessThan(180);
  }, 30_000);

  it("wraps vector artwork and its frame onto the ball with separate materials", async () => {
    const ball = await generateBall({
      ...DEFAULT_PARAMETERS,
      mode: "solid",
      pattern: "none",
      quality: "draft",
      markings: [
        {
          id: "vector-label",
          type: "text",
          operation: "raised",
          text: "A",
          logoMask: "",
          vectorData: JSON.stringify([
            [
              [-0.5, -0.5],
              [0, 0.5],
              [0.5, -0.5],
            ],
            [
              [-0.12, -0.12],
              [0.12, -0.12],
              [0, 0.14],
            ],
          ]),
          logoName: "",
          font: "modern",
          placement: "surface",
          size: 18,
          height: 0.8,
          bandIndex: 0,
          position: 58,
          latitude: 24,
          rotation: -18,
          framePadding: 3,
        },
      ],
    });

    expect(ball.stats.watertight).toBe(true);
    expect(ball.stats.nonManifoldEdges).toBe(0);
    expect(ball.stats.components).toBe(1);
    expect(ball.triangleMaterials).toContain(1);
    expect(ball.triangleMaterials).toContain(2);
  }, 30_000);

  it("keeps vector text smooth on a small tennis ball and responds to mark size", async () => {
    const template = BALL_TEMPLATES.find(
      (candidate) => candidate.id === "tennis",
    )!;
    const base = {
      ...parametersForTemplate(template, "#7fa84f"),
      markingType: "none" as const,
      quality: "draft" as const,
    };
    const marking = {
      id: "tennis-vector-label",
      type: "text" as const,
      operation: "raised" as const,
      text: "A",
      logoMask: "",
      vectorData: JSON.stringify([
        [
          [-0.5, -0.5],
          [0, 0.5],
          [0.5, -0.5],
        ],
        [
          [-0.12, -0.12],
          [0.12, -0.12],
          [0, 0.14],
        ],
      ]),
      logoName: "",
      font: "modern" as const,
      placement: "band" as const,
      size: 10,
      height: 0.8,
      bandIndex: 0,
      position: 50,
      latitude: 0,
      rotation: 0,
      framePadding: 3,
    };
    const small = await generateBall({
      ...base,
      markings: [marking],
    });
    const large = await generateBall({
      ...base,
      markings: [{ ...marking, size: 28 }],
    });

    expect(small.stats.watertight).toBe(true);
    expect(large.stats.watertight).toBe(true);
    expect(large.stats.components).toBe(1);
    expect(large.stats.triangles).toBeGreaterThan(small.stats.triangles);
    expect(Math.abs(large.stats.volume - small.stats.volume)).toBeGreaterThan(
      0.25,
    );
    expect(maximumVertexRadius(large.positions)).toBeGreaterThan(
      base.diameter / 2 + 0.1,
    );
    expect(maximumVertexRadius(large.positions)).toBeLessThanOrEqual(
      base.diameter / 2 + marking.height + 0.02,
    );
  }, 30_000);

  it.each(["raised", "engraved"] as const)(
    "wraps a %s vector surface frame onto a 67 mm perforated ball",
    async (operation) => {
      const template = BALL_TEMPLATES.find(
        (candidate) => candidate.id === "tennis",
      )!;
      const ball = await generateBall({
        ...parametersForTemplate(template, "#7fa84f"),
        markingType: "none",
        quality: "draft",
        markings: [
          {
            id: `tennis-surface-${operation}`,
            type: "text",
            operation,
            text: "A",
            logoMask: "",
            vectorData: JSON.stringify([
              [
                [-0.5, -0.5],
                [0, 0.5],
                [0.5, -0.5],
              ],
              [
                [-0.12, -0.12],
                [0.12, -0.12],
                [0, 0.14],
              ],
            ]),
            logoName: "",
            font: "modern",
            placement: "surface",
            size: 18,
            height: 0.8,
            bandIndex: 0,
            position: 62,
            latitude: 0,
            rotation: 0,
            framePadding: 3,
          },
        ],
      });

      expect(ball.stats.watertight).toBe(true);
      expect(ball.stats.nonManifoldEdges).toBe(0);
      expect(ball.stats.components).toBe(1);
      expect(ball.triangleMaterials).toContain(1);
      if (operation === "raised") {
        expect(ball.triangleMaterials).toContain(2);
      }
    },
    30_000,
  );

  it("keeps the outer face of raised artwork spherical and two-dimensional", async () => {
    const ball = await generateBall({
      ...DEFAULT_PARAMETERS,
      mode: "solid",
      pattern: "none",
      markingType: "none",
      quality: "draft",
      markings: [
        {
          id: "parallel-wall-regression",
          type: "logo",
          operation: "raised",
          text: "",
          logoMask: "",
          vectorData: JSON.stringify([
            [
              [-1, -0.5],
              [1, -0.5],
              [1, 0.5],
              [-1, 0.5],
            ],
          ]),
          logoName: "rectangle",
          font: "modern",
          placement: "surface",
          size: 18,
          height: 0.8,
          bandIndex: 0,
          position: 50,
          latitude: 0,
          rotation: 0,
          framePadding: 3,
        },
      ],
    });

    const bodyPoints: Array<[number, number, number]> = [];
    for (let triangle = 0; triangle < ball.indices.length / 3; triangle += 1) {
      if (ball.triangleMaterials?.[triangle] !== 0) continue;
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = ball.indices[triangle * 3 + corner];
        bodyPoints.push([
          ball.positions[vertex * 3],
          ball.positions[vertex * 3 + 1],
          ball.positions[vertex * 3 + 2],
        ]);
      }
    }
    const axisCenter = (axis: number) =>
      (Math.min(...bodyPoints.map((point) => point[axis])) +
        Math.max(...bodyPoints.map((point) => point[axis]))) /
      2;
    const center = [axisCenter(0), axisCenter(1), axisCenter(2)];
    const markingPoints: Array<[number, number, number, number]> = [];
    for (let triangle = 0; triangle < ball.indices.length / 3; triangle += 1) {
      if (ball.triangleMaterials?.[triangle] !== 2) continue;
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = ball.indices[triangle * 3 + corner];
        const x = ball.positions[vertex * 3];
        const y = ball.positions[vertex * 3 + 1];
        const z = ball.positions[vertex * 3 + 2];
        markingPoints.push([
          x,
          y,
          z,
          Math.hypot(x - center[0], y - center[1], z - center[2]),
        ]);
      }
    }
    const outerRadius = Math.max(...markingPoints.map((point) => point[3]));
    const outerFace = markingPoints.filter(
      (point) => point[3] >= outerRadius - 0.025,
    );
    const spread = (axis: number) =>
      Math.max(...outerFace.map((point) => point[axis])) -
      Math.min(...outerFace.map((point) => point[axis]));

    expect(outerRadius).toBeGreaterThan(0);
    expect(spread(0)).toBeGreaterThan(5);
    expect(spread(1)).toBeGreaterThan(5);
    expect(
      Math.max(...outerFace.map((point) => point[3])) -
        Math.min(...outerFace.map((point) => point[3])),
    ).toBeLessThan(0.03);
  }, 30_000);

  it("builds the surface frame itself as a concentric spherical island", async () => {
    const ball = await generateBall({
      ...DEFAULT_PARAMETERS,
      mode: "solid",
      pattern: "none",
      markingType: "none",
      quality: "draft",
      markings: [
        {
          id: "spherical-frame-regression",
          type: "logo",
          operation: "raised",
          text: "",
          logoMask: "",
          vectorData: JSON.stringify([
            [
              [-1, -0.4],
              [1, -0.4],
              [1, 0.4],
              [-1, 0.4],
            ],
          ]),
          logoName: "rectangle",
          font: "modern",
          placement: "surface",
          size: 18,
          height: 0.8,
          bandIndex: 0,
          position: 50,
          latitude: 0,
          rotation: 0,
          framePadding: 4,
        },
      ],
    });

    const bodyPoints: Array<[number, number, number]> = [];
    for (let triangle = 0; triangle < ball.indices.length / 3; triangle += 1) {
      if (ball.triangleMaterials?.[triangle] !== 0) continue;
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = ball.indices[triangle * 3 + corner];
        bodyPoints.push([
          ball.positions[vertex * 3],
          ball.positions[vertex * 3 + 1],
          ball.positions[vertex * 3 + 2],
        ]);
      }
    }
    const span = (axis: number) => [
      Math.min(...bodyPoints.map((point) => point[axis])),
      Math.max(...bodyPoints.map((point) => point[axis])),
    ];
    const [minimumX, maximumX] = span(0);
    const [minimumY, maximumY] = span(1);
    const [minimumZ] = span(2);
    const radius = (maximumX - minimumX) / 2;
    const center = [
      (minimumX + maximumX) / 2,
      (minimumY + maximumY) / 2,
      minimumZ + radius,
    ];
    const outwardRadii: number[] = [];
    for (let triangle = 0; triangle < ball.indices.length / 3; triangle += 1) {
      if (ball.triangleMaterials?.[triangle] !== 1) continue;
      const points = [0, 1, 2].map((corner) => {
        const vertex = ball.indices[triangle * 3 + corner];
        return [
          ball.positions[vertex * 3],
          ball.positions[vertex * 3 + 1],
          ball.positions[vertex * 3 + 2],
        ] as [number, number, number];
      });
      const edgeA = points[1].map(
        (value, axis) => value - points[0][axis],
      );
      const edgeB = points[2].map(
        (value, axis) => value - points[0][axis],
      );
      const normal = [
        edgeA[1] * edgeB[2] - edgeA[2] * edgeB[1],
        edgeA[2] * edgeB[0] - edgeA[0] * edgeB[2],
        edgeA[0] * edgeB[1] - edgeA[1] * edgeB[0],
      ];
      const normalLength = Math.hypot(...normal);
      const centroid = [0, 1, 2].map(
        (axis) =>
          (points[0][axis] + points[1][axis] + points[2][axis]) / 3 -
          center[axis],
      );
      const centroidRadius = Math.hypot(...centroid);
      const radialAlignment =
        (normal[0] * centroid[0] +
          normal[1] * centroid[1] +
          normal[2] * centroid[2]) /
        Math.max(1e-8, normalLength * centroidRadius);
      if (radialAlignment > 0.8) outwardRadii.push(centroidRadius);
    }

    expect(outwardRadii.length).toBeGreaterThan(20);
    const outerRadius = Math.max(...outwardRadii);
    const sphericalTop = outwardRadii.filter(
      (value) => value >= outerRadius - 0.14,
    );
    expect(sphericalTop.length).toBeGreaterThan(20);
    expect(Math.max(...sphericalTop) - Math.min(...sphericalTop)).toBeLessThan(
      0.15,
    );
    expect(outerRadius - Math.min(...outwardRadii)).toBeGreaterThan(0.5);
  }, 30_000);

  it("moves a surface frame from flush to raised with frame height", async () => {
    const marking = {
      id: "adjustable-frame-height",
      type: "logo" as const,
      operation: "engraved" as const,
      text: "",
      logoMask: "",
      vectorData: JSON.stringify([
        [
          [-1, -0.4],
          [1, -0.4],
          [1, 0.4],
          [-1, 0.4],
        ],
      ]),
      logoName: "rectangle",
      font: "modern" as const,
      placement: "surface" as const,
      size: 18,
      height: 0.6,
      bandIndex: 0,
      position: 50,
      latitude: 0,
      rotation: 0,
      framePadding: 4,
    };
    const parameters = {
      ...DEFAULT_PARAMETERS,
      mode: "solid" as const,
      pattern: "none" as const,
      markingType: "none" as const,
      quality: "draft" as const,
    };
    const [flush, raised] = await Promise.all([
      generateBall({
        ...parameters,
        markings: [{ ...marking, frameHeight: 0 }],
      }),
      generateBall({
        ...parameters,
        markings: [{ ...marking, frameHeight: 2.4 }],
      }),
    ]);

    expect(flush.stats.watertight).toBe(true);
    expect(raised.stats.watertight).toBe(true);
    const frameProjection = (ball: typeof flush) => {
      const pointsByMaterial = [
        [] as Array<[number, number, number]>,
        [] as Array<[number, number, number]>,
      ];
      for (let triangle = 0; triangle < ball.indices.length / 3; triangle += 1) {
        const material = ball.triangleMaterials?.[triangle];
        if (material !== 0 && material !== 1) continue;
        for (let corner = 0; corner < 3; corner += 1) {
          const vertex = ball.indices[triangle * 3 + corner];
          pointsByMaterial[material].push([
            ball.positions[vertex * 3],
            ball.positions[vertex * 3 + 1],
            ball.positions[vertex * 3 + 2],
          ]);
        }
      }
      const body = pointsByMaterial[0];
      const center = [0, 1, 2].map((axis) => {
        const values = body.map((point) => point[axis]);
        return (Math.min(...values) + Math.max(...values)) / 2;
      });
      const maximumRadius = (points: Array<[number, number, number]>) =>
        Math.max(
          ...points.map((point) =>
            Math.hypot(
              point[0] - center[0],
              point[1] - center[1],
              point[2] - center[2],
            ),
          ),
        );
      return maximumRadius(pointsByMaterial[1]) - maximumRadius(body);
    };

    expect(frameProjection(flush)).toBeLessThan(0.15);
    expect(frameProjection(raised)).toBeGreaterThan(1.8);
  }, 30_000);

  it("stops a perforated surface frame at the inner shell radius", async () => {
    const template = BALL_TEMPLATES.find(
      (candidate) => candidate.id === "ping-pong",
    )!;
    const parameters = {
      ...parametersForTemplate(template, "#7fa84f"),
      markingType: "none" as const,
      quality: "draft" as const,
      markings: [
        {
          id: "shallow-svg-frame",
          type: "logo" as const,
          operation: "raised" as const,
          text: "",
          logoMask: "",
          vectorData: JSON.stringify([
            [
              [-1, -0.4],
              [1, -0.4],
              [1, 0.4],
              [-1, 0.4],
            ],
          ]),
          logoName: "brand.svg",
          font: "modern" as const,
          placement: "surface" as const,
          size: 18,
          height: 0.8,
          bandIndex: 0,
          position: 50,
          latitude: 0,
          rotation: 0,
          framePadding: 4,
        },
      ],
    };
    const ball = await generateBall(parameters);
    const bodyPoints: Array<[number, number, number]> = [];
    const framePoints: Array<[number, number, number]> = [];
    for (let triangle = 0; triangle < ball.indices.length / 3; triangle += 1) {
      const material = ball.triangleMaterials?.[triangle];
      if (material !== 0 && material !== 1) continue;
      const target = material === 0 ? bodyPoints : framePoints;
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = ball.indices[triangle * 3 + corner];
        target.push([
          ball.positions[vertex * 3],
          ball.positions[vertex * 3 + 1],
          ball.positions[vertex * 3 + 2],
        ]);
      }
    }
    const bounds = (axis: number) => [
      Math.min(...bodyPoints.map((point) => point[axis])),
      Math.max(...bodyPoints.map((point) => point[axis])),
    ];
    const [minimumX, maximumX] = bounds(0);
    const [minimumY, maximumY] = bounds(1);
    const [minimumZ] = bounds(2);
    const outerRadius = (maximumX - minimumX) / 2;
    const center = [
      (minimumX + maximumX) / 2,
      (minimumY + maximumY) / 2,
      minimumZ + outerRadius,
    ];
    const minimumFrameRadius = Math.min(
      ...framePoints.map((point) =>
        Math.hypot(
          point[0] - center[0],
          point[1] - center[1],
          point[2] - center[2],
        ),
      ),
    );
    const fittedScale = outerRadius / (parameters.diameter / 2);

    expect(ball.stats.watertight).toBe(true);
    expect(ball.stats.components).toBe(1);
    expect(framePoints.length).toBeGreaterThan(0);
    expect(minimumFrameRadius).toBeGreaterThanOrEqual(
      outerRadius - (parameters.wallThickness + 0.25) * fittedScale,
    );
  }, 30_000);

  it("keeps a surface frame above a grooved band on an open lattice", async () => {
    const ball = await generateBall({
      ...DEFAULT_PARAMETERS,
      mode: "lattice",
      pattern: "hexagons",
      seamPattern: "tennis",
      seamOperation: "grooved",
      markingType: "none",
      diameter: 72,
      quality: "draft",
      markings: [
        {
          id: "lattice-grooved-frame",
          type: "text",
          operation: "engraved",
          text: "A",
          logoMask: "",
          vectorData: JSON.stringify([
            [
              [-0.5, -0.5],
              [0, 0.5],
              [0.5, -0.5],
            ],
            [
              [-0.12, -0.12],
              [0.12, -0.12],
              [0, 0.14],
            ],
          ]),
          logoName: "",
          font: "modern",
          placement: "surface",
          size: 18,
          height: 0.8,
          bandIndex: 0,
          position: 62,
          latitude: 20,
          rotation: 0,
          framePadding: 3,
        },
      ],
    });

    expect(ball.stats.watertight).toBe(true);
    expect(ball.stats.nonManifoldEdges).toBe(0);
    expect(ball.stats.components).toBe(1);
    expect(ball.triangleMaterials).toContain(1);
  }, 30_000);
});

      expect(ball.stats.watertight).toBe(true);
      expect(ball.stats.components).toBe(1);
      expect(ball.stats.nonManifoldEdges).toBe(0);
    });
    expect(Math.abs(square.stats.volume - rounded.stats.volume)).toBeGreaterThan(
      1,
    );
    expect(sunkAndRotated.stats.dimensions[1]).toBeLessThan(
      rounded.stats.dimensions[1] - 1,
    );

    const elevatedVertices = (ball: typeof rounded) => {
      const points: Array<[number, number]> = [];
      for (let index = 0; index < ball.positions.length; index += 3) {
        if (ball.positions[index + 1] > 21) {
          points.push([ball.positions[index], ball.positions[index + 2]]);
        }
      }
      return points;
    };
    const spread = (values: number[]) =>
      Math.max(...values) - Math.min(...values);
    const defaultTop = elevatedVertices(rounded);
    const rotatedTop = elevatedVertices(sunkAndRotated);
    expect(spread(defaultTop.map(([x]) => x))).toBeGreaterThan(
      spread(defaultTop.map(([, z]) => z)) * 2,
    );
    expect(spread(rotatedTop.map(([, z]) => z))).toBeGreaterThan(
      spread(rotatedTop.map(([x]) => x)) * 2,
    );
  }, 30_000);

  it("keeps the keychain centered on the ball pole beside an asymmetric frame", async () => {
    const ball = await generateBall({
      ...DEFAULT_PARAMETERS,
      mode: "solid",
      pattern: "none",
      diameter: 40,
      quality: "draft",
      keychainEnabled: true,
      keychainOuterDiameter: 10,
      keychainHoleDiameter: 5,
      markings: [
        {
          id: "side-frame",
          type: "logo",
          operation: "raised",
          text: "",
          logoMask: "",
          vectorData: JSON.stringify([
            [
              [-1, -0.45],
              [1, -0.45],
              [1, 0.45],
              [-1, 0.45],
            ],
          ]),
          logoName: "rectangle",
          font: "modern",
          placement: "surface",
          size: 24,
          height: 1,
          bandIndex: 0,
          position: 75,
          latitude: 0,
          rotation: 0,
          framePadding: 4,
        },
      ],
    });

    const bodyPoints: Array<[number, number, number]> = [];
    for (let triangle = 0; triangle < ball.indices.length / 3; triangle += 1) {
      if (ball.triangleMaterials?.[triangle] !== 0) continue;
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = ball.indices[triangle * 3 + corner];
        bodyPoints.push([
          ball.positions[vertex * 3],
          ball.positions[vertex * 3 + 1],
          ball.positions[vertex * 3 + 2],
        ]);
      }
    }
    const bounds = (axis: number) => [
      Math.min(...bodyPoints.map((point) => point[axis])),
      Math.max(...bodyPoints.map((point) => point[axis])),
    ];
    const [minimumX] = bounds(0);
    const [minimumY] = bounds(1);
    const [minimumZ, maximumZ] = bounds(2);
    const sphereCenterZ = (minimumZ + maximumZ) / 2;
    const sphereRadius = (maximumZ - minimumZ) / 2;
    const sphereCenterX = minimumX + sphereRadius;
    const sphereCenterY = minimumY + sphereRadius;
    const loopPoints = bodyPoints.filter(
      (point) => point[1] > sphereCenterY + sphereRadius + 0.25,
    );
    const loopCenter = (axis: number) =>
      (Math.min(...loopPoints.map((point) => point[axis])) +
        Math.max(...loopPoints.map((point) => point[axis]))) /
      2;

    expect(loopPoints.length).toBeGreaterThan(0);
    expect(loopCenter(0)).toBeCloseTo(sphereCenterX, 1);
    expect(loopCenter(2)).toBeCloseTo(sphereCenterZ, 1);
  }, 30_000);

  it("normalizes saved keychain controls into printable ranges", () => {
    const parameters = normalizeParameters({
      keychainEnabled: true,
      keychainOuterDiameter: 10,
      keychainHoleDiameter: 5,
      keychainSurfaceOffset: 12,
      keychainRoundness: -20,
      keychainRotation: 420,
    });

    expect(parameters.keychainSurfaceOffset).toBeCloseTo(0.8, 5);
    expect(parameters.keychainRoundness).toBe(0);
    expect(parameters.keychainRotation).toBe(180);
  });

  it("connects the keychain loop to an open rugby pattern", async () => {
    const template = BALL_TEMPLATES.find(
      (candidate) => candidate.id === "rugby",
    )!;
    const parameters = {
      ...parametersForTemplate(template, "#7fa84f"),
      keychainEnabled: true,
      quality: "draft" as const,
    };
    const ball = await generateBall(parameters);

    expect(ball.stats.watertight).toBe(true);
    expect(ball.stats.components).toBe(1);
    expect(Math.max(...ball.stats.dimensions)).toBeGreaterThan(
      parameters.diameter + 4,
    );
  }, 30_000);

  it("adds only a bare keychain ring to an open spherical pattern", async () => {
    const parameters = {
      ...DEFAULT_PARAMETERS,
      mode: "perforated" as const,
      pattern: "hexagons" as const,
      diameter: 40,
      cellFrequency: 2,
      featureWidth: 1.4,
      wallThickness: 1.8,
      quality: "draft" as const,
    };
    const plain = await generateBall(parameters);
    const withRing = await generateBall({
      ...parameters,
      keychainEnabled: true,
      keychainOuterDiameter: 10,
      keychainHoleDiameter: 5,
      keychainSurfaceOffset: 0,
    });
    const addedVolume = withRing.stats.volume - plain.stats.volume;

    expect(withRing.stats.watertight).toBe(true);
    expect(withRing.stats.components).toBe(1);
    expect(Math.max(...withRing.stats.dimensions)).toBeGreaterThan(44);
    expect(addedVolume).toBeGreaterThan(35);
    expect(addedVolume).toBeLessThan(180);
  }, 30_000);

  it("wraps vector artwork and its frame onto the ball with separate materials", async () => {
    const ball = await generateBall({
      ...DEFAULT_PARAMETERS,
      mode: "solid",
      pattern: "none",
      quality: "draft",
      markings: [
        {
          id: "vector-label",
          type: "text",
          operation: "raised",
          text: "A",
          logoMask: "",
          vectorData: JSON.stringify([
            [
              [-0.5, -0.5],
              [0, 0.5],
              [0.5, -0.5],
            ],
            [
              [-0.12, -0.12],
              [0.12, -0.12],
              [0, 0.14],
            ],
          ]),
          logoName: "",
          font: "modern",
          placement: "surface",
          size: 18,
          height: 0.8,
          bandIndex: 0,
          position: 58,
          latitude: 24,
          rotation: -18,
          framePadding: 3,
        },
      ],
    });

    expect(ball.stats.watertight).toBe(true);
    expect(ball.stats.nonManifoldEdges).toBe(0);
    expect(ball.stats.components).toBe(1);
    expect(ball.triangleMaterials).toContain(1);
    expect(ball.triangleMaterials).toContain(2);
  }, 30_000);

  it("keeps vector text smooth on a small tennis ball and responds to mark size", async () => {
    const template = BALL_TEMPLATES.find(
      (candidate) => candidate.id === "tennis",
    )!;
    const base = {
      ...parametersForTemplate(template, "#7fa84f"),
      markingType: "none" as const,
      quality: "draft" as const,
    };
    const marking = {
      id: "tennis-vector-label",
      type: "text" as const,
      operation: "raised" as const,
      text: "A",
      logoMask: "",
      vectorData: JSON.stringify([
        [
          [-0.5, -0.5],
          [0, 0.5],
          [0.5, -0.5],
        ],
        [
          [-0.12, -0.12],
          [0.12, -0.12],
          [0, 0.14],
        ],
      ]),
      logoName: "",
      font: "modern" as const,
      placement: "band" as const,
      size: 10,
      height: 0.8,
      bandIndex: 0,
      position: 50,
      latitude: 0,
      rotation: 0,
      framePadding: 3,
    };
    const small = await generateBall({
      ...base,
      markings: [marking],
    });
    const large = await generateBall({
      ...base,
      markings: [{ ...marking, size: 28 }],
    });

    expect(small.stats.watertight).toBe(true);
    expect(large.stats.watertight).toBe(true);
    expect(large.stats.components).toBe(1);
    expect(large.stats.triangles).toBeGreaterThan(small.stats.triangles);
    expect(Math.abs(large.stats.volume - small.stats.volume)).toBeGreaterThan(
      0.25,
    );
    expect(maximumVertexRadius(large.positions)).toBeGreaterThan(
      base.diameter / 2 + 0.1,
    );
    expect(maximumVertexRadius(large.positions)).toBeLessThanOrEqual(
      base.diameter / 2 + marking.height + 0.02,
    );
  }, 30_000);

  it.each(["raised", "engraved"] as const)(
    "wraps a %s vector surface frame onto a 67 mm perforated ball",
    async (operation) => {
      const template = BALL_TEMPLATES.find(
        (candidate) => candidate.id === "tennis",
      )!;
      const ball = await generateBall({
        ...parametersForTemplate(template, "#7fa84f"),
        markingType: "none",
        quality: "draft",
        markings: [
          {
            id: `tennis-surface-${operation}`,
            type: "text",
            operation,
            text: "A",
            logoMask: "",
            vectorData: JSON.stringify([
              [
                [-0.5, -0.5],
                [0, 0.5],
                [0.5, -0.5],
              ],
              [
                [-0.12, -0.12],
                [0.12, -0.12],
                [0, 0.14],
              ],
            ]),
            logoName: "",
            font: "modern",
            placement: "surface",
            size: 18,
            height: 0.8,
            bandIndex: 0,
            position: 62,
            latitude: 0,
            rotation: 0,
            framePadding: 3,
          },
        ],
      });

      expect(ball.stats.watertight).toBe(true);
      expect(ball.stats.nonManifoldEdges).toBe(0);
      expect(ball.stats.components).toBe(1);
      expect(ball.triangleMaterials).toContain(1);
      if (operation === "raised") {
        expect(ball.triangleMaterials).toContain(2);
      }
    },
    30_000,
  );

  it("keeps the outer face of raised artwork spherical and two-dimensional", async () => {
    const ball = await generateBall({
      ...DEFAULT_PARAMETERS,
      mode: "solid",
      pattern: "none",
      markingType: "none",
      quality: "draft",
      markings: [
        {
          id: "parallel-wall-regression",
          type: "logo",
          operation: "raised",
          text: "",
          logoMask: "",
          vectorData: JSON.stringify([
            [
              [-1, -0.5],
              [1, -0.5],
              [1, 0.5],
              [-1, 0.5],
            ],
          ]),
          logoName: "rectangle",
          font: "modern",
          placement: "surface",
          size: 18,
          height: 0.8,
          bandIndex: 0,
          position: 50,
          latitude: 0,
          rotation: 0,
          framePadding: 3,
        },
      ],
    });

    const bodyPoints: Array<[number, number, number]> = [];
    for (let triangle = 0; triangle < ball.indices.length / 3; triangle += 1) {
      if (ball.triangleMaterials?.[triangle] !== 0) continue;
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = ball.indices[triangle * 3 + corner];
        bodyPoints.push([
          ball.positions[vertex * 3],
          ball.positions[vertex * 3 + 1],
          ball.positions[vertex * 3 + 2],
        ]);
      }
    }
    const axisCenter = (axis: number) =>
      (Math.min(...bodyPoints.map((point) => point[axis])) +
        Math.max(...bodyPoints.map((point) => point[axis]))) /
      2;
    const center = [axisCenter(0), axisCenter(1), axisCenter(2)];
    const markingPoints: Array<[number, number, number, number]> = [];
    for (let triangle = 0; triangle < ball.indices.length / 3; triangle += 1) {
      if (ball.triangleMaterials?.[triangle] !== 2) continue;
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = ball.indices[triangle * 3 + corner];
        const x = ball.positions[vertex * 3];
        const y = ball.positions[vertex * 3 + 1];
        const z = ball.positions[vertex * 3 + 2];
        markingPoints.push([
          x,
          y,
          z,
          Math.hypot(x - center[0], y - center[1], z - center[2]),
        ]);
      }
    }
    const outerRadius = Math.max(...markingPoints.map((point) => point[3]));
    const outerFace = markingPoints.filter(
      (point) => point[3] >= outerRadius - 0.025,
    );
    const spread = (axis: number) =>
      Math.max(...outerFace.map((point) => point[axis])) -
      Math.min(...outerFace.map((point) => point[axis]));

    expect(outerRadius).toBeGreaterThan(0);
    expect(spread(0)).toBeGreaterThan(5);
    expect(spread(1)).toBeGreaterThan(5);
    expect(
      Math.max(...outerFace.map((point) => point[3])) -
        Math.min(...outerFace.map((point) => point[3])),
    ).toBeLessThan(0.03);
  }, 30_000);

  it("builds the surface frame itself as a concentric spherical island", async () => {
    const ball = await generateBall({
      ...DEFAULT_PARAMETERS,
      mode: "solid",
      pattern: "none",
      markingType: "none",
      quality: "draft",
      markings: [
        {
          id: "spherical-frame-regression",
          type: "logo",
          operation: "raised",
          text: "",
          logoMask: "",
          vectorData: JSON.stringify([
            [
              [-1, -0.4],
              [1, -0.4],
              [1, 0.4],
              [-1, 0.4],
            ],
          ]),
          logoName: "rectangle",
          font: "modern",
          placement: "surface",
          size: 18,
          height: 0.8,
          bandIndex: 0,
          position: 50,
          latitude: 0,
          rotation: 0,
          framePadding: 4,
        },
      ],
    });

    const bodyPoints: Array<[number, number, number]> = [];
    for (let triangle = 0; triangle < ball.indices.length / 3; triangle += 1) {
      if (ball.triangleMaterials?.[triangle] !== 0) continue;
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = ball.indices[triangle * 3 + corner];
        bodyPoints.push([
          ball.positions[vertex * 3],
          ball.positions[vertex * 3 + 1],
          ball.positions[vertex * 3 + 2],
        ]);
      }
    }
    const span = (axis: number) => [
      Math.min(...bodyPoints.map((point) => point[axis])),
      Math.max(...bodyPoints.map((point) => point[axis])),
    ];
    const [minimumX, maximumX] = span(0);
    const [minimumY, maximumY] = span(1);
    const [minimumZ] = span(2);
    const radius = (maximumX - minimumX) / 2;
    const center = [
      (minimumX + maximumX) / 2,
      (minimumY + maximumY) / 2,
      minimumZ + radius,
    ];
    const outwardRadii: number[] = [];
    for (let triangle = 0; triangle < ball.indices.length / 3; triangle += 1) {
      if (ball.triangleMaterials?.[triangle] !== 1) continue;
      const points = [0, 1, 2].map((corner) => {
        const vertex = ball.indices[triangle * 3 + corner];
        return [
          ball.positions[vertex * 3],
          ball.positions[vertex * 3 + 1],
          ball.positions[vertex * 3 + 2],
        ] as [number, number, number];
      });
      const edgeA = points[1].map(
        (value, axis) => value - points[0][axis],
      );
      const edgeB = points[2].map(
        (value, axis) => value - points[0][axis],
      );
      const normal = [
        edgeA[1] * edgeB[2] - edgeA[2] * edgeB[1],
        edgeA[2] * edgeB[0] - edgeA[0] * edgeB[2],
        edgeA[0] * edgeB[1] - edgeA[1] * edgeB[0],
      ];
      const normalLength = Math.hypot(...normal);
      const centroid = [0, 1, 2].map(
        (axis) =>
          (points[0][axis] + points[1][axis] + points[2][axis]) / 3 -
          center[axis],
      );
      const centroidRadius = Math.hypot(...centroid);
      const radialAlignment =
        (normal[0] * centroid[0] +
          normal[1] * centroid[1] +
          normal[2] * centroid[2]) /
        Math.max(1e-8, normalLength * centroidRadius);
      if (radialAlignment > 0.8) outwardRadii.push(centroidRadius);
    }

    expect(outwardRadii.length).toBeGreaterThan(20);
    const outerRadius = Math.max(...outwardRadii);
    const sphericalTop = outwardRadii.filter(
      (value) => value >= outerRadius - 0.14,
    );
    expect(sphericalTop.length).toBeGreaterThan(20);
    expect(Math.max(...sphericalTop) - Math.min(...sphericalTop)).toBeLessThan(
      0.15,
    );
    expect(outerRadius - Math.min(...outwardRadii)).toBeGreaterThan(0.5);
  }, 30_000);

  it("moves a surface frame from flush to raised with frame height", async () => {
    const marking = {
      id: "adjustable-frame-height",
      type: "logo" as const,
      operation: "engraved" as const,
      text: "",
      logoMask: "",
      vectorData: JSON.stringify([
        [
          [-1, -0.4],
          [1, -0.4],
          [1, 0.4],
          [-1, 0.4],
        ],
      ]),
      logoName: "rectangle",
      font: "modern" as const,
      placement: "surface" as const,
      size: 18,
      height: 0.6,
      bandIndex: 0,
      position: 50,
      latitude: 0,
      rotation: 0,
      framePadding: 4,
    };
    const parameters = {
      ...DEFAULT_PARAMETERS,
      mode: "solid" as const,
      pattern: "none" as const,
      markingType: "none" as const,
      quality: "draft" as const,
    };
    const [flush, raised] = await Promise.all([
      generateBall({
        ...parameters,
        markings: [{ ...marking, frameHeight: 0 }],
      }),
      generateBall({
        ...parameters,
        markings: [{ ...marking, frameHeight: 2.4 }],
      }),
    ]);

    expect(flush.stats.watertight).toBe(true);
    expect(raised.stats.watertight).toBe(true);
    const frameProjection = (ball: typeof flush) => {
      const pointsByMaterial = [
        [] as Array<[number, number, number]>,
        [] as Array<[number, number, number]>,
      ];
      for (let triangle = 0; triangle < ball.indices.length / 3; triangle += 1) {
        const material = ball.triangleMaterials?.[triangle];
        if (material !== 0 && material !== 1) continue;
        for (let corner = 0; corner < 3; corner += 1) {
          const vertex = ball.indices[triangle * 3 + corner];
          pointsByMaterial[material].push([
            ball.positions[vertex * 3],
            ball.positions[vertex * 3 + 1],
            ball.positions[vertex * 3 + 2],
          ]);
        }
      }
      const body = pointsByMaterial[0];
      const center = [0, 1, 2].map((axis) => {
        const values = body.map((point) => point[axis]);
        return (Math.min(...values) + Math.max(...values)) / 2;
      });
      const maximumRadius = (points: Array<[number, number, number]>) =>
        Math.max(
          ...points.map((point) =>
            Math.hypot(
              point[0] - center[0],
              point[1] - center[1],
              point[2] - center[2],
            ),
          ),
        );
      return maximumRadius(pointsByMaterial[1]) - maximumRadius(body);
    };

    expect(frameProjection(flush)).toBeLessThan(0.15);
    expect(frameProjection(raised)).toBeGreaterThan(1.8);
  }, 30_000);

  it("stops a perforated surface frame at the inner shell radius", async () => {
    const template = BALL_TEMPLATES.find(
      (candidate) => candidate.id === "ping-pong",
    )!;
    const parameters = {
      ...parametersForTemplate(template, "#7fa84f"),
      markingType: "none" as const,
      quality: "draft" as const,
      markings: [
        {
          id: "shallow-svg-frame",
          type: "logo" as const,
          operation: "raised" as const,
          text: "",
          logoMask: "",
          vectorData: JSON.stringify([
            [
              [-1, -0.4],
              [1, -0.4],
              [1, 0.4],
              [-1, 0.4],
            ],
          ]),
          logoName: "brand.svg",
          font: "modern" as const,
          placement: "surface" as const,
          size: 18,
          height: 0.8,
          bandIndex: 0,
          position: 50,
          latitude: 0,
          rotation: 0,
          framePadding: 4,
        },
      ],
    };
    const ball = await generateBall(parameters);
    const bodyPoints: Array<[number, number, number]> = [];
    const framePoints: Array<[number, number, number]> = [];
    for (let triangle = 0; triangle < ball.indices.length / 3; triangle += 1) {
      const material = ball.triangleMaterials?.[triangle];
      if (material !== 0 && material !== 1) continue;
      const target = material === 0 ? bodyPoints : framePoints;
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = ball.indices[triangle * 3 + corner];
        target.push([
          ball.positions[vertex * 3],
          ball.positions[vertex * 3 + 1],
          ball.positions[vertex * 3 + 2],
        ]);
      }
    }
    const bounds = (axis: number) => [
      Math.min(...bodyPoints.map((point) => point[axis])),
      Math.max(...bodyPoints.map((point) => point[axis])),
    ];
    const [minimumX, maximumX] = bounds(0);
    const [minimumY, maximumY] = bounds(1);
    const [minimumZ] = bounds(2);
    const outerRadius = (maximumX - minimumX) / 2;
    const center = [
      (minimumX + maximumX) / 2,
      (minimumY + maximumY) / 2,
      minimumZ + outerRadius,
    ];
    const minimumFrameRadius = Math.min(
      ...framePoints.map((point) =>
        Math.hypot(
          point[0] - center[0],
          point[1] - center[1],
          point[2] - center[2],
        ),
      ),
    );
    const fittedScale = outerRadius / (parameters.diameter / 2);

    expect(ball.stats.watertight).toBe(true);
    expect(ball.stats.components).toBe(1);
    expect(framePoints.length).toBeGreaterThan(0);
    expect(minimumFrameRadius).toBeGreaterThanOrEqual(
      outerRadius - (parameters.wallThickness + 0.25) * fittedScale,
    );
  }, 30_000);

  it("keeps a surface frame above a grooved band on an open lattice", async () => {
    const ball = await generateBall({
      ...DEFAULT_PARAMETERS,
      mode: "lattice",
      pattern: "hexagons",
      seamPattern: "tennis",
      seamOperation: "grooved",
      markingType: "none",
      diameter: 72,
      quality: "draft",
      markings: [
        {
          id: "lattice-grooved-frame",
          type: "text",
          operation: "engraved",
          text: "A",
          logoMask: "",
          vectorData: JSON.stringify([
            [
              [-0.5, -0.5],
              [0, 0.5],
              [0.5, -0.5],
            ],
            [
              [-0.12, -0.12],
              [0.12, -0.12],
              [0, 0.14],
            ],
          ]),
          logoName: "",
          font: "modern",
          placement: "surface",
          size: 18,
          height: 0.8,
          bandIndex: 0,
          position: 62,
          latitude: 20,
          rotation: 0,
          framePadding: 3,
        },
      ],
    });

    expect(ball.stats.watertight).toBe(true);
    expect(ball.stats.nonManifoldEdges).toBe(0);
    expect(ball.stats.components).toBe(1);
    expect(ball.triangleMaterials).toContain(1);
  }, 30_000);
});
