import {
  useCallback,
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
  activatePlanLocally,
  hasWorkspaceAccess,
  loadAccount,
  loadUsage,
  recordExport,
  recordGeneration,
  registerLocally,
  signInLocally,
  signOutLocally,
  type AccountSession,
  type UsageState,
} from "./account/store";
import { planById } from "./account/plans";
import {
  AccessPortal,
  type AuthMode,
} from "./components/AccessPortal";
import { AuthDialog } from "./components/AuthDialog";
import {
  BallViewport,
  type BallViewportHandle,
} from "./components/BallViewport";
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
import {
  SettingsPanel,
  type SettingsTab,
} from "./components/SettingsPanel";
import { StandControls } from "./components/StandControls";
import { TemplatePicker } from "./components/TemplatePicker";
import { saveGeneratedBall, type ExportFormat } from "./geometry/exporters";
import {
  DEFAULT_PARAMETERS,
  type BallMode,
  type BallParameters,
  type BallPattern,
  type ColorMode,
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

const COLOR_MODE_OPTIONS: Array<{ value: ColorMode; label: string }> = [
  { value: "single", label: "One color" },
  { value: "multi", label: "Multicolor" },
];

const SEAM_OPTIONS: Array<{ value: SeamPattern; label: string }> = [
  { value: "none", label: "None" },
  { value: "custom", label: "Custom" },
  { value: "tennis", label: "Tennis" },
  { value: "football", label: "Football" },
  { value: "basketball", label: "Basketball" },
  { value: "volleyball", label: "Volleyball" },
  { value: "baseball", label: "Baseball" },
  { value: "rugby", label: "Rugby" },
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
  const viewportRef = useRef<BallViewportHandle>(null);
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
  const [account, setAccount] = useState<AccountSession | null>(() =>
    loadAccount(),
  );
  const [projects, setProjects] = useState<SavedProject[]>(() =>
    loadProjects(loadAccount()?.id),
  );
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Untitled ball");
  const [lastSavedHash, setLastSavedHash] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [settingsInitialTab, setSettingsInitialTab] =
    useState<SettingsTab>("appearance");
  const [appearance, setAppearance] = useState<AppearanceSettings>(() =>
    loadAppearance(),
  );
  const [usage, setUsage] = useState<UsageState>(() =>
    loadUsage(loadAccount()?.id),
  );
  const lastCountedBall = useRef<typeof ball>(null);

  const dirty =
    lastSavedHash === null || lastSavedHash !== parametersHash(parameters);
  const workspaceAccess = hasWorkspaceAccess(account);
  const activePlan = account ? planById(account.plan) : null;
  const projectLimit = account?.isAdmin
    ? null
    : (activePlan?.projectLimit ?? 0);
  const exportLimit = account?.isAdmin
    ? null
    : (activePlan?.exportLimit ?? 0);
  const projectLimitReached =
    projectLimit !== null && projects.length >= projectLimit;
  const exportLimitReached =
    exportLimit !== null && usage.exports >= exportLimit;

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
    if (
      !ball ||
      !account ||
      !workspaceAccess ||
      ball === lastCountedBall.current
    ) {
      return;
    }
    lastCountedBall.current = ball;
    setUsage(recordGeneration(account.id));
  }, [account, ball, workspaceAccess]);

  const update = useCallback(
    <Key extends keyof BallParameters>(
      key: Key,
      value: BallParameters[Key],
    ) => {
      setParameters((current) => ({ ...current, [key]: value }));
    },
    [],
  );

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

  const openAuth = (mode: AuthMode) => {
    setAuthMode(mode);
    setShowAuth(true);
  };

  const authenticate = async (
    mode: AuthMode,
    email: string,
    password: string,
  ) => {
    const session =
      mode === "register"
        ? await registerLocally(email, password)
        : await signInLocally(email, password);
    setAccount(session);
    setProjects(loadProjects(session.id));
    setUsage(loadUsage(session.id));
    setShowAuth(false);
    setNotice(
      mode === "register"
        ? "Account created. Enter your access code to continue."
        : `Welcome back, ${session.name}.`,
    );
    return session;
  };

  const signOut = () => {
    signOutLocally();
    setAccount(null);
    setProjects([]);
    setUsage(loadUsage());
    setView("projects");
    setShowSettings(false);
    setNotice("Signed out.");
  };

  const activatePlan = (code: string) => {
    if (!account) {
      openAuth("signin");
      return;
    }
    try {
      const updated = activatePlanLocally(account, code);
      setAccount(updated);
      setUsage(loadUsage(updated.id));
      const definition = planById(updated.plan);
      setNotice(
        definition
          ? `${definition.name} access activated.`
          : "AirLab access activated.",
      );
    } catch (activationError) {
      setNotice(
        activationError instanceof Error
          ? activationError.message
          : String(activationError),
      );
    }
  };

  const openSettings = (tab: SettingsTab = "appearance") => {
    setSettingsInitialTab(tab);
    setShowSettings(true);
  };

  const selectTemplate = (template: BallTemplateDefinition) => {
    const next = parametersForTemplate(template, appearance.defaultBallColor);
    setParameters(next);
    setCurrentProjectId(null);
    setProjectName(
      template.id === "stand"
        ? "Untitled ball stand"
        : `Untitled ${template.name.toLowerCase()} ball`,
    );
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
    if (!account) return;
    if (!currentProjectId && projectLimitReached) {
      setShowSaveDialog(false);
      setNotice(
        `${activePlan?.name ?? "Your"} plan allows ${projectLimit} saved ${
          projectLimit === 1 ? "project" : "projects"
        }.`,
      );
      return;
    }
    const result = upsertProject(
      account.id,
      projects,
      name,
      parameters,
      currentProjectId,
      viewportRef.current?.captureThumbnail() ?? null,
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
    else if (projectLimitReached) {
      setNotice(
        `${activePlan?.name ?? "Your"} plan has reached its saved-project limit.`,
      );
    } else {
      setShowSaveDialog(true);
    }
  };

  const duplicateProject = (project: SavedProject) => {
    if (!account) return;
    if (projectLimitReached) {
      setNotice(
        `${activePlan?.name ?? "Your"} plan has reached its saved-project limit.`,
      );
      return;
    }
    const result = upsertProject(
      account.id,
      projects,
      `${project.name} copy`,
      project.parameters,
      null,
      project.thumbnail,
    );
    setProjects(result.projects);
    setNotice(`Created “${result.project.name}”.`);
  };

  const deleteProject = (id: string) => {
    if (!account) return;
    const project = projects.find((candidate) => candidate.id === id);
    if (
      project &&
      !window.confirm(`Delete “${project.name}” from your saved projects?`)
    ) {
      return;
    }
    setProjects((current) => removeProject(account.id, current, id));
    if (id === currentProjectId) {
      setCurrentProjectId(null);
      setLastSavedHash(null);
    }
    setNotice("Project deleted.");
  };

  const exportBall = async (format: ExportFormat) => {
    if (!ball || state !== "ready" || !account) return;
    if (exportLimitReached) {
      setNotice(
        `${activePlan?.name ?? "Your"} plan has reached its monthly export limit.`,
      );
      return;
    }
    setExporting(format);
    setNotice(null);
    try {
      const saved = await saveGeneratedBall(
        ball,
        format,
        parameters.designKind === "stand" ? "stand" : "ball",
      );
      if (saved) {
        setUsage(recordExport(account.id));
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

  if (!workspaceAccess) {
    return (
      <div className="app-shell access-shell" style={themeStyle}>
        <AccessPortal
          account={account}
          onActivate={activatePlan}
          onOpenAuth={openAuth}
          onSignOut={signOut}
        />
        {showAuth ? (
          <AuthDialog
            initialMode={authMode}
            onClose={() => setShowAuth(false)}
            onSubmit={authenticate}
          />
        ) : null}
        {notice ? <div className="toast">{notice}</div> : null}
      </div>
    );
  }

  const accountButton = (
    <button
      className="account-button"
      onClick={() => (account ? openSettings("account") : openAuth("signin"))}
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
          <button
            onClick={() => openSettings("subscription")}
            type="button"
          >
            Available plans
          </button>
        </nav>
        <div>
          <button
            aria-label="Open settings"
            className="icon-action"
            onClick={() => openSettings()}
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
                onClick={() => openSettings()}
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
                  <span>Model colors</span>
                </div>
                <SegmentedControl
                  onChange={(colorMode) => update("colorMode", colorMode)}
                  options={COLOR_MODE_OPTIONS}
                  value={parameters.colorMode}
                />
                <div
                  className={`model-color-grid ${
                    parameters.designKind === "stand" ? "stand-colors" : ""
                  } ${parameters.colorMode === "single" ? "single-color" : ""}`}
                >
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
                      <strong>
                        {parameters.designKind === "stand" ? "Stand" : "Ball"}
                      </strong>
                      <small>{parameters.ballColor.toUpperCase()}</small>
                    </span>
                  </label>
                  {parameters.designKind === "ball" &&
                  parameters.colorMode === "multi" ? (
                    <label>
                      <input
                        aria-label="Bands and frame color"
                        onChange={(event) =>
                          update("detailColor", event.target.value)
                        }
                        type="color"
                        value={parameters.detailColor}
                      />
                      <span>
                        <strong>Bands</strong>
                        <small>{parameters.detailColor.toUpperCase()}</small>
                      </span>
                    </label>
                  ) : null}
                  {parameters.colorMode === "multi" ? (
                    <label>
                      <input
                        aria-label="Text and logo color"
                        onChange={(event) =>
                          update("markingColor", event.target.value)
                        }
                        type="color"
                        value={parameters.markingColor}
                      />
                      <span>
                        <strong>
                          {parameters.designKind === "stand"
                            ? "Text"
                            : "Text/logo"}
                        </strong>
                        <small>{parameters.markingColor.toUpperCase()}</small>
                      </span>
                    </label>
                  ) : null}
                </div>
                <p>
                  {parameters.colorMode === "single"
                    ? "One material for straightforward TPU printing."
                    : "3MF keeps separate ball, band and marking colors."}
                  {" STL stores geometry only."}
                </p>
              </section>

              {parameters.designKind === "stand" ? (
                <StandControls parameters={parameters} onUpdate={update} />
              ) : (
                <>
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
                  label={parameters.shape === "rugby" ? "Length" : "Diameter"}
                  max={240}
                  min={20}
                  onChange={(value) => update("diameter", value)}
                  step={1}
                  unit="mm"
                  value={parameters.diameter}
                />
                {parameters.shape === "rugby" ? (
                  <RangeField
                    displayValue={`1:${formatNumber(
                      parameters.rugbyAspectRatio,
                      2,
                    )}`}
                    hint={`≈ ${formatNumber(
                      parameters.diameter / parameters.rugbyAspectRatio,
                      1,
                    )} mm wide`}
                    label="Length ratio"
                    max={1.8}
                    min={1.2}
                    onChange={(value) =>
                      update("rugbyAspectRatio", value)
                    }
                    step={0.01}
                    value={parameters.rugbyAspectRatio}
                  />
                ) : null}
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

              <section className="panel-section parameter-stack">
                <div className="section-label">
                  <span>Keychain</span>
                  <HelpTooltip label="Keychain loop">
                    <p>
                      Adds a printable loop directly to the outside of the
                      finished model. The ball size itself stays unchanged.
                    </p>
                    <p>
                      Surface offset sinks the loop into the ball or moves it
                      outward. Rotation turns its plane around the attachment
                      axis, while profile roundness changes the loop from a
                      square to a circular cross-section.
                    </p>
                  </HelpTooltip>
                </div>
                <SegmentedControl
                  onChange={(value) =>
                    update("keychainEnabled", value === "on")
                  }
                  options={[
                    { value: "off", label: "Off" },
                    { value: "on", label: "Add loop" },
                  ]}
                  value={parameters.keychainEnabled ? "on" : "off"}
                />
                {parameters.keychainEnabled ? (
                  <div className="sub-control keychain-controls">
                    <RangeField
                      label="Loop diameter"
                      max={24}
                      min={6}
                      onChange={(value) =>
                        update("keychainOuterDiameter", value)
                      }
                      step={0.5}
                      unit="mm"
                      value={parameters.keychainOuterDiameter}
                    />
                    <RangeField
                      label="Hole diameter"
                      max={Math.max(
                        3,
                        parameters.keychainOuterDiameter - 2,
                      )}
                      min={2.5}
                      onChange={(value) =>
                        update("keychainHoleDiameter", value)
                      }
                      step={0.5}
                      unit="mm"
                      value={Math.min(
                        parameters.keychainHoleDiameter,
                        parameters.keychainOuterDiameter - 2,
                      )}
                    />
                    <RangeField
                      hint="negative sinks it into the ball"
                      label="Surface offset"
                      max={Math.max(
                        0.2,
                        ((parameters.keychainOuterDiameter -
                          parameters.keychainHoleDiameter) /
                          2) *
                          0.32,
                      )}
                      min={-Math.min(
                        8,
                        parameters.keychainOuterDiameter * 0.55,
                      )}
                      onChange={(value) =>
                        update("keychainSurfaceOffset", value)
                      }
                      step={0.1}
                      unit="mm"
                      value={parameters.keychainSurfaceOffset}
                    />
                    <RangeField
                      hint="square to circular cross-section"
                      label="Profile roundness"
                      max={100}
                      min={0}
                      onChange={(value) =>
                        update("keychainRoundness", value)
                      }
                      step={1}
                      unit="%"
                      value={parameters.keychainRoundness}
                    />
                    <RangeField
                      hint="around the attachment axis"
                      label="Loop rotation"
                      max={180}
                      min={-180}
                      onChange={(value) =>
                        update("keychainRotation", value)
                      }
                      step={1}
                      unit="°"
                      value={parameters.keychainRotation}
                    />
                  </div>
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
                      {parameters.seamPattern === "baseball" ? (
                        <>
                          <RangeField
                            label="Stitch density"
                            max={96}
                            min={18}
                            onChange={(value) =>
                              update("baseballStitchDensity", value)
                            }
                            step={1}
                            value={parameters.baseballStitchDensity}
                          />
                          <RangeField
                            label="Stitch thickness"
                            max={2}
                            min={0.3}
                            onChange={(value) =>
                              update("baseballStitchThickness", value)
                            }
                            step={0.1}
                            unit="mm"
                            value={parameters.baseballStitchThickness}
                          />
                        </>
                      ) : null}
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
                </>
              )}

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
              <BallViewport
                accentColor={parameters.ballColor}
                ball={ball}
                ref={viewportRef}
              />
              <div className="stage-heading">
                <span>{template.name}</span>
                <strong>
                  {parameters.designKind === "stand" ? (
                    <>
                      {parameters.standBaseShape} stand · {parameters.standBaseSize} mm
                    </>
                  ) : (
                    <>
                      {MODE_OPTIONS.find(
                        (option) => option.value === parameters.mode,
                      )?.label}{" "}
                      · {parameters.diameter} mm
                    </>
                  )}
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
                  <span>
                    {parameters.designKind === "stand"
                      ? "Base size"
                      : parameters.shape === "rugby"
                        ? "Length"
                        : "Diameter"}
                  </span>
                  <strong>
                    {parameters.designKind === "stand"
                      ? parameters.standBaseSize
                      : parameters.diameter}{" "}
                    mm
                  </strong>
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
                {parameters.designKind === "stand" ? (
                  <>
                    <div className="metric-row">
                      <span>Ball diameter</span>
                      <strong>{parameters.standBallDiameter} mm</strong>
                    </div>
                    <div className="metric-row">
                      <span>Socket depth</span>
                      <strong>{parameters.standSocketDepth} mm</strong>
                    </div>
                  </>
                ) : null}
                {parameters.designKind === "ball" &&
                (parameters.mode === "shell" ||
                  parameters.mode === "perforated") && (
                  <div className="metric-row">
                    <span>Wall thickness</span>
                    <strong>{parameters.wallThickness} mm</strong>
                  </div>
                )}
                {parameters.designKind === "ball" &&
                parameters.seamPattern !== "none" ? (
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
                    {parameters.designKind === "stand"
                      ? "The spherical socket and front label are included in the closed export mesh."
                      : "Sport seams and branding are included in the closed export mesh."}
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
          initialTab={settingsInitialTab}
          onActivate={activatePlan}
          onAppearanceChange={setAppearance}
          onClose={() => setShowSettings(false)}
          onSignIn={() => {
            setShowSettings(false);
            openAuth("signin");
          }}
          onSignOut={signOut}
          projectCount={projects.length}
          usage={usage}
        />
      )}

      {showAuth && (
        <AuthDialog
          initialMode={authMode}
          onClose={() => setShowAuth(false)}
          onSubmit={authenticate}
        />
      )}

      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

export default App;
