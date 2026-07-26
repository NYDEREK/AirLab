import { Save, X } from "lucide-react";
import { useEffect, useState } from "react";

interface SaveProjectDialogProps {
  initialName: string;
  onCancel: () => void;
  onSave: (name: string) => void;
}

export function SaveProjectDialog({
  initialName,
  onCancel,
  onSave,
}: SaveProjectDialogProps) {
  const [name, setName] = useState(initialName);

  useEffect(() => {
    setName(initialName);
  }, [initialName]);

  return (
    <div className="modal-backdrop compact" role="presentation">
      <form
        aria-labelledby="save-project-title"
        aria-modal="true"
        className="save-project-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(name);
        }}
        role="dialog"
      >
        <div>
          <h2 id="save-project-title">Save project</h2>
          <button aria-label="Cancel saving" onClick={onCancel} type="button">
            <X size={18} />
          </button>
        </div>
        <label>
          Project name
          <input
            autoFocus
            maxLength={64}
            onChange={(event) => setName(event.target.value)}
            placeholder="My airless ball"
            value={name}
          />
        </label>
        <button className="dialog-save-button" disabled={!name.trim()} type="submit">
          <Save size={15} />
          Save project
        </button>
      </form>
    </div>
  );
}
