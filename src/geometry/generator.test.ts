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

describe("ball generator", () => {
  it("builds the default lattice as one connected component", async () => {
    const ball = await generateBall({
      ...DEFAULT_PARAMETERS,
      quality: "draft",
    });
    expect(ball.stats.components).toBe(1);
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
      mode: "solid",
      pattern: "none",
      markingType: "text",
      markingText: "AIR",
      markingOperation: "engraved",
      quality: "draft",
    });

    expect(ball.stats.watertight).toBe(true);
    expect(ball.stats.nonManifoldEdges).toBe(0);
    expect(ball.stats.components).toBe(1);
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
    expect(marked.stats.volume).toBeGreaterThan(plain.stats.volume + 1);
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
});
