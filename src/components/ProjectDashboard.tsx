import { Clock3, Copy, FolderOpen, Plus, Trash2 } from "lucide-react";
import type { SavedProject } from "../projects/store";
import { templateById } from "../projects/templates";

interface ProjectDashboardProps {
  projects: SavedProject[];
  onCreate: () => void;
  onDelete: (id: string) => void;
  onDuplicate: (project: SavedProject) => void;
  onOpen: (project: SavedProject) => void;
}

const formatDate = (date: string) =>
  new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));

export function ProjectDashboard({
  projects,
  onCreate,
  onDelete,
  onDuplicate,
  onOpen,
}: ProjectDashboardProps) {
  return (
    <main className="dashboard">
      <section className="dashboard-heading">
        <div>
          <span>Your workspace</span>
          <h1>Projects</h1>
          <p>Continue a saved design or start a new printable model.</p>
        </div>
        <button className="design-new-button" onClick={onCreate} type="button">
          <Plus size={18} />
          Design new
        </button>
      </section>

      <section className="dashboard-projects" aria-label="Saved projects">
        <button className="new-design-card" onClick={onCreate} type="button">
          <span>
            <Plus size={24} />
          </span>
          <strong>Design new</strong>
          <small>Choose a ball template, blank canvas, or fitted stand</small>
        </button>

        {projects.map((project) => {
          const template = templateById(project.parameters.template);
          return (
            <article className="dashboard-card" key={project.id}>
              <button
                className="dashboard-preview"
                onClick={() => onOpen(project)}
                style={
                  {
                    "--ball-color": project.parameters.ballColor,
                  } as React.CSSProperties
                }
                type="button"
              >
                {project.thumbnail ? (
                  <img alt="" src={project.thumbnail} />
                ) : (
                  <span
                    className={`project-orb design-${project.parameters.designKind} pattern-${project.parameters.pattern} seam-${project.parameters.seamPattern}`}
                  >
                    <i />
                  </span>
                )}
              </button>
              <div className="dashboard-card-body">
                <div>
                  <strong>{project.name}</strong>
                  <span>{template.name}</span>
                </div>
                <small>
                  <Clock3 size={12} />
                  {formatDate(project.updatedAt)}
                </small>
                <div className="dashboard-card-actions">
                  <button onClick={() => onOpen(project)} type="button">
                    Open design
                  </button>
                  <button
                    aria-label={`Duplicate ${project.name}`}
                    onClick={() => onDuplicate(project)}
                    title="Duplicate"
                    type="button"
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    aria-label={`Delete ${project.name}`}
                    onClick={() => onDelete(project.id)}
                    title="Delete"
                    type="button"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {projects.length === 0 ? (
        <section className="dashboard-empty">
          <FolderOpen size={18} />
          Saved projects will appear here.
        </section>
      ) : null}
    </main>
  );
}
