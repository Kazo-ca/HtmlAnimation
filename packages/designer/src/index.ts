// packages/designer/src/index.ts
export * from './timeline-adapter.js';
export * from './events.js';
export * from './conflict-types.js';
export * from './gradient-types.js';
export * from './designer.js';
export { DomPreviewOwner } from './dom-preview.js';
export type { ElementProjection } from './dom-preview.js';
export * from './project/types.js';
export * from './project/validation.js';
export * from './project/codec.js';
export * from './project/source.js';
export type { ProjectProfile, ProjectState, ProjectRehydrationState, ProjectChange } from './project/rehydration.js';
export type { GeometryTool, GeometryState, GeometryMetrics, Point } from './geometry-math.js';
export type { GeometryOptions, GeometryUpdateResult } from './geometry-controls.js';
import './styles.less';
