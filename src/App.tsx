import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  AlertTriangle,
  CircleDot,
  Download,
  FileBox,
  FolderOpen,
  Gauge,
  Grid3X3,
  Hexagon,
  Loader2,
  Palette,
  Plus,
  Ruler,
  Save,
  Sparkles,
  Triangle,
} from "lucide-react";
import { AppearancePanel } from "./components/AppearancePanel";
import { BallViewport } from "./components/BallViewport";
import { RangeField, SegmentedControl } from "./components/Controls";
import { HelpTooltip } from "./components/HelpTooltip";
import { ProjectLibrary } from "./components/ProjectLibrary";
import { SaveProjectDialog } from "./components/SaveProjectDialog";
import { saveGeneratedBall, type ExportFormat } from "./geometry/exporters";
import {
  DEFAULT_PARAMETERS,
  type BallMode,
  type BallParameters,
  type BallPattern,
  type MeshQuality,
  type SurfaceEffect,
} from "./geometry/types";
import { useBallGenerator } from "./hooks/useBallGenerator";
import {
  loadAppearance,
  loadProjects,
  removeProject,
  saveAppearance,
  upsertProject,
  type AppearanceSettings,
  type SavedProject,
} from "./projects/store";

const MODE_OPTIONS: Array<{ value: BallMode; label: string }> = [
  { value: "solid", label: "Solid" },
  { value: "shell", label: "Hollow shell" },
  { value: "perforated", label: "Perforated" },
  { value: "lattice", label: "Airless lattice" },
];

const formatNumber = (value: number, digits = 1) =>
  new Intl.NumberFormat(undefined, {
    maximumFractionDigits: digits,
  }).format(value);

const fileSizeEstimate = (triangles: number) => 84 + triangles * 50;

const formatBytes = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const parametersHash = (parameters: BallParameters) =>
  JSON.stringify(parameters);

const accentTextColor = (hex: string) => {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return "#ffffff";
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 255_000;
  return luminance > 0.58 ? "#171a15" : "#ffffff";
};

