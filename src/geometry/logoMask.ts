export interface RasterizedLogo {
  mask: string;
  name: string;
}

const GRID_SIZE = 20;

export const rasterizeLogo = (file: File): Promise<RasterizedLogo> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = GRID_SIZE;
      canvas.height = GRID_SIZE;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        URL.revokeObjectURL(url);
        reject(new Error("Could not prepare the logo canvas."));
        return;
      }

      context.clearRect(0, 0, GRID_SIZE, GRID_SIZE);
      const scale = Math.min(
        (GRID_SIZE - 2) / image.naturalWidth,
        (GRID_SIZE - 2) / image.naturalHeight,
      );
      const width = Math.max(1, image.naturalWidth * scale);
      const height = Math.max(1, image.naturalHeight * scale);
      context.drawImage(
        image,
        (GRID_SIZE - width) / 2,
        (GRID_SIZE - height) / 2,
        width,
        height,
      );

      const pixels = context.getImageData(0, 0, GRID_SIZE, GRID_SIZE).data;
      let transparent = 0;
      for (let offset = 3; offset < pixels.length; offset += 4) {
        if (pixels[offset] < 30) transparent += 1;
      }
      const usesTransparency = transparent > GRID_SIZE * GRID_SIZE * 0.25;
      const rows: string[] = [];
      for (let y = 0; y < GRID_SIZE; y += 1) {
        let row = "";
        for (let x = 0; x < GRID_SIZE; x += 1) {
          const offset = (y * GRID_SIZE + x) * 4;
          const alpha = pixels[offset + 3];
          const luminance =
            pixels[offset] * 0.299 +
            pixels[offset + 1] * 0.587 +
            pixels[offset + 2] * 0.114;
          const filled = usesTransparency
            ? alpha > 70
            : alpha > 70 && luminance < 185;
          row += filled ? "1" : "0";
        }
        rows.push(row);
      }
      URL.revokeObjectURL(url);
      resolve({ mask: rows.join("/"), name: file.name });
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Use a PNG, JPG, WebP, or SVG logo file."));
    };
    image.src = url;
  });
