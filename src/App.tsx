import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Circle,
  CircleDot,
  Download,
  FileBox,
  Gauge,
  Hexagon,
  Loader2,
  Ruler,
  Save,
  Settings,
  Sparkles,
  Triangle,
  UserRound,
} from "lucide-react";
import {
  loadAccount,
  loadUsage,
  recordExport,
  recordGeneration,
  signInLocally,
  signOutLocally,
  type AccountSession,
  type UsageState,
} from "./account/store";
import { AuthDialog } from "./components/AuthDialog";
import { BallViewport } from "./components/BallViewport";
import { BrandLogo } from "./components/BrandLogo";
import { RangeField, SegmentedControl } from "./components/Controls";
import {
  createCustomBand,
  CustomBandControls,
} from "./components/CustomBandControls";
import { HelpTooltip } from "./components/HelpTooltip";
import { MarkingControls } from "./components/MarkingControls";
import { ProjectDashboard } from "./components/ProjectDashboard";
import { SaveProjectDialog } from "./components/SaveProjectDialog";
import { SettingsPanel } from "./components/SettingsPanel";
import { TemplatePicker } from "./components/TemplatePicker";
import { saveGeneratedBall, type ExportFormat } from "./geometry/exporters";
import {
  DEFAULT_PARAMETERS,
  type BallMode,
  type BallParameters,
  type BallPattern,
  type MeshQuality,
  type SeamProfile,
  type SeamPattern,
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
import {
  parametersForTemplate,
  templateById,
  type BallTemplateDefinition,
} from "./projects/templates";

type AppView = "projects" | "templates" | "editor";

const MODE_OPTIONS: Array<{ value: BallMode; label: string }> = [
  { value: "solid", label: "Solid" },
  { value: "shell", label: "Hollow shell" },
  { value: "perforated", label: "Perforated" },
  { value: "lattice", label: "Airless lattice" },
];

const SEAM_OPTIONS: Array<{ value: SeamPattern; label: string }> = [
  { value: "none", label: "None" },
  { value: "custom", label: "Custom" },
  { value: "tennis", label: "Tennis" },
  { value: "football", label: "Football" },
  { value: "basketball", label: "Basketball" },
  { value: "volleyball", label: "Volleyball" },
  { value: "baseball", label: "Baseball" },
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
  const [view, setView] = useState<AppView>("projects");
  const [parameters, setParameters] = useState<BallParameters>({
    ...DEFAULT_PARAMETERS,
  });
  const { ball, state, error } = useBallGenerator(
    parameters,
    view === "editor",
  );
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [projects, setProjects] = useState<SavedProject[]>(() =>
    loadProjects(),
  );
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Untitled ball");
  const [lastSavedHash, setLastSavedHash] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [appearance, setAppearance] = useState<AppearanceSettings>(() =>
    loadAppearance(),
  );
  const [account, setAccount] = useState<AccountSession | null>(() =>
    loadAccount(),
  );
  const [usage, setUsage] = useState<UsageState>(() => loadUsage());
  const lastCountedBall = useRef<typeof ball>(null);

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

  useEffect(() => {
    if (!ball || ball === lastCountedBall.current) return;
    lastCountedBall.current = ball;
    setUsage(recordGeneration());
  }, [ball]);

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
        (current.pattern === "none" ||
          current.pattern === "dots" ||
          current.pattern === "spikes")
          ? "hexagons"
          : mode === "perforated" && current.pattern === "none"
            ? "dots"
            : current.pattern,
    }));
  };

  const setPattern = (pattern: BallPattern) => {
    setParameters((current) => {
      const isPolygon =
        pattern === "hexagons" || pattern === "triangles";
      const wasPolygon =
        current.pattern === "hexagons" ||
        current.pattern === "triangles";
      if (!isPolygon || wasPolygon) {
        return { ...current, pattern };
      }
      return {
        ...current,
        pattern,
        featureWidth: current.diameter >= 90 ? 1.3 : 1.1,
        cellFrequency: current.diameter >= 90 ? 8 : 6,
      };
    });
  };

  const setSeamPattern = (seamPattern: SeamPattern) => {
    setParameters((current) => ({
      ...current,
      seamPattern,
      customBands:
        seamPattern === "custom" && current.customBands.length === 0
          ? [createCustomBand()]
          : current.customBands,
    }));
  };

  const selectTemplate = (template: BallTemplateDefinition) => {
    const next = parametersForTemplate(template, appearance.defaultBallColor);
    setParameters(next);
    setCurrentProjectId(null);
    setProjectName(`Untitled ${template.name.toLowerCase()} ball`);
    setLastSavedHash(null);
    setView("editor");
    setNotice(`${template.name} template opened.`);
  };

  const openProject = (project: SavedProject) => {
    setParameters({ ...project.parameters });
    setCurrentProjectId(project.id);
    setProjectName(project.name);
    setLastSavedHash(parametersHash(project.parameters));
    setView("editor");
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
    if (currentProjectId) saveProject();
    else setShowSaveDialog(true);
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
      if (saved) {
        setUsage(recordExport());
        setNotice(`${format.toUpperCase()} exported successfully.`);
      }
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
        value: "none" as BallPattern,
        label: "None",
        icon: <Circle size={15} />,
        disabled:
          parameters.mode === "lattice" || parameters.mode === "perforated",
      },
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
        label: parameters.mode === "perforated" ? "Circles" : "Dots",
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
  const hasPolygonPattern =
    parameters.pattern === "hexagons" ||
    parameters.pattern === "triangles";
  const fixedFootballPanels =
    parameters.seamPattern === "football" && hasPolygonPattern;
  const polygonCellCount =
    parameters.pattern === "triangles"
      ? 20 * parameters.cellFrequency ** 2
      : fixedFootballPanels
        ? 32
        : 10 * parameters.cellFrequency ** 2 + 2;
  const approximateCellSize = Math.sqrt(
    (Math.PI * parameters.diameter ** 2) /
      Math.max(1, polygonCellCount),
  );
  const pointFrequency =
    parameters.mode === "perforated"
      ? 2 ** Math.max(1, parameters.density)
      : parameters.density + 1;
  const pointFeatureCount = 10 * pointFrequency ** 2 + 2;
  const featureLabel =
    parameters.mode === "lattice"
      ? "Strut thickness"
      : parameters.mode === "perforated"
        ? parameters.pattern === "dots"
          ? "Hole diameter"
          : "Rib thickness"
        : parameters.pattern === "triangles" ||
            parameters.pattern === "hexagons"
          ? "Cell gap"
          : "Feature width";
  const template = templateById(parameters.template);

  const accountButton = (
    <button
      className="account-button"
      onClick={() => (account ? setShowSettings(true) : setShowAuth(true))}
      type="button"
    >
      {account ? (
        <span>{account.name.slice(0, 1).toUpperCase()}</span>
      ) : (
        <UserRound size={16} />
      )}
      {account ? account.name : "Sign in"}
    </button>
  );

  const globalHeader =
    view !== "editor" ? (
      <header className="home-topbar">
        <BrandLogo />
        <nav>
          <button
            className={view === "projects" ? "is-active" : ""}
            onClick={() => setView("projects")}
            type="button"
          >
            Projects
          </button>
          <button
            className={view === "templates" ? "is-active" : ""}
            onClick={() => setView("templates")}
            type="button"
          >
            Design new
          </button>
        </nav>
        <div>
          <button
            aria-label="Open settings"
            className="icon-action"
            onClick={() => setShowSettings(true)}
            title="Settings"
            type="button"
          >
            <Settings size={17} />
          </button>
          {accountButton}
        </div>
      </header>
    ) : null;

  return (
    <div className={`app-shell view-${view}`} style={themeStyle}>
      {globalHeader}

      {view === "projects" ? (
        <ProjectDashboard
          onCreate={() => setView("templates")}
          onDelete={deleteProject}
          onDuplicate={duplicateProject}
          onOpen={openProject}
          projects={projects}
        />
      ) : null}

      {view === "templates" ? (
        <TemplatePicker
          onBack={() => setView("projects")}
          onSelect={selectTemplate}
        />
      ) : null}

      {view === "editor" ? (
        <>
          <header className="topbar editor-topbar">
            <BrandLogo compact />
            <nav className="project-actions" aria-label="Project actions">
              <button onClick={() => setView("projects")} type="button">
                <ArrowLeft size={16} />
                Projects
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
                aria-label="Open settings"
                onClick={() => setShowSettings(true)}
                title="Settings"
                type="button"
              >
                <Settings size={17} />
              </button>
              {accountButton}
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
              <section className="panel-section model-color-section">
                <div className="section-label">
                  <span>Model color</span>
                </div>
                <label>
                  <input
                    aria-label="Ball color"
                    onChange={(event) =>
                      update("ballColor", event.target.value)
                    }
                    type="color"
                    value={parameters.ballColor}
                  />
                  <span>
                    <strong>Preview & 3MF color</strong>
                    <small>{parameters.ballColor.toUpperCase()}</small>
                  </span>
                </label>
                <p>STL stores geometry only; 3MF also keeps this color.</p>
              </section>

              <div className="control-group-heading">
                <strong>Ball</strong>
                <span>Structure, pattern & dimensions</span>
              </div>

              <section className="panel-section">
                <div className="section-label">
                  <span>Structure</span>
                  <HelpTooltip label="Structure">
                    <p>
                      <b>Solid</b> creates a completely filled ball.
                    </p>
                    <p>
                      <b>Hollow shell</b> creates a closed ball with controlled
                      wall thickness.
                    </p>
                    <p>
                      <b>Perforated</b> cuts triangles, hexagons or circles
                      through the shell.
                    </p>
                    <p>
                      <b>Airless lattice</b> builds an open printable network.
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
                  <span>Pattern</span>
                  <HelpTooltip label="Surface pattern">
                    <p>
                      Surface patterns may be raised, grooved, or cut through a
                      perforated shell.
                    </p>
                    <p>
                      Choose <b>None</b> for a clean sport-ball surface with
                      seams only.
                    </p>
                    <p>
                      Hexagons and triangles are generated from one shared
                      geodesic grid. Adjacent cells always use the same edge.
                    </p>
                    <p>
                      A closed hexagonal sphere necessarily includes twelve
                      pentagons. Football uses its own exact 32-panel layout.
                    </p>
                    <p>
                      For a seamless grid, diameter and cell count determine
                      the physical cell size together. The approximate size is
                      shown beside the count control.
                    </p>
                  </HelpTooltip>
                </div>
                <SegmentedControl
                  columns={2}
                  onChange={setPattern}
                  options={patternOptions}
                  value={parameters.pattern}
                />
                {parameters.pattern !== "none" &&
                  (parameters.mode === "solid" ||
                    parameters.mode === "shell") && (
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
                  label="Diameter"
                  max={240}
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
                {parameters.pattern !== "none" ? (
                  <RangeField
                    label={featureLabel}
                    max={10}
                    min={0.6}
                    onChange={(value) => update("featureWidth", value)}
                    step={0.1}
                    unit="mm"
                    value={parameters.featureWidth}
                  />
                ) : null}
                {hasPolygonPattern && !fixedFootballPanels ? (
                  <RangeField
                    displayValue={`${polygonCellCount}`}
                    hint={`≈ ${formatNumber(approximateCellSize)} mm each`}
                    label="Cell count"
                    max={8}
                    min={parameters.pattern === "hexagons" ? 2 : 1}
                    onChange={(value) => update("cellFrequency", value)}
                    step={1}
                    value={parameters.cellFrequency}
                  />
                ) : fixedFootballPanels ? (
                  <div className="read-only-parameter">
                    <span>
                      Panel count
                      <small>classic football layout</small>
                    </span>
                    <strong>32</strong>
                  </div>
                ) : null}
                {parameters.pattern !== "none" &&
                  (parameters.mode === "solid" ||
                    parameters.mode === "shell") && (
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
                {parameters.pattern !== "none" &&
                (parameters.pattern === "dots" ||
                  parameters.pattern === "spikes") ? (
                  <RangeField
                    displayValue={`${pointFeatureCount}`}
                    hint="evenly distributed"
                    label={
                      parameters.mode === "perforated"
                        ? "Hole count"
                        : "Feature count"
                    }
                    max={3}
                    min={1}
                    onChange={(value) => update("density", value)}
                    step={1}
                    value={parameters.density}
                  />
                ) : null}
              </section>

              <div className="control-group-heading">
                <strong>Bands & text</strong>
                <span>Sport lines, labels & logos</span>
              </div>

              <section className="panel-section">
                  <div className="section-label">
                    <span>
                      Sport detailing
                    </span>
                    <HelpTooltip label="Sport lines">
                      <p>
                        Add the real panel or seam layout for tennis,
                        football, basketball, volleyball, or baseball.
                      </p>
                      <p>
                        On an airless ball, <b>Inset</b> moves the structural
                        line toward the center and <b>Raised</b> moves it
                        outward. Both remain connected to the lattice.
                      </p>
                      <p>
                        Tennis and basketball include an editable curvature
                        control for changing the bend of their sport lines.
                      </p>
                      <p>
                        <b>Custom</b> lets you add up to eight closed bands and
                        position and bend every one independently.
                      </p>
                    </HelpTooltip>
                  </div>
                  <SegmentedControl
                    columns={2}
                    onChange={setSeamPattern}
                    options={SEAM_OPTIONS}
                    value={parameters.seamPattern}
                  />
                  {parameters.seamPattern !== "none" ? (
                    <div className="seam-parameters">
                      {parameters.seamPattern === "custom" ? (
                        <CustomBandControls
                          bands={parameters.customBands}
                          onChange={(customBands) =>
                            update("customBands", customBands)
                          }
                          onNotice={setNotice}
                        />
                      ) : null}
                      <span className="mini-label">Band position</span>
                      <SegmentedControl
                        onChange={(value: SurfaceEffect) =>
                          update("seamOperation", value)
                        }
                        options={[
                          { value: "grooved", label: "Inset" },
                          { value: "raised", label: "Raised" },
                        ]}
                        value={parameters.seamOperation}
                      />
                      <span className="mini-label">Band profile</span>
                      <SegmentedControl
                        onChange={(value: SeamProfile) =>
                          update("seamProfile", value)
                        }
                        options={[
                          { value: "flat", label: "Flat" },
                          { value: "rounded", label: "Rounded" },
                        ]}
                        value={parameters.seamProfile}
                      />
                      <RangeField
                        label="Band thickness"
                        max={Math.max(
                          8,
                          Math.min(36, parameters.diameter * 0.4),
                        )}
                        min={0.6}
                        onChange={(value) => update("seamWidth", value)}
                        step={0.1}
                        unit="mm"
                        value={parameters.seamWidth}
                      />
                      {parameters.seamPattern === "tennis" ||
                      parameters.seamPattern === "basketball" ? (
                        <RangeField
                          hint="shape"
                          label="Band curvature"
                          max={100}
                          min={0}
                          onChange={(value) =>
                            update("seamCurvature", value)
                          }
                          step={1}
                          unit="%"
                          value={parameters.seamCurvature}
                        />
                      ) : null}
                      <RangeField
                        label={
                          parameters.seamOperation === "raised"
                            ? "Band height"
                            : "Band depth"
                        }
                        max={4}
                        min={0.2}
                        onChange={(value) => update("seamDepth", value)}
                        step={0.1}
                        unit="mm"
                        value={parameters.seamDepth}
                      />
                    </div>
                  ) : null}
                </section>

              <MarkingControls
                onNotice={setNotice}
                onUpdate={update}
                parameters={parameters}
              />

              <section className="panel-section">
                <div className="section-label">
                  <span>Mesh quality</span>
                </div>
                <SegmentedControl
                  onChange={(quality: MeshQuality) =>
                    update("quality", quality)
                  }
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
              <BallViewport accentColor={parameters.ballColor} ball={ball} />
              <div className="stage-heading">
                <span>{template.name}</span>
                <strong>
                  {MODE_OPTIONS.find(
                    (option) => option.value === parameters.mode,
                  )?.label}{" "}
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
                  <span>Template</span>
                  <strong>{template.name}</strong>
                </div>
                <div className="metric-row">
                  <span>Diameter</span>
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
                {parameters.seamPattern !== "none" ? (
                  <div className="metric-row">
                    <span>Seams</span>
                    <strong>{parameters.seamPattern}</strong>
                  </div>
                ) : null}
                <div className="metric-row">
                  <span>Volume</span>
                  <strong>
                    {stats ? `${formatNumber(stats.volume, 0)} mm³` : "—"}
                  </strong>
                </div>
                <div className="metric-row">
                  <span>Surface area</span>
                  <strong>
                    {stats
                      ? `${formatNumber(stats.surfaceArea, 0)} mm²`
                      : "—"}
                  </strong>
                </div>
                <div className="metric-row">
                  <span>STL estimate</span>
                  <strong>
                    {stats
                      ? formatBytes(fileSizeEstimate(stats.triangles))
                      : "—"}
                  </strong>
                </div>
              </section>

              <section className="quality-note">
                <Gauge size={16} />
                <div>
                  <strong>{parameters.quality} geometry</strong>
                  <span>
                    Sport seams and branding are included in the closed export
                    mesh.
                  </span>
                </div>
              </section>
            </aside>
          </main>
        </>
      ) : null}

      {showSaveDialog && (
        <SaveProjectDialog
          initialName={projectName}
          onCancel={() => setShowSaveDialog(false)}
          onSave={saveProject}
        />
      )}

      {showSettings && (
        <SettingsPanel
          account={account}
          appearance={appearance}
          onAppearanceChange={setAppearance}
          onClose={() => setShowSettings(false)}
          onSignIn={() => {
            setShowSettings(false);
            setShowAuth(true);
          }}
          onSignOut={() => {
            signOutLocally();
            setAccount(null);
            setNotice("Signed out.");
          }}
          projectCount={projects.length}
          usage={usage}
        />
      )}

      {showAuth && (
        <AuthDialog
          onClose={() => setShowAuth(false)}
          onSubmit={(name, email) => {
            const session = signInLocally(name, email);
            setAccount(session);
            setShowAuth(false);
            setNotice(`Welcome, ${session.name}.`);
            return session;
          }}
        />
      )}

      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

export default App;
