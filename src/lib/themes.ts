import type { CSSProperties } from "react";
import type { Theme } from "./types";

const soft = { "--sf-border": "1px", "--sf-shadow": "0 1px 3px rgba(0,0,0,0.06)" };

export const THEME_META: Record<Theme, { label: string; swatch: string; vars: Record<string, string> }> = {
  candy: {
    label: "Candy",
    swatch: "linear-gradient(135deg,#ff4fd8,#7b2ff7)",
    vars: { "--sf-bg": "#fff0fb", "--sf-card": "#ffffff", "--sf-ink": "#1a0b2e", "--sf-muted": "#5f4670", "--sf-accent": "#7b2ff7", "--sf-accent-ink": "#ffffff", "--sf-hero": "linear-gradient(135deg,#ff4fd8 0%,#7b2ff7 100%)", "--sf-chip": "#ffe0f7", "--sf-line": "#1a0b2e", "--sf-border": "2px", "--sf-shadow": "4px 4px 0 #1a0b2e" },
  },
  acid: {
    label: "Acid",
    swatch: "linear-gradient(135deg,#c6ff3d,#0b0b0f)",
    vars: { "--sf-bg": "#0b0b0f", "--sf-card": "#17171d", "--sf-ink": "#f5f5f7", "--sf-muted": "#a8a8b3", "--sf-accent": "#c6ff3d", "--sf-accent-ink": "#0b0b0f", "--sf-hero": "linear-gradient(135deg,#c6ff3d 0%,#5ad8ff 100%)", "--sf-chip": "#2a2a33", "--sf-line": "#c6ff3d", "--sf-border": "2px", "--sf-shadow": "4px 4px 0 #c6ff3d" },
  },
  sunset: {
    label: "Sunset",
    swatch: "linear-gradient(135deg,#ff8a5b,#ff3d77)",
    vars: { "--sf-bg": "#fff7f3", "--sf-card": "#ffffff", "--sf-ink": "#2b1a1f", "--sf-muted": "#7a6268", "--sf-accent": "#e8364f", "--sf-accent-ink": "#ffffff", "--sf-hero": "linear-gradient(135deg,#ff8a5b 0%,#ff3d77 100%)", "--sf-chip": "#ffe8e3", "--sf-line": "#f3dfdb", ...soft },
  },
  ocean: {
    label: "Ocean",
    swatch: "linear-gradient(135deg,#2f80ed,#00b4d8)",
    vars: { "--sf-bg": "#f3f8ff", "--sf-card": "#ffffff", "--sf-ink": "#14213d", "--sf-muted": "#5b6b85", "--sf-accent": "#1d63d6", "--sf-accent-ink": "#ffffff", "--sf-hero": "linear-gradient(135deg,#2f80ed 0%,#00b4d8 100%)", "--sf-chip": "#e2eeff", "--sf-line": "#dce7f7", ...soft },
  },
  forest: {
    label: "Forest",
    swatch: "linear-gradient(135deg,#2f9e5d,#a3c94f)",
    vars: { "--sf-bg": "#f4faf5", "--sf-card": "#ffffff", "--sf-ink": "#16301f", "--sf-muted": "#5a7262", "--sf-accent": "#1f7a47", "--sf-accent-ink": "#ffffff", "--sf-hero": "linear-gradient(135deg,#2f9e5d 0%,#a3c94f 100%)", "--sf-chip": "#e3f3e7", "--sf-line": "#d9eadd", ...soft },
  },
  noir: {
    label: "Noir",
    swatch: "linear-gradient(135deg,#2b2b2b,#000000)",
    vars: { "--sf-bg": "#0f0f10", "--sf-card": "#1b1b1d", "--sf-ink": "#f4f4f5", "--sf-muted": "#a1a1aa", "--sf-accent": "#f5c542", "--sf-accent-ink": "#111111", "--sf-hero": "linear-gradient(135deg,#3a3a3d 0%,#0b0b0c 100%)", "--sf-chip": "#2a2a2e", "--sf-line": "#2c2c30", ...soft },
  },
};

export function themeStyle(theme: Theme): CSSProperties {
  return (THEME_META[theme] || THEME_META.candy).vars as CSSProperties;
}
