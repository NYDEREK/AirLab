import type { Font, PathCommand } from "opentype.js";
import { expect, it, vi } from "vitest";
import { vectorizeTextWithFont } from "./markingVector";

it("builds smooth vector contours from the bundled font", async () => {
  const wholeStringPath = vi.fn(() => {
    throw new Error("Unsupported font layout table");
  });
  const font = {
    unitsPerEm: 1000,
    getPath: wholeStringPath,
    charToGlyph: () => ({
      advanceWidth: 620,
      getPath: (x: number) => ({
        commands: [
          { type: "M", x, y: 0 },
          { type: "L", x: x + 24, y: -72 },
          {
            type: "Q",
            x1: x + 34,
            y1: -82,
            x: x + 48,
            y: -72,
          },
          { type: "L", x: x + 72, y: 0 },
          { type: "Z" },
        ] as PathCommand[],
      }),
    }),
    getKerningValue: () => 0,
  } as unknown as Font;

  const vector = JSON.parse(vectorizeTextWithFont("AIRLAB", font)) as {
    contours: Array<Array<[number, number]>>;
    groups: number[][];
  };
  const { contours } = vector;

  expect(wholeStringPath).not.toHaveBeenCalled();
  expect(contours.length).toBeGreaterThan(5);
  expect(vector.groups).toHaveLength(6);
  expect(contours.some((contour) => contour.length > 8)).toBe(true);
  expect(contours.flat().every(([x, y]) => Number.isFinite(x + y))).toBe(true);
});
