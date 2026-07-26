# AirLab

AirLab is an offline desktop generator for parametric, 3D-printable balls. It
creates solid, hollow, perforated, and open lattice geometry and exports
watertight STL or 3MF files in millimeters.

The same source builds native installers for macOS and Windows with Tauri.

## Current MVP

- Solid balls with raised or engraved surface features
- Hollow shells with configurable radial wall thickness
- Perforated shells with true through-holes
- Open airless lattices
- Triangle and mathematically derived hexagon/pentagon topology
- Dot and spike patterns for massage-ball concepts
- Diameter, feature size, depth/height, density, and mesh-quality controls
- Smooth, evenly lit Three.js preview with orbit and zoom
- Named projects stored locally with create, save, open, duplicate, and delete
- Light, warm-gray, and dark themes plus custom interface, text, and accent colors
- Manifold mesh validation and physical dimensions
- Binary STL and millimeter-based 3MF export

Hexagonal topology is generated as the dual of a subdivided icosahedron. The
result contains the twelve pentagons required to close a spherical surface.

## Geometry pipeline

1. Generate a geodesic sphere or topology graph.
2. Build a solid, radial shell, through-hole pattern, or beam network.
3. Resolve unions and differences with the Manifold geometry kernel.
4. Convert the result to one indexed triangle mesh.
5. Verify that every edge belongs to exactly two triangles.
6. Export binary STL or a packaged 3MF model.

Geometry runs in a Web Worker so orbiting and the rest of the interface remain
responsive while a model is rebuilt.

## Development

Requirements:

- Node.js 22 or newer
- pnpm 11
- Rust stable toolchain
- Platform requirements from the Tauri 2 prerequisites guide

```bash
pnpm install
pnpm test
pnpm dev
```

Run the native desktop app:

```bash
pnpm tauri dev
```

Build the installer for the current operating system:

```bash
pnpm tauri build
```

macOS produces an application bundle and DMG. Windows produces NSIS/EXE and
MSI installers. The workflow in `.github/workflows/build-desktop.yml` builds
both platforms on a version tag or by manual dispatch.

## Project layout

```text
src/
  components/        React controls and Three.js viewport
  geometry/          topology, Manifold generation, validation, STL/3MF export
  hooks/             geometry-worker integration
  projects/          local project and appearance persistence
src-tauri/            native desktop wrapper, permissions, and application icons
```

## Manufacturing notes

AirLab verifies mesh topology, not the mechanical performance of a print.
Bounce, fatigue life, grip, and safety still depend on material, nozzle, layer
orientation, slicer settings, and physical testing. Use the warnings as a first
filter and validate important designs with real prints.

STL has no native unit metadata; AirLab writes coordinates using millimeters by
convention. Prefer 3MF when the target slicer supports it.

## Next product milestones

- Tennis, baseball, basketball, and volleyball seam-curve presets
- User-imported SVG patterns
- Split/multi-material export
- Minimum-thickness heat map
- Reusable geometry presets
- Signed and notarized release installers
