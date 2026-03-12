"use client";

import { useState } from "react";

export type DamageLevel = "NONE" | "MINOR" | "MAJOR";
export type DamageMapValue = Record<string, Exclude<DamageLevel, "NONE">>;

type DamageDiagramProps = {
  value: DamageMapValue;
  onChange: (next: DamageMapValue) => void;
};

type DiagramView = "top" | "front" | "rear";

const ZONE_LABELS: Record<string, string> = {
  front_bumper: "Front Bumper",
  hood: "Hood",
  fender_fl: "Front Left Fender",
  fender_fr: "Front Right Fender",
  door_fl: "Front Left Door",
  door_fr: "Front Right Door",
  roof: "Roof",
  door_rl: "Rear Left Door",
  door_rr: "Rear Right Door",
  trunk_area: "Trunk Area",
  quarter_rl: "Rear Left Quarter Panel",
  quarter_rr: "Rear Right Quarter Panel",
  trunk: "Trunk Lid",
  rear_bumper: "Rear Bumper",
  underbody: "Underbody",
};

const ZONE_ORDER = Object.keys(ZONE_LABELS);

function getLevel(value: DamageMapValue, zoneId: string): DamageLevel {
  const current = value[zoneId];

  if (current === "MINOR" || current === "MAJOR") {
    return current;
  }

  return "NONE";
}

function nextDamage(current: DamageLevel): DamageLevel {
  if (current === "NONE") {
    return "MINOR";
  }

  if (current === "MINOR") {
    return "MAJOR";
  }

  return "NONE";
}

