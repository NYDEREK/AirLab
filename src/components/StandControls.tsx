import { useEffect } from "react";
import { vectorizeText } from "../geometry/markingVector";
import type {
  BallParameters,
  MarkingFont,
  MarkingOperation,
  StandBaseShape,
} from "../geometry/types";
import { RangeField, SegmentedControl } from "./Controls";
import { HelpTooltip } from "./HelpTooltip";

interface StandControlsProps {
  parameters: BallParameters;
  onUpdate: <Key extends keyof BallParameters>(
    key: Key,
    value: BallParameters[Key],
  ) => void;
}

export function StandControls({ parameters, onUpdate }: StandControlsProps) {
  useEffect(() => {
    let cancelled = false;
    const text = parameters.standText;
    const font = parameters.standTextFont;
    vectorizeText(text, font)
      .then((vectorData) => {
        if (cancelled || vectorData === parameters.standTextVectorData) return;
        onUpdate("standTextVectorData", vectorData);
      })
      .catch(() => {
        // The generator retains its printable compatibility font as fallback.
      });
    return () => {
      cancelled = true;
    };
  }, [
    onUpdate,
    parameters.standText,
    parameters.standTextFont,
    parameters.standTextVectorData,
  ]);

  return (
    <>
      <div className="control-group-heading">
        <strong>Ball fit</strong>
        <span>Diameter, clearance & seating depth</span>
      </div>
      <section className="panel-section parameter-stack">
        <div className="section-label">
          <span>Socket</span>
          <HelpTooltip label="Ball socket">
            <p>
              The recess is cut with a real sphere matching the selected ball
              diameter. Seating depth controls how far the ball enters the
              stand.
            </p>
            <p>
              Clearance adds a small gap around the ball. Use more clearance
              for rough or flexible prints.
            </p>
          </HelpTooltip>
        </div>
        <RangeField
          label="Ball diameter"
          max={300}
          min={20}
          onChange={(value) => onUpdate("standBallDiameter", value)}
          step={1}
          unit="mm"
          value={parameters.standBallDiameter}
        />
        <RangeField
          hint="how deeply the ball sits"
          label="Socket depth"
          max={Math.max(
            2,
            Math.min(parameters.standHeight - 1.2, parameters.standBallDiameter / 2),
          )}
          min={1}
          onChange={(value) => onUpdate("standSocketDepth", value)}
          step={0.5}
          unit="mm"
          value={Math.min(
            parameters.standSocketDepth,
            Math.max(
              2,
              Math.min(parameters.standHeight - 1.2, parameters.standBallDiameter / 2),
            ),
          )}
        />
        <RangeField
          hint="extra room around the ball"
          label="Fit clearance"
          max={3}
          min={0}
          onChange={(value) => onUpdate("standClearance", value)}
          step={0.1}
          unit="mm"
          value={parameters.standClearance}
        />
      </section>

      <div className="control-group-heading">
        <strong>Stand</strong>
        <span>Footprint & dimensions</span>
      </div>
      <section className="panel-section parameter-stack">
        <div className="section-label">
          <span>Base</span>
        </div>
        <SegmentedControl
          columns={3}
          onChange={(value: StandBaseShape) =>
            onUpdate("standBaseShape", value)
          }
          options={[
            { value: "circle", label: "Circle" },
            { value: "square", label: "Square" },
            { value: "octagon", label: "Octagon" },
          ]}
          value={parameters.standBaseShape}
        />
        <RangeField
          label={parameters.standBaseShape === "circle" ? "Base diameter" : "Base width"}
          max={320}
          min={30}
          onChange={(value) => onUpdate("standBaseSize", value)}
          step={1}
          unit="mm"
          value={parameters.standBaseSize}
        />
        <RangeField
          label="Base height"
          max={100}
          min={6}
          onChange={(value) => onUpdate("standHeight", value)}
          step={1}
          unit="mm"
          value={parameters.standHeight}
        />
      </section>

      <div className="control-group-heading">
        <strong>Front label</strong>
        <span>Printable text on the stand</span>
      </div>
      <section className="panel-section stand-label-controls">
        <label className="stand-text-field">
          <span>Text</span>
          <input
            maxLength={24}
            onChange={(event) => {
              onUpdate("standText", event.target.value);
              onUpdate("standTextVectorData", "");
            }}
            placeholder="AIRLAB"
            value={parameters.standText}
          />
        </label>
        <span className="mini-label">Font</span>
        <SegmentedControl
          columns={3}
          onChange={(font: MarkingFont) => {
            onUpdate("standTextFont", font);
            onUpdate("standTextVectorData", "");
          }}
          options={[
            { value: "modern", label: "Modern" },
            { value: "rounded", label: "Rounded" },
            { value: "technical", label: "Technical" },
          ]}
          value={parameters.standTextFont}
        />
        <span className="mini-label">Operation</span>
        <SegmentedControl
          onChange={(operation: MarkingOperation) =>
            onUpdate("standTextOperation", operation)
          }
          options={[
            { value: "raised", label: "Raised" },
            { value: "engraved", label: "Inset" },
          ]}
          value={parameters.standTextOperation}
        />
        <div className="parameter-stack">
          <RangeField
            label="Text size"
            max={Math.max(12, parameters.standBaseSize * 0.82)}
            min={6}
            onChange={(value) => onUpdate("standTextSize", value)}
            step={1}
            unit="mm"
            value={Math.min(
              parameters.standTextSize,
              Math.max(12, parameters.standBaseSize * 0.82),
            )}
          />
          <RangeField
            label={
              parameters.standTextOperation === "raised"
                ? "Relief height"
                : "Engraving depth"
            }
            max={4}
            min={0.2}
            onChange={(value) => onUpdate("standTextDepth", value)}
            step={0.1}
            unit="mm"
            value={parameters.standTextDepth}
          />
        </div>
      </section>
    </>
  );
}
