import interUrl from "@fontsource/inter/files/inter-latin-600-normal.woff?url";
import nunitoUrl from "@fontsource/nunito/files/nunito-latin-700-normal.woff?url";
import spaceMonoUrl from "@fontsource/space-mono/files/space-mono-latin-700-normal.woff?url";
import { parse, type Font, type PathCommand } from "opentype.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import type { MarkingFont } from "./types";

export type VectorContours = Array<Array<[number, number]>>;

const FONT_URLS: Record<MarkingFont, string> = {
  modern: interUrl,
  rounded: nunitoUrl,
  technical: spaceMonoUrl,
};

const fontPromises = new Map<MarkingFont, Promise<Font>>();

const loadFont = (font: MarkingFont) => {
  const existing = fontPromises.get(font);
  if (existing) return existing;
  const pending = fetch(FONT_URLS[font])
    .then((response) => {
      if (!response.ok) throw new Error("Could not load the selected font.");
      return response.arrayBuffer();
    })
    .then((buffer) => parse(buffer));
  fontPromises.set(font, pending);
  return pending;
};

const cubicPoint = (
  start: [number, number],
  controlA: [number, number],
  controlB: [number, number],
  end: [number, number],
  amount: number,
): [number, number] => {
  const inverse = 1 - amount;
  return [
    inverse ** 3 * start[0] +
      3 * inverse ** 2 * amount * controlA[0] +
      3 * inverse * amount ** 2 * controlB[0] +
      amount ** 3 * end[0],
    inverse ** 3 * start[1] +
      3 * inverse ** 2 * amount * controlA[1] +
      3 * inverse * amount ** 2 * controlB[1] +
      amount ** 3 * end[1],
  ];
};

const quadraticPoint = (
  start: [number, number],
  control: [number, number],
  end: [number, number],
  amount: number,
): [number, number] => {
  const inverse = 1 - amount;
  return [
    inverse ** 2 * start[0] +
      2 * inverse * amount * control[0] +
      amount ** 2 * end[0],
    inverse ** 2 * start[1] +
      2 * inverse * amount * control[1] +
      amount ** 2 * end[1],
  ];
};

const commandsToContours = (commands: PathCommand[]): VectorContours => {
  const contours: VectorContours = [];
  let contour: Array<[number, number]> = [];
  let current: [number, number] = [0, 0];
  const finish = () => {
    if (contour.length >= 3) contours.push(contour);
    contour = [];
  };

  commands.forEach((command) => {
    if (command.type === "M") {
      finish();
      current = [command.x, command.y];
      contour.push(current);
      return;
    }
    if (command.type === "L") {
      current = [command.x, command.y];
      contour.push(current);
      return;
    }
    if (command.type === "Q") {
      const start = current;
      const end: [number, number] = [command.x, command.y];
      for (let step = 1; step <= 12; step += 1) {
        contour.push(
          quadraticPoint(
            start,
            [command.x1, command.y1],
            end,
            step / 12,
          ),
        );
      }
      current = end;
      return;
    }
    if (command.type === "C") {
      const start = current;
      const end: [number, number] = [command.x, command.y];
      for (let step = 1; step <= 16; step += 1) {
        contour.push(
          cubicPoint(
            start,
            [command.x1, command.y1],
            [command.x2, command.y2],
            end,
            step / 16,
          ),
        );
      }
      current = end;
      return;
    }
    finish();
  });
  finish();
  return contours;
};

const normalizeContours = (contours: VectorContours): VectorContours => {
  const points = contours.flat();
  if (points.length === 0) return [];
  const minX = Math.min(...points.map(([x]) => x));
  const maxX = Math.max(...points.map(([x]) => x));
  const minY = Math.min(...points.map(([, y]) => y));
  const maxY = Math.max(...points.map(([, y]) => y));
  const width = Math.max(1e-6, maxX - minX);
  const height = Math.max(1e-6, maxY - minY);
  const scale = 1 / Math.max(width, height);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  return contours.map((contour) =>
    contour.map(([x, y]) => [
      (x - centerX) * scale,
      (y - centerY) * scale,
    ]),
  );
};

export const serializeContours = (
  contours: VectorContours,
  groups: number[][] = [],
) => {
  const normalized = normalizeContours(contours);
  return JSON.stringify(
    groups.length > 0
      ? { version: 2, contours: normalized, groups }
      : normalized,
  );
};

export const vectorizeTextWithFont = (text: string, font: Font) => {
  const content = text.trim().slice(0, 24) || "AIRLAB";
  const fontSize = 100;
  const scale = fontSize / font.unitsPerEm;
  const glyphs = [...content].map((character) =>
    font.charToGlyph(character),
  );
  const contours: VectorContours = [];
  const groups: number[][] = [];
  let cursor = 0;
  glyphs.forEach((glyph, index) => {
    const glyphContours = commandsToContours(
      glyph.getPath(cursor, 0, fontSize).commands,
    ).map((contour) =>
      contour.map(([x, y]) => [x, -y] as [number, number]),
    );
    if (glyphContours.length > 0) {
      const firstContour = contours.length;
      contours.push(...glyphContours);
      groups.push(
        Array.from(
          { length: glyphContours.length },
          (_, contourIndex) => firstContour + contourIndex,
        ),
      );
    }
    cursor += (glyph.advanceWidth ?? font.unitsPerEm) * scale;
    const nextGlyph = glyphs[index + 1];
    if (nextGlyph) {
      cursor += font.getKerningValue(glyph, nextGlyph) * scale;
    }
  });
  return serializeContours(contours, groups);
};

export const vectorizeText = async (
  text: string,
  fontName: MarkingFont,
) => vectorizeTextWithFont(text, await loadFont(fontName));

export const vectorizeSvg = async (file: File) => {
  const source = await file.text();
  const parsed = new SVGLoader().parse(source);
  const contours: VectorContours = [];
  parsed.paths.forEach((path) => {
    path.toShapes().forEach((shape) => {
      const sampled = shape.extractPoints(10);
      contours.push(
        sampled.shape.map((point) => [point.x, -point.y]),
        ...sampled.holes.map((hole) =>
          hole.map((point) => [point.x, -point.y] as [number, number]),
        ),
      );
    });
  });
  if (contours.length === 0) {
    throw new Error(
      "This SVG has no filled paths. Convert strokes to outlines and try again.",
    );
  }
  return serializeContours(contours);
};
