// packages/css-properties/src/gradient-types.ts
/** A structured, host-owned gradient; this module has no temporal dependency. */
export type GradientType = 'linear' | 'radial' | 'conic';
export interface GradientColor { readonly kind: 'color'; readonly r: number; readonly g: number; readonly b: number; readonly a: 1 }
export interface GradientStop {
  readonly id: string;
  readonly color: GradientColor;
  readonly opacity: number;
  readonly position: number;
  readonly present: boolean;
}
export interface GradientDefinition {
  readonly id: string;
  readonly cssName: 'background-image';
  readonly type: GradientType;
  readonly angle: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly stops: readonly GradientStop[];
}
export type GradientComponent = 'type' | 'angle' | 'centerX' | 'centerY' | 'radiusX' | 'radiusY' | 'color' | 'opacity' | 'position' | 'present';
export type GradientValue = GradientType | number | boolean | GradientColor;
export interface GradientEdit {
  readonly gradientId: string;
  readonly stopId?: string;
  readonly component: GradientComponent;
  readonly value: GradientValue;
}
export type GradientIntent = { readonly kind: 'edit'; readonly changes: readonly GradientEdit[] } | {
  readonly kind: 'add-stop'; readonly gradientId: string; readonly color: GradientColor; readonly opacity: number; readonly position: number;
};
export interface GradientSelection { readonly gradientId: string; readonly stopId: string | null }
export interface GradientEditorOptions {
  readonly onChange?: (intent: GradientIntent) => void;
  readonly onPreview?: (edits: readonly GradientEdit[] | null) => void;
  readonly onSelectionChange?: (selection: GradientSelection) => void;
}
export interface GradientViewOptions { readonly disabled?: boolean; readonly diagnostic?: string; readonly preview?: boolean; readonly addDisabled?: boolean; readonly addDiagnostic?: string }
