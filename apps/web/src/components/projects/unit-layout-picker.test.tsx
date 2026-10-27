import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UnitLayoutPicker, type UnitLayoutUnit } from "./unit-layout-picker";

const units: UnitLayoutUnit[] = [
  { id: "u15", number: "DCTValley-U015", type: "4BHK", status: "AVAILABLE" },
  { id: "u21", number: "DCTValley-U021", type: "4BHK", status: "HOLD" },
  { id: "u25", number: "DCTValley-U025", type: "2BHK", status: "RESERVED" },
  { id: "u28", number: "DCTValley-U028", type: "Penthouse", status: "BOOKED" },
];

describe("UnitLayoutPicker", () => {
  it("keeps the plot canvas white and colors only the unit shapes", () => {
    render(<UnitLayoutPicker units={units} onSelect={vi.fn()} />);

    const canvas = screen.getByTestId("unit-layout-canvas");
    expect(canvas.className).toContain("bg-white");
    expect(canvas.className).not.toMatch(/bg-blue|bg-primary/);
    expect(canvas).toHaveStyle({ backgroundColor: "#ffffff" });

    expect(screen.getByRole("button", { name: "DCTValley-U015 - Available - 4BHK" })).toHaveStyle({
      backgroundColor: "#16a34a",
    });
    expect(screen.getByRole("button", { name: "DCTValley-U021 - On Hold - 4BHK" })).toHaveStyle({
      backgroundColor: "#f97316",
    });
    expect(screen.getByRole("button", { name: "DCTValley-U025 - Reserved - 2BHK" })).toHaveStyle({
      backgroundColor: "#facc15",
    });
    expect(screen.getByRole("button", { name: "DCTValley-U028 - Booked - Penthouse" })).toHaveStyle({
      backgroundColor: "#ef4444",
    });
    expect(canvas.querySelector("[class*='bg-blue'], [class*='bg-primary']")).toBeNull();
  });

  it("selects only available units", () => {
    const onSelect = vi.fn();
    render(<UnitLayoutPicker units={units} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "DCTValley-U028 - Booked - Penthouse" }));
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "DCTValley-U015 - Available - 4BHK" }));
    expect(onSelect).toHaveBeenCalledWith(units[0]);
  });

  it("leaves saved layout coordinates on a white canvas", () => {
    render(
      <UnitLayoutPicker
        units={units.map((unit, index) => ({ ...unit, layoutX: 70 + index, layoutY: 80 }))}
        selectedId="u15"
        onSelect={vi.fn()}
      />
    );

    const canvas = screen.getByTestId("unit-layout-canvas");
    expect(canvas).toHaveStyle({ backgroundColor: "#ffffff" });
    const available = screen.getByRole("button", { name: "DCTValley-U015 - Available - 4BHK" });
    expect(available).toHaveStyle({ left: "70%", top: "80%", backgroundColor: "#16a34a" });
    expect(screen.getByText("DCTValley-U015 selected")).toBeInTheDocument();
  });
});
