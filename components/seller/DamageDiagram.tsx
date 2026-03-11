"use client";

export type DamageLevel = "NONE" | "MINOR" | "MAJOR";

export type DamageMapValue = Record<string, Exclude<DamageLevel, "NONE">>;

type ZoneSpec = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rx?: number;
};

const ZONES: ZoneSpec[] = [
  { id: "front_bumper", label: "Front Bumper", x: 40, y: 10, width: 120, height: 28, rx: 8 },
  { id: "hood", label: "Hood", x: 40, y: 42, width: 120, height: 55, rx: 4 },
  { id: "windshield", label: "Windshield", x: 50, y: 100, width: 100, height: 35, rx: 4 },
  { id: "roof", label: "Roof", x: 50, y: 138, width: 100, height: 80, rx: 4 },
  { id: "rear_window", label: "Rear Window", x: 50, y: 222, width: 100, height: 35, rx: 4 },
  { id: "trunk", label: "Trunk / Tailgate", x: 40, y: 260, width: 120, height: 55, rx: 4 },
  { id: "rear_bumper", label: "Rear Bumper", x: 40, y: 318, width: 120, height: 28, rx: 8 },
  { id: "fender_fl", label: "Front Left Fender", x: 10, y: 42, width: 28, height: 40, rx: 4 },
  { id: "fender_fr", label: "Front Right Fender", x: 162, y: 42, width: 28, height: 40, rx: 4 },
  { id: "door_fl", label: "Front Left Door", x: 10, y: 100, width: 28, height: 70, rx: 4 },
  { id: "door_fr", label: "Front Right Door", x: 162, y: 100, width: 28, height: 70, rx: 4 },
  { id: "door_rl", label: "Rear Left Door", x: 10, y: 178, width: 28, height: 70, rx: 4 },
  { id: "door_rr", label: "Rear Right Door", x: 162, y: 178, width: 28, height: 70, rx: 4 },
  { id: "quarter_rl", label: "Rear Left Quarter", x: 10, y: 252, width: 28, height: 40, rx: 4 },
  { id: "quarter_rr", label: "Rear Right Quarter", x: 162, y: 252, width: 28, height: 40, rx: 4 },
  { id: "underbody", label: "Underbody", x: 72, y: 350, width: 56, height: 24, rx: 6 },
];

const DAMAGE_COLOR: Record<DamageLevel, string> = {
  NONE: "transparent",
  MINOR: "#fef3c7",
  MAJOR: "#fee2e2",
};

const DAMAGE_STROKE: Record<DamageLevel, string> = {
  NONE: "#dde5df",
  MINOR: "#f59e0b",
  MAJOR: "#ef4444",
};

function nextDamage(current: DamageLevel): DamageLevel {
  if (current === "NONE") {
    return "MINOR";
  }

  if (current === "MINOR") {
    return "MAJOR";
  }

  return "NONE";
}

type DamageDiagramProps = {
  value: DamageMapValue;
  onChange: (next: DamageMapValue) => void;
};

function getLevel(value: DamageMapValue, zoneId: string): DamageLevel {
  const current = value[zoneId];

  if (current === "MINOR" || current === "MAJOR") {
    return current;
  }

  return "NONE";
}

export function DamageDiagram({ value, onChange }: DamageDiagramProps) {
  const markedZones = ZONES.filter((zone) => getLevel(value, zone.id) !== "NONE");

  function toggleZone(zoneId: string): void {
    const current = getLevel(value, zoneId);
    const next = nextDamage(current);
    const updated: DamageMapValue = { ...value };

    if (next === "NONE") {
      delete updated[zoneId];
    } else {
      updated[zoneId] = next;
    }

    onChange(updated);
  }

  return (
    <div>
      <p className="field-hint">Click any panel to mark damage. Click again to change severity. Third click removes.</p>

      <svg viewBox="0 0 200 400" className="damage-svg" role="img" aria-label="Interactive vehicle damage map">
        {ZONES.map((zone) => {
          const level = getLevel(value, zone.id);

          return (
            <rect
              key={zone.id}
              x={zone.x}
              y={zone.y}
              width={zone.width}
              height={zone.height}
              rx={zone.rx ?? 4}
              fill={DAMAGE_COLOR[level]}
              stroke={DAMAGE_STROKE[level]}
              onClick={() => toggleZone(zone.id)}
              style={{ cursor: "pointer" }}
            >
              <title>{zone.label}</title>
            </rect>
          );
        })}
      </svg>

      <div className="damage-legend">
        <span>
          <span className="legend-dot minor" />Minor damage
        </span>
        <span>
          <span className="legend-dot major" />Major damage
        </span>
        <span>
          <span className="legend-dot none" />No damage (click to mark)
        </span>
      </div>

      {markedZones.length > 0 ? (
        <div className="damage-summary">
          <strong>Marked damage:</strong>
          {markedZones.map((zone) => {
            const level = getLevel(value, zone.id);

            return (
              <span key={zone.id} className={`damage-chip ${level.toLowerCase()}`}>
                {zone.label} — {level === "MINOR" ? "Minor" : "Major"}
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
