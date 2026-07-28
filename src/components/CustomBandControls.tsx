import { Plus, Trash2, Waves } from "lucide-react";
import { useEffect, useState } from "react";
import type { CustomBand } from "../geometry/types";
import { RangeField } from "./Controls";
import { HelpTooltip } from "./HelpTooltip";

interface CustomBandControlsProps {
  bands: CustomBand[];
  onChange: (bands: CustomBand[]) => void;
  onNotice: (notice: string) => void;
}

const MAX_CUSTOM_BANDS = 8;

export const createCustomBand = (index = 0): CustomBand => ({
  id:
    globalThis.crypto?.randomUUID?.() ??
    `custom-band-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  rotation: ((index * 45 + 180) % 360) - 180,
  tilt: index % 2 === 0 ? 0 : 35,
  curveAngle: index % 3 === 0 ? 0 : 45,
  curvature: 50,
});

export function CustomBandControls({
  bands,
  onChange,
  onNotice,
}: CustomBandControlsProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    bands[0]?.id ?? null,
  );
  const selected =
    bands.find((band) => band.id === selectedId) ?? bands[0] ?? null;

  useEffect(() => {
    if (selected || bands.length === 0) return;
    setSelectedId(bands[0].id);
  }, [bands, selected]);

  const addBand = () => {
    if (bands.length >= MAX_CUSTOM_BANDS) {
      onNotice(`A design can contain up to ${MAX_CUSTOM_BANDS} custom bands.`);
      return;
    }
    const band = createCustomBand(bands.length);
    onChange([...bands, band]);
    setSelectedId(band.id);
  };

  const replaceBand = (id: string, changes: Partial<CustomBand>) => {
    onChange(
      bands.map((band) =>
        band.id === id ? { ...band, ...changes } : band,
      ),
    );
  };

  const removeBand = (id: string) => {
    const next = bands.filter((band) => band.id !== id);
    onChange(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
  };

  return (
    <div className="custom-band-controls">
      <div className="custom-band-heading">
        <span className="mini-label">Custom bands</span>
        <HelpTooltip label="Custom band controls">
          <p>
            Every band is a continuous closed curve wrapped around the sphere.
          </p>
          <p>
            <b>Rotation</b> and <b>Tilt</b> place it on the ball.{" "}
            <b>Curve angle</b> turns its lobes, while <b>Curvature</b>{" "}
            controls the amount of bowing. Set curvature to zero for a
            straight great-circle band.
          </p>
        </HelpTooltip>
      </div>

      <button
        className="custom-band-add"
        disabled={bands.length >= MAX_CUSTOM_BANDS}
        onClick={addBand}
        type="button"
      >
        <Plus size={14} />
        Add band
      </button>

      {bands.length === 0 ? (
        <div className="marking-empty">
          Add a band, then set its direction and curvature.
        </div>
      ) : (
        <div className="custom-band-list">
          {bands.map((band, index) => (
            <div
              className={band.id === selected?.id ? "is-selected" : ""}
              key={band.id}
            >
              <button
                className="custom-band-select"
                onClick={() => setSelectedId(band.id)}
                type="button"
              >
                <Waves size={15} />
                <span>
                  <strong>Band {index + 1}</strong>
                  <small>
                    {band.curvature === 0
                      ? "Straight"
                      : `${Math.round(band.curvature)}% curve`}
                    {" · "}
                    {Math.round(band.rotation)}° rotation
                  </small>
                </span>
              </button>
              <button
                aria-label={`Delete custom band ${index + 1}`}
                className="custom-band-delete"
                onClick={() => removeBand(band.id)}
                type="button"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {selected ? (
        <div className="custom-band-editor">
          <RangeField
            label="Rotation"
            max={180}
            min={-180}
            onChange={(rotation) =>
              replaceBand(selected.id, { rotation })
            }
            step={1}
            unit="°"
            value={selected.rotation}
          />
          <RangeField
            label="Tilt"
            max={90}
            min={-90}
            onChange={(tilt) => replaceBand(selected.id, { tilt })}
            step={1}
            unit="°"
            value={selected.tilt}
          />
          <RangeField
            hint="lobe direction"
            label="Curve angle"
            max={180}
            min={-180}
            onChange={(curveAngle) =>
              replaceBand(selected.id, { curveAngle })
            }
            step={1}
            unit="°"
            value={selected.curveAngle}
          />
          <RangeField
            hint={selected.curvature === 0 ? "straight band" : "shape"}
            label="Band curvature"
            max={100}
            min={0}
            onChange={(curvature) =>
              replaceBand(selected.id, { curvature })
            }
            step={1}
            unit="%"
            value={selected.curvature}
          />
        </div>
      ) : null}
    </div>
  );
}

export type { CustomBandControlsProps };