export function DamageDiagram({ value, onChange }: DamageDiagramProps) {
  const [view, setView] = useState<DiagramView>("top");

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

  function removeZone(zoneId: string): void {
    if (!value[zoneId]) {
      return;
    }

    const updated: DamageMapValue = { ...value };
    delete updated[zoneId];
    onChange(updated);
  }

  const markedZones = ZONE_ORDER
    .filter((zoneId) => getLevel(value, zoneId) !== "NONE")
    .map((zoneId) => ({
      id: zoneId,
      label: ZONE_LABELS[zoneId] ?? zoneId,
      level: getLevel(value, zoneId),
    }));

  return (
    <div className="damage-diagram-root">
      <p className="field-hint">Click any panel to mark damage. Click again to change severity. Third click removes.</p>

      <div className="damage-view-toggle" role="tablist" aria-label="Damage diagram view">
        <button
          type="button"
          className={`damage-view-btn ${view === "top" ? "active" : ""}`}
          onClick={() => setView("top")}
        >
          Top View
        </button>
        <button
          type="button"
          className={`damage-view-btn ${view === "front" ? "active" : ""}`}
          onClick={() => setView("front")}
        >
          Front
        </button>
        <button
          type="button"
          className={`damage-view-btn ${view === "rear" ? "active" : ""}`}
          onClick={() => setView("rear")}
        >
          Rear
        </button>
      </div>

      <div className="damage-diagram-wrapper">
        <div className="damage-car-diagram">
          <svg className="damage-svg-detailed" viewBox="0 0 200 460" role="img" aria-label="Interactive vehicle damage map">
            <path
              d="M 52,68 Q 52,42 100,32 Q 148,42 148,68 L 158,220 Q 162,280 158,340 Q 148,400 100,412 Q 52,400 42,340 Q 38,280 42,220 Z"
              fill="#e8f0ea"
              stroke="#c0d0c4"
              strokeWidth="1.5"
            />

            <path
              d="M 62,90 Q 62,72 100,66 Q 138,72 138,90 L 140,130 Q 120,138 100,138 Q 80,138 60,130 Z"
              fill="#dbeafe"
              stroke="#93c5fd"
              strokeWidth="1"
              opacity="0.7"
            />

            <path
              d="M 62,340 Q 62,358 100,364 Q 138,358 138,340 L 138,305 Q 120,298 100,298 Q 80,298 62,305 Z"
              fill="#dbeafe"
              stroke="#93c5fd"
              strokeWidth="1"
              opacity="0.7"
            />

            <line x1="65" y1="140" x2="65" y2="300" stroke="#c8d8cc" strokeWidth="0.8" strokeDasharray="3,4" />
            <line x1="135" y1="140" x2="135" y2="300" stroke="#c8d8cc" strokeWidth="0.8" strokeDasharray="3,4" />
            <line x1="65" y1="220" x2="135" y2="220" stroke="#c8d8cc" strokeWidth="0.8" strokeDasharray="3,4" />

            <rect x="26" y="88" width="22" height="42" rx="6" fill="#374151" stroke="#1f2937" strokeWidth="1" />
            <rect x="152" y="88" width="22" height="42" rx="6" fill="#374151" stroke="#1f2937" strokeWidth="1" />
            <rect x="26" y="310" width="22" height="42" rx="6" fill="#374151" stroke="#1f2937" strokeWidth="1" />
            <rect x="152" y="310" width="22" height="42" rx="6" fill="#374151" stroke="#1f2937" strokeWidth="1" />

            <rect x="29" y="91" width="16" height="36" rx="4" fill="#6b7280" stroke="#9ca3af" strokeWidth="0.5" />
            <rect x="155" y="91" width="16" height="36" rx="4" fill="#6b7280" stroke="#9ca3af" strokeWidth="0.5" />
            <rect x="29" y="313" width="16" height="36" rx="4" fill="#6b7280" stroke="#9ca3af" strokeWidth="0.5" />
            <rect x="155" y="313" width="16" height="36" rx="4" fill="#6b7280" stroke="#9ca3af" strokeWidth="0.5" />

            <rect
              className={`zone ${getLevel(value, "front_bumper").toLowerCase()}`}
              x="62"
              y="24"
              width="76"
              height="22"
              rx="7"
              onClick={() => toggleZone("front_bumper")}
            />
            <text className="zone-label" x="100" y="35">
              FRONT BUMPER
            </text>

            <path
              className={`zone ${getLevel(value, "hood").toLowerCase()}`}
              d="M 64,48 Q 64,46 100,44 Q 136,46 136,48 L 138,88 Q 120,92 100,92 Q 80,92 62,88 Z"
              onClick={() => toggleZone("hood")}
            />
            <text className="zone-label" x="100" y="68">
              HOOD
            </text>

            <path
              className={`zone ${getLevel(value, "fender_fl").toLowerCase()}`}
              d="M 48,70 Q 44,72 43,90 L 48,130 Q 50,132 62,130 L 62,88 Q 56,80 52,70 Z"
              onClick={() => toggleZone("fender_fl")}
            />
            <text className="zone-label" x="54" y="102" fontSize="6">
              FL
            </text>

            <path
              className={`zone ${getLevel(value, "fender_fr").toLowerCase()}`}
              d="M 152,70 Q 156,72 157,90 L 152,130 Q 150,132 138,130 L 138,88 Q 144,80 148,70 Z"
              onClick={() => toggleZone("fender_fr")}
            />
            <text className="zone-label" x="146" y="102" fontSize="6">
              FR
            </text>

            <path
              className={`zone ${getLevel(value, "door_fl").toLowerCase()}`}
              d="M 44,134 L 62,132 L 62,218 L 44,218 Q 42,200 42,175 Q 42,152 44,134 Z"
              onClick={() => toggleZone("door_fl")}
            />
            <text className="zone-label" x="52" y="176" fontSize="6">
              FL DOOR
            </text>

            <path
              className={`zone ${getLevel(value, "door_fr").toLowerCase()}`}
              d="M 156,134 L 138,132 L 138,218 L 156,218 Q 158,200 158,175 Q 158,152 156,134 Z"
              onClick={() => toggleZone("door_fr")}
            />
            <text className="zone-label" x="148" y="176" fontSize="6">
              FR DOOR
            </text>

            <rect
              className={`zone ${getLevel(value, "roof").toLowerCase()}`}
              x="65"
              y="140"
              width="70"
              height="80"
              rx="4"
              onClick={() => toggleZone("roof")}
            />
            <text className="zone-label" x="100" y="182">
              ROOF
            </text>

            <path
              className={`zone ${getLevel(value, "door_rl").toLowerCase()}`}
              d="M 44,222 L 62,222 L 62,308 L 48,306 Q 42,286 42,260 Q 42,240 44,222 Z"
              onClick={() => toggleZone("door_rl")}
            />
            <text className="zone-label" x="52" y="265" fontSize="6">
              RL DOOR
            </text>

            <path
              className={`zone ${getLevel(value, "door_rr").toLowerCase()}`}
              d="M 156,222 L 138,222 L 138,308 L 152,306 Q 158,286 158,260 Q 158,240 156,222 Z"
              onClick={() => toggleZone("door_rr")}
            />
            <text className="zone-label" x="148" y="265" fontSize="6">
              RR DOOR
            </text>

            <rect
              className={`zone ${getLevel(value, "trunk_area").toLowerCase()}`}
              x="65"
              y="224"
              width="70"
              height="72"
              rx="4"
              onClick={() => toggleZone("trunk_area")}
            />
            <text className="zone-label" x="100" y="262">
              TRUNK AREA
            </text>

            <path
              className={`zone ${getLevel(value, "quarter_rl").toLowerCase()}`}
              d="M 44,310 Q 42,328 43,348 Q 44,366 50,374 L 62,374 L 62,308 Z"
              onClick={() => toggleZone("quarter_rl")}
            />
            <text className="zone-label" x="53" y="342" fontSize="6">
              RL
            </text>

            <path
              className={`zone ${getLevel(value, "quarter_rr").toLowerCase()}`}
              d="M 156,310 Q 158,328 157,348 Q 156,366 150,374 L 138,374 L 138,308 Z"
              onClick={() => toggleZone("quarter_rr")}
            />
            <text className="zone-label" x="147" y="342" fontSize="6">
              RR
            </text>

            <path
              className={`zone ${getLevel(value, "trunk").toLowerCase()}`}
              d="M 62,376 Q 62,398 100,406 Q 138,398 138,376 L 138,300 Q 120,296 100,296 Q 80,296 62,300 Z"
              onClick={() => toggleZone("trunk")}
            />
            <text className="zone-label" x="100" y="354">
              TRUNK
            </text>

            <rect
              className={`zone ${getLevel(value, "rear_bumper").toLowerCase()}`}
              x="62"
              y="408"
              width="76"
              height="22"
              rx="7"
              onClick={() => toggleZone("rear_bumper")}
            />
            <text className="zone-label" x="100" y="419">
              REAR BUMPER
            </text>

            <rect
              className={`zone ${getLevel(value, "underbody").toLowerCase()}`}
              x="74"
              y="435"
              width="52"
              height="18"
              rx="9"
              onClick={() => toggleZone("underbody")}
            />
            <text className="zone-label" x="100" y="444" fontSize="6">
              UNDERBODY
            </text>

            <rect x="66" y="26" width="14" height="8" rx="3" fill="#fef08a" stroke="#fbbf24" strokeWidth="0.8" opacity="0.8" />
            <rect x="120" y="26" width="14" height="8" rx="3" fill="#fef08a" stroke="#fbbf24" strokeWidth="0.8" opacity="0.8" />
            <rect x="66" y="406" width="14" height="8" rx="3" fill="#fca5a5" stroke="#ef4444" strokeWidth="0.8" opacity="0.8" />
            <rect x="120" y="406" width="14" height="8" rx="3" fill="#fca5a5" stroke="#ef4444" strokeWidth="0.8" opacity="0.8" />

            <ellipse cx="36" cy="108" rx="7" ry="5" fill="#9ca3af" stroke="#6b7280" strokeWidth="0.8" />
            <ellipse cx="164" cy="108" rx="7" ry="5" fill="#9ca3af" stroke="#6b7280" strokeWidth="0.8" />

            <rect x="49" y="168" width="8" height="3" rx="1.5" fill="#9ca3af" />
            <rect x="143" y="168" width="8" height="3" rx="1.5" fill="#9ca3af" />
            <rect x="49" y="258" width="8" height="3" rx="1.5" fill="#9ca3af" />
            <rect x="143" y="258" width="8" height="3" rx="1.5" fill="#9ca3af" />
          </svg>
        </div>

        <div className="damage-diagram-right">
          <div className="damage-legend">
            <div className="damage-legend-item">
              <span className="damage-legend-swatch minor" />
              <span>Minor damage</span>
            </div>
            <div className="damage-legend-item">
              <span className="damage-legend-swatch major" />
              <span>Major damage</span>
            </div>
            <div className="damage-legend-item">
              <span className="damage-legend-swatch none" />
              <span>No damage</span>
            </div>
          </div>

          <div className="damage-list-title">Marked Damage</div>

          <div className="damage-list">
            {markedZones.length === 0 ? (
              <div className="no-damage-msg">No damage marked - tap panels on the diagram</div>
            ) : (
              markedZones.map((zone) => (
                <div key={zone.id} className={`damage-item ${zone.level.toLowerCase()}`}>
                  <span className="damage-item-label">{zone.label}</span>
                  <span className="damage-item-right">
                    <span className="damage-item-badge">{zone.level.toLowerCase()}</span>
                    <button type="button" className="damage-item-remove" onClick={() => removeZone(zone.id)} title="Remove">
                      x
                    </button>
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {view !== "top" ? <p className="damage-view-note">Front and rear views can be configured next.</p> : null}
    </div>
  );
}
