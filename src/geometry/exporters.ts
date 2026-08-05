import { zipSync, strToU8 } from "fflate";
import { isTauri } from "@tauri-apps/api/core";
import type { GeneratedBall } from "./types";

export type ExportFormat = "stl" | "3mf";

const exportPositions = (model: GeneratedBall) => {
  if (model.exportUpAxis !== "y") return model.positions;
  const rotated = new Float32Array(model.positions.length);
  for (let offset = 0; offset < model.positions.length; offset += 3) {
    rotated[offset] = model.positions[offset];
    rotated[offset + 1] = -model.positions[offset + 2];
    rotated[offset + 2] = model.positions[offset + 1];
  }
  return rotated;
};

const triangleNormal = (
  positions: Float32Array,
  a: number,
  b: number,
  c: number,
) => {
  const ax = positions[a * 3];
  const ay = positions[a * 3 + 1];
  const az = positions[a * 3 + 2];
  const abx = positions[b * 3] - ax;
  const aby = positions[b * 3 + 1] - ay;
  const abz = positions[b * 3 + 2] - az;
  const acx = positions[c * 3] - ax;
  const acy = positions[c * 3 + 1] - ay;
  const acz = positions[c * 3 + 2] - az;
  const x = aby * acz - abz * acy;
  const y = abz * acx - abx * acz;
  const z = abx * acy - aby * acx;
  const magnitude = Math.hypot(x, y, z) || 1;
  return [x / magnitude, y / magnitude, z / magnitude] as const;
};

export const exportBinaryStl = (model: GeneratedBall): Uint8Array => {
  const positions = exportPositions(model);
  const { indices } = model;
  const triangleCount = indices.length / 3;
  const buffer = new ArrayBuffer(84 + triangleCount * 50);
  const view = new DataView(buffer);
  const header = new TextEncoder().encode(
    "AirLab printable manifold mesh — dimensions in millimeters",
  );
  new Uint8Array(buffer, 0, Math.min(80, header.length)).set(
    header.subarray(0, 80),
  );
  view.setUint32(80, triangleCount, true);

  let offset = 84;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const a = indices[triangle * 3];
    const b = indices[triangle * 3 + 1];
    const c = indices[triangle * 3 + 2];
    const normal = triangleNormal(positions, a, b, c);
    for (const component of normal) {
      view.setFloat32(offset, component, true);
      offset += 4;
    }
    for (const vertex of [a, b, c]) {
      for (let axis = 0; axis < 3; axis += 1) {
        view.setFloat32(offset, positions[vertex * 3 + axis], true);
        offset += 4;
      }
    }
    view.setUint16(offset, 0, true);
    offset += 2;
  }
  return new Uint8Array(buffer);
};

const xmlNumber = (value: number) =>
  Number.isFinite(value) ? value.toFixed(6).replace(/\.?0+$/, "") : "0";

export const export3mf = (generated: GeneratedBall): Uint8Array => {
  const positions = exportPositions(generated);
  const singleColor = generated.colorMode === "single";
  const {
    indices,
    triangleMaterials,
    color,
    detailColor,
    markingColor,
  } = generated;
  const vertices: string[] = [];
  for (let offset = 0; offset < positions.length; offset += 3) {
    vertices.push(
      `<vertex x="${xmlNumber(positions[offset])}" y="${xmlNumber(
        positions[offset + 1],
      )}" z="${xmlNumber(positions[offset + 2])}"/>`,
    );
  }

  const triangles: string[] = [];
  for (
    let offset = 0, triangleIndex = 0;
    offset < indices.length;
    offset += 3, triangleIndex += 1
  ) {
    const material = singleColor
      ? 0
      : Math.max(0, Math.min(2, triangleMaterials?.[triangleIndex] ?? 0));
    triangles.push(
      `<triangle v1="${indices[offset]}" v2="${indices[offset + 1]}" v3="${
        indices[offset + 2]
      }" pid="2" p1="${material}" p2="${material}" p3="${material}"/>`,
    );
  }

  const validColor = (value: string | undefined, fallback: string) =>
    value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  const body = validColor(color, "#7fa84f");
  const detail = validColor(detailColor, "#f2f1ea");
  const marking = validColor(markingColor, "#20231f");
  const isStand = generated.exportUpAxis === "y";
  const title = isStand ? "AirLab generated ball stand" : "AirLab generated ball";
  const bodyName = isStand ? "Stand" : "Ball";
  const detailName = isStand ? "Stand detail" : "Bands and frame";
  const baseMaterials = singleColor
    ? `<base name="${bodyName}" displaycolor="${body}"/>`
    : `<base name="${bodyName}" displaycolor="${body}"/>
      <base name="${detailName}" displaycolor="${detail}"/>
      <base name="Text and logo" displaycolor="${marking}"/>`;

  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <metadata name="Title">${title}</metadata>
  <metadata name="Application">AirLab 0.1.0</metadata>
  <resources>
    <basematerials id="2">
      ${baseMaterials}
    </basematerials>
    <object id="1" type="model">
      <mesh>
        <vertices>${vertices.join("")}</vertices>
        <triangles>${triangles.join("")}</triangles>
      </mesh>
    </object>
  </resources>
  <build><item objectid="1"/></build>
</model>`;

  const relationships = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;

  return zipSync(
    {
      "[Content_Types].xml": strToU8(contentTypes),
      "_rels/.rels": strToU8(relationships),
      "3D/3dmodel.model": strToU8(model),
    },
    { level: 6 },
  );
};

const downloadInBrowser = (
  bytes: Uint8Array,
  fileName: string,
  mimeType: string,
) => {
  const blob = new Blob([bytes as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
};

export const saveGeneratedBall = async (
  ball: GeneratedBall,
  format: ExportFormat,
  designName: "ball" | "stand" = "ball",
) => {
  const bytes = format === "stl" ? exportBinaryStl(ball) : export3mf(ball);
  const fileName = `airlab-${designName}.${format}`;
  const mimeType =
    format === "stl"
      ? "model/stl"
      : "application/vnd.ms-package.3dmanufacturing-3dmodel+xml";

  if (!isTauri()) {
    downloadInBrowser(bytes, fileName, mimeType);
    return true;
  }

  const [{ save }, { writeFile }] = await Promise.all([
    import("@tauri-apps/plugin-dialog"),
    import("@tauri-apps/plugin-fs"),
  ]);
  const path = await save({
    defaultPath: fileName,
    filters: [
      {
        name: format === "stl" ? "STL mesh" : "3MF model",
        extensions: [format],
      },
    ],
  });
  if (!path) return false;
  await writeFile(path, bytes);
  return true;
};
