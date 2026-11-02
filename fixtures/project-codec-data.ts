// fixtures/project-codec-data.ts
// Opaque authoring JSON for codec tests and demos, not a Timeline schema fixture.
import type { EditableProject } from '../packages/designer/src/index.js';

export function createProjectCodecData(): EditableProject {
  return {
    format: 'html-animation-project', version: 1,
    source: { id: 'scene-reference', revision: 'source-r7' },
    timeline: {
      version: '2.0.0', settings: { fps: 24, totalFrames: 100 },
      sources: [{ id: 'motion-source', from: { x: 0 }, to: { x: 240 }, easing: { kind: 'cubic-bezier', values: [0.25, 0.1, 0.25, 1] } }],
      layers: [{ id: 'group', type: 'layer', target: { selector: '.button' },
        spans: [
          { id: 'split-left', sourceId: 'motion-source', startFrame: 1, endFrame: 40, sourceStartFrame: 10, sourceEndFrame: 49 },
          { id: 'split-right', sourceId: 'motion-source', startFrame: 41, endFrame: 80, sourceStartFrame: 50, sourceEndFrame: 89 },
        ],
        propertyTimelines: {
          angleChannel: { id: 'angle-track', initialValue: { kind: 'number', value: 90 }, keys: [{ frame: 50, value: { kind: 'number', value: 35 }, easing: { kind: 'steps', count: 4, jump: 'end' } }] },
          opacity: { initialValue: { kind: 'number', value: 0.5 }, keys: [{ frame: 50, value: { kind: 'number', value: 0.8 } }] },
          presentChannel: { initialValue: { kind: 'boolean', value: false }, keys: [{ frame: 60, value: { kind: 'boolean', value: true } }] },
        },
      }],
      transitions: [{ id: 'transition-1', fromId: 'split-left', toId: 'split-right', durationFrames: 6, easing: 'ease-in-out' }],
    },
    htmlContext: {
      version: 1,
      gradients: { group: [{ id: 'main', type: 'linear', angle: 90, stops: [
        { id: 'first', color: { kind: 'color', r: 1, g: 0, b: 0, a: 1 }, opacity: 0.6, position: 0, present: true },
        { id: 'stable-absent', color: { kind: 'color', r: 0, g: 0.5, b: 1, a: 1 }, opacity: 0.4, position: 35, present: false },
        { id: 'last', color: { kind: 'color', r: 0, g: 0, b: 1, a: 1 }, opacity: 1, position: 100, present: true },
      ] }] },
      bindings: { group: { angleChannel: { kind: 'gradient', gradientId: 'main', component: 'angle' }, presentChannel: { kind: 'gradient', gradientId: 'main', stopId: 'stable-absent', component: 'present' } } },
      resolutions: [{ id: 'resolution-old', signature: 'expired-signature', choiceId: 'keep-id', objectIds: ['group', 'specific'] }],
    },
    documentChanges: [
      { fullXPath: '/html/body/main/button[1]', attribute: 'id', oldValue: null, newValue: 'AddedId' },
      { fullXPath: '/html/body/main/button[2]', attribute: 'class', oldValue: '', newValue: null },
    ],
    provenance: { kind: 'simulation', adapterRevision: 'HA-ADAPTER-001/r4', timelineReference: 'codec-fixture-only' },
    metadata: { title: 'Été 🎨', flags: [true, false, null], nested: { untouched: 'yes' } },
  };
}
