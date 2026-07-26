import { describe, expect, it } from "vitest";
import { generateBall } from "./generator";
import { DEFAULT_PARAMETERS, type BallParameters } from "./types";

const dotBall = (effect: BallParameters["effect"]) => ({
  ...DEFAULT_PARAMETERS,
  mode: "solid" as const,
  pattern: "dots" as const,
  effect,
  quality: "standard" as const,
});

describe("ball generator", () => {
  it.each(["raised", "grooved"] as const)(
    "keeps a %s dot ball closed and supplies smooth preview normals",
    async (effect) => {
      const ball = await generateBall(dotBall(effect));

      expect(ball.stats.watertight).toBe(true);
      expect(ball.stats.nonManifoldEdges).toBe(0);
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
});
