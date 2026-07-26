import {
  Clock3,
  Copy,
  FolderOpen,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { SavedProject } from "../projects/store";

interface ProjectLibraryProps {
  projects: SavedProject[];
  currentProjectId: string | null;
  onClose: () => void;
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

export function ProjectLibrary({
  projects,
  currentProjectId,
  onClose,
  onCreate,
  onDelete,
  onDuplicate,
  onOpen,
}: ProjectLibraryProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="projects-title"
        aria-modal="true"
        className="project-library"
        role="dialog"
      >
        <div className="library-heading">
          <div>
            <span>Your workspace</span>
            <h2 id="projects-title">Projects</h2>
          </div>
          <div>
            <button className="new-project-button" onClick={onCreate} type="button">
              <Plus size={16} />
              New ball
            </button>
            <button aria-label="Close projects" onClick={onClose} type="button">
              <X size={19} />
            </button>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="empty-projects">
            <span className="empty-project-icon">
              <FolderOpen size={24} />
            </span>
            <strong>No saved projects yet</strong>
            <p>Create a ball, adjust its geometry, then save it here.</p>
            <button onClick={onCreate} type="button">
              <Plus size={15} />
              Create first ball
            </button>
          </div>
        ) : (
          <div className="project-grid">
            {projects.map((project) => (
              <article
                className={
                  project.id === currentProjectId ? "is-current" : undefined
                }
                key={project.id}
              >
                <button
                  className="project-preview"
                  onClick={() => onOpen(project)}
                  type="button"
                >
                  <span className={`project-orb pattern-${project.parameters.pattern}`}>
                    <i />
                  </span>
                </button>
                <div className="project-card-body">
                  <div>
                    <strong>{project.name}</strong>
                    <span>
                      {project.parameters.mode} · {project.parameters.pattern}
                    </span>
                  </div>
                  <small>
                    <Clock3 size={12} />
                    {formatDate(project.updatedAt)}
                  </small>
                  <div className="project-card-actions">
                    <button onClick={() => onOpen(project)} type="button">
                      Open
                    </button>
                    <button
                      aria-label={`Duplicate ${project.name}`}
                      onClick={() => onDuplicate(project)}
                      type="button"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      aria-label={`Delete ${project.name}`}
                      onClick={() => onDelete(project.id)}
                      type="button"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
