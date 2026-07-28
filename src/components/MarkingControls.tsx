import { Image as ImageIcon, Plus, Trash2, Type, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { rasterizeLogo } from "../geometry/logoMask";
import type {
  BallMarking,
  BallParameters,
  MarkingOperation,
} from "../geometry/types";
import { RangeField, SegmentedControl } from "./Controls";
import { HelpTooltip } from "./HelpTooltip";

interface MarkingControlsProps {
  parameters: BallParameters;
  onNotice: (notice: string) => void;
  onUpdate: <Key extends keyof BallParameters>(
    key: Key,
    value: BallParameters[Key],
  ) => void;
}

const MAX_MARKINGS = 8;

const bandLabels = (parameters: BallParameters) => {
  switch (parameters.seamPattern) {
    case "custom":
      return parameters.customBands.map(
        (_, index) => `Band ${index + 1}`,
      );
    case "basketball":
      return ["Horizontal", "Vertical", "Curved"];
    case "volleyball":
    case "football":
      return Array.from({ length: 6 }, (_, index) => `${index + 1}`);
    default:
      return ["1"];
  }
};

const createMarking = (type: BallMarking["type"]): BallMarking => ({
  id:
    globalThis.crypto?.randomUUID?.() ??
    `marking-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  type,
  operation: "engraved",
  text: "AIRLAB",
  logoMask: "",
  logoName: "",
  size: 28,
  height: 0.8,
  bandIndex: 0,
  position: 50,
});

export function MarkingControls({
  parameters,
  onNotice,
  onUpdate,
}: MarkingControlsProps) {
  const markings = parameters.markings ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(
    markings[0]?.id ?? null,
  );
  const selected =
    markings.find((marking) => marking.id === selectedId) ??
    markings[0] ??
    null;
  const availableBandLabels = bandLabels(parameters);
  const availableBands = availableBandLabels.length;

  useEffect(() => {
    if (selected || markings.length === 0) return;
    setSelectedId(markings[0].id);
  }, [markings, selected]);

  const replaceMarking = (
    id: string,
    changes: Partial<BallMarking>,
  ) => {
    onUpdate(
      "markings",
      markings.map((marking) =>
        marking.id === id ? { ...marking, ...changes } : marking,
      ),
    );
  };

  const addMarking = (type: BallMarking["type"]) => {
    if (markings.length >= MAX_MARKINGS) {
      onNotice(`A design can contain up to ${MAX_MARKINGS} markings.`);
      return;
    }
    const marking = createMarking(type);
    onUpdate("markings", [...markings, marking]);
    setSelectedId(marking.id);
  };

  const removeMarking = (id: string) => {
    const next = markings.filter((marking) => marking.id !== id);
    onUpdate("markings", next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
  };

  return (
    <section className="panel-section marking-controls">
      <div className="section-label">
        <span>Text & logos</span>
        <HelpTooltip label="Text and logos">
          <p>
            Add up to eight independent text or logo markings. Each item has
            its own size, operation, band, and position.
          </p>
          <p>
            On sport designs, the geometry follows the real curve of the
            selected band instead of sitting on a flat plate.
          </p>
          <p>
            Uploaded logos are converted to a printable monochrome relief.
            Bold and simple artwork gives the cleanest result.
          </p>
        </HelpTooltip>
      </div>

      <div className="marking-add-buttons">
        <button
          disabled={markings.length >= MAX_MARKINGS}
          onClick={() => addMarking("text")}
          type="button"
        >
          <Plus size={14} />
          <Type size={14} />
          Add text
        </button>
        <button
          disabled={markings.length >= MAX_MARKINGS}
          onClick={() => addMarking("logo")}
          type="button"
        >
          <Plus size={14} />
          <ImageIcon size={14} />
          Add logo
        </button>
      </div>

      {markings.length === 0 ? (
        <div className="marking-empty">
          Add text or a logo, then choose its band and exact position.
        </div>
      ) : (
        <div className="marking-list">
          {markings.map((marking, index) => (
            <div
              className={
                marking.id === selected?.id ? "is-selected" : ""
              }
              key={marking.id}
            >
              <button
                className="marking-select"
                onClick={() => setSelectedId(marking.id)}
                type="button"
              >
                {marking.type === "text" ? (
                  <Type size={14} />
                ) : (
                  <ImageIcon size={14} />
                )}
                <span>
                  <strong>
                    {marking.type === "text"
                      ? marking.text || `Text ${index + 1}`
                      : marking.logoName || `Logo ${index + 1}`}
                  </strong>
                  <small>
                    {parameters.seamPattern === "none"
                      ? `${marking.position}% around ball`
                      : `${
                          availableBandLabels[
                            Math.min(
                              marking.bandIndex,
                              availableBands - 1,
                            )
                          ] ?? "Add a band"
                        } · ${marking.position}%`}
                  </small>
                </span>
              </button>
              <button
                aria-label={`Delete marking ${index + 1}`}
                className="marking-delete"
                onClick={() => removeMarking(marking.id)}
                type="button"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {selected ? (
        <div className="marking-editor">
          <span className="mini-label">Type</span>
          <SegmentedControl
            onChange={(type: BallMarking["type"]) =>
              replaceMarking(selected.id, { type })
            }
            options={[
              { value: "text", label: "Text", icon: <Type size={15} /> },
              {
                value: "logo",
                label: "Logo",
                icon: <ImageIcon size={15} />,
              },
            ]}
            value={selected.type}
          />

          {selected.type === "text" ? (
            <label className="text-marking-field">
              <span>Marking text</span>
              <input
                maxLength={12}
                onChange={(event) =>
                  replaceMarking(selected.id, {
                    text: event.target.value,
                  })
                }
                placeholder="AIRLAB"
                value={selected.text}
              />
            </label>
          ) : (
            <label className="logo-upload">
              <Upload size={16} />
              <span>
                <strong>{selected.logoName || "Choose logo file"}</strong>
                <small>PNG, JPG, WebP or SVG · simple monochrome shape</small>
              </span>
              <input
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    const result = await rasterizeLogo(file);
                    replaceMarking(selected.id, {
                      logoMask: result.mask,
                      logoName: result.name,
                    });
                    onNotice(
                      `Prepared “${result.name}” as printable geometry.`,
                    );
                  } catch (error) {
                    onNotice(
                      error instanceof Error ? error.message : String(error),
                    );
                  }
                }}
                type="file"
              />
            </label>
          )}

          <div className="marking-parameters">
            <span className="mini-label">Operation</span>
            <SegmentedControl
              onChange={(operation: MarkingOperation) =>
                replaceMarking(selected.id, { operation })
              }
              options={[
                { value: "raised", label: "Additive" },
                { value: "engraved", label: "Negative" },
              ]}
              value={selected.operation}
            />
            {parameters.seamPattern !== "none" &&
            availableBands > 1 ? (
              <div className="marking-band-picker">
                <span className="mini-label">Band</span>
                <SegmentedControl
                  columns={availableBands > 4 ? 3 : availableBands}
                  onChange={(value) =>
                    replaceMarking(selected.id, {
                      bandIndex: Number(value),
                    })
                  }
                  options={Array.from(
                    { length: availableBands },
                    (_, index) => ({
                      value: String(index),
                      label: availableBandLabels[index],
                    }),
                  )}
                  value={String(
                    Math.min(selected.bandIndex, availableBands - 1),
                  )}
                />
              </div>
            ) : null}
            <RangeField
              hint={
                parameters.seamPattern === "none"
                  ? "around ball"
                  : "along selected band"
              }
              label={
                parameters.seamPattern === "none"
                  ? "Surface position"
                  : "Position on band"
              }
              max={100}
              min={0}
              onChange={(position) =>
                replaceMarking(selected.id, { position })
              }
              step={1}
              unit="%"
              value={selected.position}
            />
            <RangeField
              label="Mark size"
              max={60}
              min={5}
              onChange={(size) =>
                replaceMarking(selected.id, { size })
              }
              step={1}
              unit="mm"
              value={selected.size}
            />
            <RangeField
              label={
                selected.operation === "raised"
                  ? "Relief height"
                  : "Engraving depth"
              }
              max={3}
              min={0.3}
              onChange={(height) =>
                replaceMarking(selected.id, { height })
              }
              step={0.1}
              unit="mm"
              value={selected.height}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
