import {
  ArrowLeft,
  Bone,
  Circle,
  CircleDot,
  Disc3,
  Hexagon,
  HeartPulse,
  Orbit,
  PackageOpen,
  Sparkles,
} from "lucide-react";
import {
  BALL_TEMPLATES,
  type BallTemplateDefinition,
} from "../projects/templates";

const TEMPLATE_ICONS = {
  creative: Sparkles,
  "ping-pong": Circle,
  tennis: Orbit,
  football: Hexagon,
  basketball: Disc3,
  volleyball: Disc3,
  baseball: CircleDot,
  rugby: Orbit,
  golf: CircleDot,
  massage: HeartPulse,
  "pet-toy": Bone,
  stand: PackageOpen,
} as const;

interface TemplatePickerProps {
  onBack: () => void;
  onSelect: (template: BallTemplateDefinition) => void;
}

export function TemplatePicker({ onBack, onSelect }: TemplatePickerProps) {
  return (
    <main className="template-page">
      <button className="back-link" onClick={onBack} type="button">
        <ArrowLeft size={16} />
        Projects
      </button>
      <section className="template-heading">
        <span>New project</span>
        <h1>What do you want to design?</h1>
        <p>
          Every template remains fully editable after it opens in the creator.
        </p>
      </section>
      <section className="template-grid">
        {BALL_TEMPLATES.map((template) => {
          const Icon = TEMPLATE_ICONS[template.id];
          return (
            <button
              key={template.id}
              onClick={() => onSelect(template)}
              style={
                { "--template-color": template.color } as React.CSSProperties
              }
              type="button"
            >
              <span className={`template-ball template-${template.id}`}>
                <Icon size={28} />
              </span>
              <small>{template.category}</small>
              <strong>{template.name}</strong>
              <p>{template.description}</p>
            </button>
          );
        })}
      </section>
    </main>
  );
}
