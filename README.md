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
- Editable tennis, football, basketball, volleyball, and stitched baseball bands
- Reference-style perforated ping-pong, tennis, football, basketball,
  volleyball, baseball, and golf templates
- Solid massage-ball and pet-toy templates with rounded surface features
- Raised or engraved dot-matrix text and rasterized logo marks
- Diameter, feature size, depth/height, density, and mesh-quality controls
- Balanced Three.js lighting with soft self/contact shadows, orbit, and zoom
- Named projects stored locally with create, save, open, duplicate, and delete
- Projects dashboard shown at launch and a dedicated new-design template picker
- Local email/password accounts with isolated projects and hashed passwords
- Explorer, Maker, and Merchant access plans with activation codes
- Enforced monthly export and saved-project limits with an admin code panel
- Light, warm-gray, and dark themes plus custom UI and default-model colors
- Per-project model color retained by 3MF export
- Manifold mesh validation and physical dimensions
- Binary STL and millimeter-based 3MF export

Hexagonal topology is generated as the dual of a subdivided icosahedron. The
result contains the twelve pentagons required to close a spherical surface.

## Geometry pipeline

1. Generate a geodesic sphere or topology graph.
2. Build a solid, radial shell, through-hole pattern, or beam network.
3. Resolve unions and differences with the Manifold geometry kernel.
4. Apply smooth closed sport ribbons, baseball stitches, and optional
   text/logo marking as real mesh operations.
5. Convert the result to one indexed triangle mesh.
6. Verify that every edge belongs to exactly two triangles.
7. Export binary STL or a packaged, color-aware 3MF model.

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

- Free-form seam editor
- Higher-resolution vector tracing for imported SVG patterns
- Split/multi-material export
- Minimum-thickness heat map
- Reusable geometry presets
- Signed and notarized release installers
