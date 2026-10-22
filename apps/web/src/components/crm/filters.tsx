"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, Filter } from "lucide-react";

interface FilterOption {
  label: string;
  value: string;
}

interface FilterFieldProps {
  label: string;
  type: "text" | "select" | "date" | "daterange";
  value?: string | Date;
  onChange?: (value: string | Date | undefined) => void;
  options?: FilterOption[];
  placeholder?: string;
}

export function FilterField({
  label,
  type,
  value,
  onChange,
  options,
  placeholder,
}: FilterFieldProps) {
  if (type === "text") {
    return (
      <div className="space-y-2">
        <Label className="text-sm font-medium">{label}</Label>
        <Input
          placeholder={placeholder || `Filter by ${label.toLowerCase()}`}
          value={(value as string) || ""}
          onChange={(e) => onChange?.(e.target.value)}
          className="h-9"
        />
      </div>
    );
  }

  if (type === "select") {
    return (
      <div className="space-y-2">
        <Label className="text-sm font-medium">{label}</Label>
        <Select value={(value as string) || ""} onValueChange={onChange}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder={placeholder || `Select ${label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {options?.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (type === "date") {
    const dateValue =
      value instanceof Date && !Number.isNaN(value.getTime())
        ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
        : typeof value === "string"
          ? value.slice(0, 10)
          : "";

    return (
      <div className="space-y-2">
        <Label className="text-sm font-medium">{label}</Label>
        <Input
          type="date"
          value={dateValue}
          onChange={(e) => onChange?.(e.target.value || undefined)}
          className="h-9"
        />
      </div>
    );
  }

  return null;
}

interface FilterBarProps {
  children: React.ReactNode;
  onReset?: () => void;
  className?: string;
}

export function FilterBar({ children, onReset, className }: FilterBarProps) {
  return (
    <div className={cn("flex flex-wrap items-end gap-4", className)}>
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Filters:</span>
      </div>
      {children}
      {onReset && (
        <Button variant="ghost" size="sm" onClick={onReset}>
          <X className="mr-2 h-4 w-4" />
          Reset
        </Button>
      )}
    </div>
  );
}