function App() {
  const [parameters, setParameters] = useState<BallParameters>({
    ...DEFAULT_PARAMETERS,
  });
  const { ball, state, error } = useBallGenerator(parameters);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [projects, setProjects] = useState<SavedProject[]>(() =>
    loadProjects(),
  );
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Untitled ball");
  const [lastSavedHash, setLastSavedHash] = useState<string | null>(null);
  const [showProjects, setShowProjects] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showAppearance, setShowAppearance] = useState(false);
  const [appearance, setAppearance] = useState<AppearanceSettings>(() =>
    loadAppearance(),
  );

  const dirty =
    lastSavedHash === null || lastSavedHash !== parametersHash(parameters);

  const themeStyle = {
    "--interface": appearance.interfaceColor,
    "--text": appearance.textColor,
    "--muted": appearance.mutedTextColor,
    "--accent": appearance.accentColor,
    "--accent-text": accentTextColor(appearance.accentColor),
  } as CSSProperties;

  useEffect(() => {
    saveAppearance(appearance);
  }, [appearance]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 3_500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const update = <Key extends keyof BallParameters>(
    key: Key,
    value: BallParameters[Key],
  ) => {
    setParameters((current) => ({ ...current, [key]: value }));
  };

  const setMode = (mode: BallMode) => {
    setParameters((current) => ({
      ...current,
      mode,
      pattern:
        mode === "lattice" &&
        (current.pattern === "dots" || current.pattern === "spikes")
          ? "hexagons"
          : current.pattern,
    }));
  };

  const createProject = () => {
    setParameters({ ...DEFAULT_PARAMETERS });
    setCurrentProjectId(null);
    setProjectName("Untitled ball");
    setLastSavedHash(null);
    setShowProjects(false);
    setNotice("New ball created.");
  };

  const openProject = (project: SavedProject) => {
    setParameters({ ...project.parameters });
    setCurrentProjectId(project.id);
    setProjectName(project.name);
    setLastSavedHash(parametersHash(project.parameters));
    setShowProjects(false);
    setNotice(`Opened “${project.name}”.`);
  };

  const saveProject = (name = projectName) => {
    const result = upsertProject(
      projects,
      name,
      parameters,
      currentProjectId,
    );
    setProjects(result.projects);
    setCurrentProjectId(result.project.id);
    setProjectName(result.project.name);
    setLastSavedHash(parametersHash(result.project.parameters));
    setShowSaveDialog(false);
    setNotice(`Saved “${result.project.name}”.`);
  };

  const requestSave = () => {
    if (currentProjectId) {
      saveProject();
    } else {
      setShowSaveDialog(true);
    }
  };

  const duplicateProject = (project: SavedProject) => {
    const result = upsertProject(
      projects,
      `${project.name} copy`,
      project.parameters,
    );
    setProjects(result.projects);
    setNotice(`Created “${result.project.name}”.`);
  };

  const deleteProject = (id: string) => {
    const project = projects.find((candidate) => candidate.id === id);
    if (
      project &&
      !window.confirm(`Delete “${project.name}” from your saved projects?`)
    ) {
      return;
    }
    setProjects((current) => removeProject(current, id));
    if (id === currentProjectId) {
      setCurrentProjectId(null);
      setLastSavedHash(null);
    }
    setNotice("Project deleted.");
  };

  const exportBall = async (format: ExportFormat) => {
    if (!ball || state !== "ready") return;
    setExporting(format);
    setNotice(null);
    try {
      const saved = await saveGeneratedBall(ball, format);
      if (saved) setNotice(`${format.toUpperCase()} exported successfully.`);
    } catch (saveError) {
      setNotice(
        saveError instanceof Error ? saveError.message : String(saveError),
      );
    } finally {
      setExporting(null);
    }
  };

  const patternOptions = useMemo(
    () => [
      {
        value: "triangles" as BallPattern,
        label: "Triangles",
        icon: <Triangle size={16} />,
      },
      {
        value: "hexagons" as BallPattern,
        label: "Hexagons",
        icon: <Hexagon size={16} />,
      },
      {
        value: "dots" as BallPattern,
        label: "Dots",
        icon: <CircleDot size={16} />,
        disabled: parameters.mode === "lattice",
      },
      {
        value: "spikes" as BallPattern,
        label: "Spikes",
        icon: <Sparkles size={16} />,
        disabled: parameters.mode === "lattice",
      },
    ],
    [parameters.mode],
  );

  const stats = ball?.stats;
  const featureLabel =
    parameters.mode === "lattice"
      ? "Strut diameter"
      : parameters.mode === "perforated"
        ? "Rib width"
        : "Feature width";

  return (
    <div className="app-shell" style={themeStyle}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true" />
          <strong>AirLab</strong>
        </div>

        <nav className="project-actions" aria-label="Project actions">
          <button onClick={() => setShowProjects(true)} type="button">
            <FolderOpen size={16} />
            Projects
          </button>
          <button onClick={createProject} type="button">
            <Plus size={16} />
            New
          </button>
          <button
            className="project-title"
            onClick={() => setShowSaveDialog(true)}
            title="Name or rename this project"
            type="button"
          >
            <span>{projectName}</span>
            {dirty ? <i>Unsaved</i> : <i>Saved</i>}
          </button>
          <button onClick={requestSave} type="button">
            <Save size={16} />
            Save
          </button>
          <button
            aria-label="Customize appearance"
            className={showAppearance ? "is-active" : ""}
            onClick={() => setShowAppearance((visible) => !visible)}
            title="Customize appearance"
            type="button"
          >
            <Palette size={17} />
          </button>
        </nav>

        <div className="export-actions">
          <button
            className="secondary-action"
            disabled={!ball || state !== "ready" || exporting !== null}
            onClick={() => exportBall("3mf")}
            type="button"
          >
            {exporting === "3mf" ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <FileBox size={16} />
            )}
            3MF
          </button>
          <button
            className="primary-action"
            disabled={!ball || state !== "ready" || exporting !== null}
            onClick={() => exportBall("stl")}
            type="button"
          >
            {exporting === "stl" ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <Download size={16} />
            )}
            Export STL
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="control-panel">
          <section className="panel-section">
            <div className="section-label">
              <span>Structure</span>
              <HelpTooltip label="Structure">
                <p>
                  <b>Solid</b> creates a completely filled ball.
                </p>
                <p>
                  <b>Hollow shell</b> creates a closed ball with a controlled
                  wall thickness.
                </p>
                <p>
                  <b>Perforated</b> cuts the selected pattern through a hollow
                  shell.
                </p>
                <p>
                  <b>Airless lattice</b> builds an open network of printable
                  struts.
                </p>
              </HelpTooltip>
            </div>
            <SegmentedControl
              columns={2}
              onChange={setMode}
              options={MODE_OPTIONS}
              value={parameters.mode}
            />
          </section>

          <section className="panel-section">
            <div className="section-label">
              <span>Surface pattern</span>
              <HelpTooltip label="Surface pattern">
                <p>
                  Triangles and hexagons distribute connected panels around the
                  sphere.
                </p>
                <p>
                  Dots create smooth round dimples or bumps. Spikes create
                  taller massage features.
                </p>
                <p>
                  Use <b>Raised</b> to add material or <b>Grooved</b> to cut
                  into the surface.
                </p>
              </HelpTooltip>
            </div>
            <SegmentedControl
              columns={2}
              onChange={(pattern) => update("pattern", pattern)}
              options={patternOptions}
              value={parameters.pattern}
            />
            {(parameters.mode === "solid" || parameters.mode === "shell") && (
              <div className="sub-control">
                <span className="mini-label">Operation</span>
                <SegmentedControl
                  onChange={(effect: SurfaceEffect) =>
                    update("effect", effect)
                  }
                  options={[
                    { value: "raised", label: "Raised" },
                    { value: "grooved", label: "Grooved" },
                  ]}
                  value={parameters.effect}
                />
              </div>
            )}
          </section>

          <section className="panel-section parameter-stack">
            <div className="section-label">
              <span>Dimensions</span>
            </div>
            <RangeField
              label="Outer diameter"
              max={200}
              min={20}
              onChange={(value) => update("diameter", value)}
              step={1}
              unit="mm"
              value={parameters.diameter}
            />
            {(parameters.mode === "shell" ||
              parameters.mode === "perforated") && (
              <RangeField
                hint="radial"
                label="Wall thickness"
                max={8}
                min={0.6}
                onChange={(value) => update("wallThickness", value)}
                step={0.1}
                unit="mm"
                value={parameters.wallThickness}
              />
            )}
            <RangeField
              label={featureLabel}
              max={10}
              min={0.6}
              onChange={(value) => update("featureWidth", value)}
              step={0.1}
              unit="mm"
              value={parameters.featureWidth}
            />
            {(parameters.mode === "solid" || parameters.mode === "shell") && (
              <RangeField
                label={
                  parameters.effect === "raised"
                    ? "Relief height"
                    : "Groove depth"
                }
                max={8}
                min={0.2}
                onChange={(value) => update("featureHeight", value)}
                step={0.1}
                unit="mm"
                value={parameters.featureHeight}
              />
            )}
            <RangeField
              hint="topology"
              label="Pattern density"
              max={3}
              min={1}
              onChange={(value) => update("density", value)}
              step={1}
              value={parameters.density}
            />
          </section>

          <section className="panel-section">
            <div className="section-label">
              <span>Mesh quality</span>
            </div>
            <SegmentedControl
              onChange={(quality: MeshQuality) => update("quality", quality)}
              options={[
                { value: "draft", label: "Draft" },
                { value: "standard", label: "Standard" },
                { value: "fine", label: "Fine" },
              ]}
              value={parameters.quality}
            />
          </section>
        </aside>

        <section className="stage">
          <BallViewport accentColor={appearance.accentColor} ball={ball} />
          <div className="stage-heading">
            <span>Live preview</span>
            <strong>
              {MODE_OPTIONS.find((option) => option.value === parameters.mode)
                ?.label}{" "}
              · {parameters.diameter} mm
            </strong>
          </div>
          <div className="viewport-help">
            Drag to orbit <i /> Scroll to zoom
          </div>
          {state === "building" && (
            <div className="build-overlay">
              <div className="build-pulse">
                <Loader2 className="spin" size={22} />
              </div>
              <span>Updating preview</span>
            </div>
          )}
          {error && (
            <div className="error-card">
              <AlertTriangle size={18} />
              <div>
                <strong>Couldn’t build this combination</strong>
                <span>{error}</span>
              </div>
            </div>
          )}
        </section>

        <aside className="metrics-panel">
          <section className="metric-group">
            <div className="metric-title">
              <Ruler size={16} />
              Dimensions
            </div>
            <div className="metric-row">
              <span>Outer diameter</span>
              <strong>{parameters.diameter} mm</strong>
            </div>
            <div className="metric-row">
              <span>Bounding size</span>
              <strong>
                {stats
                  ? stats.dimensions
                      .map((value) => formatNumber(value, 1))
                      .join(" × ")
                  : "—"}
              </strong>
            </div>
            {(parameters.mode === "shell" ||
              parameters.mode === "perforated") && (
              <div className="metric-row">
                <span>Wall thickness</span>
                <strong>{parameters.wallThickness} mm</strong>
              </div>
            )}
            <div className="metric-row">
              <span>{featureLabel}</span>
              <strong>{parameters.featureWidth} mm</strong>
            </div>
            <div className="metric-row">
              <span>Volume</span>
              <strong>
                {stats ? `${formatNumber(stats.volume, 0)} mm³` : "—"}
              </strong>
            </div>
            <div className="metric-row">
              <span>Surface area</span>
              <strong>
                {stats ? `${formatNumber(stats.surfaceArea, 0)} mm²` : "—"}
              </strong>
            </div>
            <div className="metric-row">
              <span>STL estimate</span>
              <strong>
                {stats ? formatBytes(fileSizeEstimate(stats.triangles)) : "—"}
              </strong>
            </div>
          </section>

          <section className="quality-note">
            <Gauge size={16} />
            <div>
              <strong>{parameters.quality} preview</strong>
              <span>
                Export uses the same closed manufacturing geometry shown here.
              </span>
            </div>
          </section>
        </aside>
      </main>

      {showProjects && (
        <ProjectLibrary
          currentProjectId={currentProjectId}
          onClose={() => setShowProjects(false)}
          onCreate={createProject}
          onDelete={deleteProject}
          onDuplicate={duplicateProject}
          onOpen={openProject}
          projects={projects}
        />
      )}

      {showSaveDialog && (
        <SaveProjectDialog
          initialName={projectName}
          onCancel={() => setShowSaveDialog(false)}
          onSave={saveProject}
        />
      )}

      {showAppearance && (
        <AppearancePanel
          appearance={appearance}
          onChange={setAppearance}
          onClose={() => setShowAppearance(false)}
        />
      )}

      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

export default App;
