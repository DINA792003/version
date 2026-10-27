"use client";

import * as React from "react";

export interface UnitLayoutUnit {
  id: string;
  number: string;
  type?: string | null;
  status?: string | null;
  area?: number | null;
  price?: number | null;
  layoutX?: number | null;
  layoutY?: number | null;
  x?: number | null;
  y?: number | null;
}

interface UnitLayoutPickerProps {
  units: UnitLayoutUnit[];
  selectedId?: string;
  loading?: boolean;
  onSelect: (unit: UnitLayoutUnit) => void;
  canSelect?: (unit: UnitLayoutUnit) => boolean;
}

const STATUS_FILL: Record<string, string> = {
  AVAILABLE: "#16a34a",
  RESERVED: "#facc15",
  HOLD: "#f97316",
  BOOKED: "#ef4444",
  SOLD: "#dc2626",
  REGISTERED: "#ef4444",
  BLOCKED: "#94a3b8",
};

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "Available",
  RESERVED: "Reserved",
  HOLD: "On Hold",
  BOOKED: "Booked",
  SOLD: "Sold",
  REGISTERED: "Registered",
  BLOCKED: "Blocked",
};

const LEGEND = [
  { label: "Booked", fill: STATUS_FILL.BOOKED },
  { label: "Reserved", fill: STATUS_FILL.RESERVED },
  { label: "On Hold", fill: STATUS_FILL.HOLD },
  { label: "Available", fill: STATUS_FILL.AVAILABLE },
] as const;

const PUZZLE_CLIP = "polygon(14% 0, 86% 0, 100% 16%, 86% 32%, 100% 50%, 86% 68%, 100% 84%, 86% 100%, 14% 100%, 0 84%, 14% 68%, 0 50%, 14% 32%, 0 16%)";

function normalizeStatus(status?: string | null) {
  return String(status || "AVAILABLE").toUpperCase();
}

function statusFill(status?: string | null) {
  return STATUS_FILL[normalizeStatus(status)] || "#94a3b8";
}

function statusLabel(status?: string | null) {
  return STATUS_LABEL[normalizeStatus(status)] || normalizeStatus(status);
}

function shortNumber(number: string) {
  const parts = number.split("-").filter(Boolean);
  return parts[parts.length - 1] || number;
}

function layoutPoint(unit: UnitLayoutUnit) {
  const rawX = unit.layoutX ?? unit.x;
  const rawY = unit.layoutY ?? unit.y;
  if (typeof rawX !== "number" || typeof rawY !== "number") return null;
  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return null;
  if (rawX < 0 || rawY < 0 || rawX > 100 || rawY > 100) return null;
  return { x: rawX, y: rawY };
}

function shapeLabel(unit: UnitLayoutUnit) {
  return `${unit.number} - ${statusLabel(unit.status)} - ${unit.type || "Unit"}`;
}

export function UnitLayoutPicker({
  units,
  selectedId,
  loading = false,
  onSelect,
  canSelect,
}: UnitLayoutPickerProps) {
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);
  const selected = units.find((unit) => unit.id === selectedId);
  const hovered = units.find((unit) => unit.id === hoveredId);
  const positioned = units.length > 0 && units.every((unit) => layoutPoint(unit));
  const isSelectable = (unit: UnitLayoutUnit) =>
    canSelect ? canSelect(unit) : normalizeStatus(unit.status) === "AVAILABLE";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-900">Choose an available unit</p>
          <p className="text-xs text-muted-foreground">
            Select an available unit from the saved project layout. Other statuses cannot be selected.
          </p>
        </div>
        {selected ? (
          <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
            {selected.number} selected
          </span>
        ) : null}
      </div>

      <div
        data-testid="unit-layout-canvas"
        className="relative w-full overflow-hidden rounded-md border border-slate-200 bg-white"
        style={{ backgroundColor: "#ffffff", minHeight: positioned ? "28rem" : undefined }}
      >
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading units...</p>
        ) : units.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No units found for this project.</p>
        ) : positioned ? (
          units.map((unit) => {
            const point = layoutPoint(unit);
            if (!point) return null;
            return (
              <UnitShape
                key={unit.id}
                unit={unit}
                selected={unit.id === selectedId}
                selectable={isSelectable(unit)}
                onSelect={onSelect}
                onHover={setHoveredId}
                className="absolute h-14 w-16 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
              />
            );
          })
        ) : (
          <div className="grid grid-cols-2 gap-3 bg-white p-4 sm:grid-cols-4 lg:grid-cols-6">
            {units.map((unit) => (
              <UnitShape
                key={unit.id}
                unit={unit}
                selected={unit.id === selectedId}
                selectable={isSelectable(unit)}
                onSelect={onSelect}
                onHover={setHoveredId}
                className="mx-auto h-14 w-16"
              />
            ))}
          </div>
        )}
        {hovered ? (
          <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded bg-slate-900 px-2 py-1 text-xs text-white shadow">
            {shapeLabel(hovered)}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-slate-600">
        {LEGEND.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.fill }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function UnitShape({
  unit,
  selected,
  selectable,
  onSelect,
  onHover,
  className,
  style,
}: {
  unit: UnitLayoutUnit;
  selected: boolean;
  selectable: boolean;
  onSelect: (unit: UnitLayoutUnit) => void;
  onHover: (id: string | null) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const fill = statusFill(unit.status);
  const lightText = fill === STATUS_FILL.BOOKED || fill === STATUS_FILL.SOLD || fill === STATUS_FILL.REGISTERED || fill === STATUS_FILL.AVAILABLE;
  return (
    <button
      type="button"
      disabled={!selectable}
      aria-pressed={selected}
      aria-label={shapeLabel(unit)}
      title={shapeLabel(unit)}
      onMouseEnter={() => onHover(unit.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(unit.id)}
      onBlur={() => onHover(null)}
      onClick={() => {
        if (selectable) onSelect(unit);
      }}
      className={`flex items-center justify-center px-1 text-[11px] font-semibold leading-none disabled:cursor-not-allowed ${className || ""}`}
      style={{
        ...style,
        backgroundColor: fill,
        color: lightText ? "#ffffff" : "#111827",
        clipPath: PUZZLE_CLIP,
        boxShadow: selected ? "0 0 0 2px #ffffff, 0 0 0 4px #0f172a" : undefined,
      }}
    >
      {shortNumber(unit.number)}
    </button>
  );
}
