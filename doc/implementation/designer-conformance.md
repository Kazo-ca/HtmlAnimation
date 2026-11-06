<!-- doc/implementation/designer-conformance.md -->
# Designer conformance to HA-TL-001 (TL-C01 to TL-C18)

Date: 2026-11-06. Reference: installed HA11 `2b920f1123458b2ddd80d5c726eb1b11047e1d82`.
Its code is identical to Timeline `v2/base` `b7967436e341ae43022651ac7138b46c4895e4f6`
(Timeline PR #133, merged); only documentation differs.

Timeline proved the 18 cases on its own built packages in Timeline PR #134
(`doc/integration/timeline-conformance.md` on `v2/TL7-conformance`, run of 2026-11-04,
Chromium). This document is the Designer side: the same cases run through `HtmlDesigner`,
its panel and scene, the genuine bridge (`integration/timeline-real.ts`) and the shared
history. Genuine evidence uses the installed packages through `createRealGradientHost`.
Simulation evidence (`createRecordedTimeline`, `fixtures/conflict-timeline.ts`) is listed
separately and never counts as conformance.

| Case | Genuine Designer evidence | Simulation only | Verdict |
| --- | --- | --- | --- |
| TL-C01 | `timeline-real.test.ts` (one component at 50, one key, undo/redo); `timeline-atomic.test.ts` (first opacity edit); `e2e/timeline-real.spec.ts` (angle at 50) | `designer.test.ts` | Conforms |
| TL-C02 | `designer-conformance-real.test.ts` “TL-C02” (geometry edit at 50, opacity tween and samples identical) | — | Conforms |
| TL-C03 | `designer-conformance-real.test.ts` “TL-C03” (capture at 40 keeps the evaluated value, neighbours unchanged) | — | Conforms |
| TL-C04 | `designer-conformance-real.test.ts` “TL-C04” (hold until the next key and after the last, scene and panel) | — | Conforms |
| TL-C05 | `designer-conformance-real.test.ts` “TL-C05” (literal 100 % → 80 % at 50, only key `[50]`); `e2e/timeline-real.spec.ts` (no invented earlier key) | `conflict-fixtures.test.ts` | Conforms |
| TL-C06 | `timeline-host-render.test.ts` (four-button reference, sole ID key at 50, no implicit key); `timeline-ha10-conflicts.test.ts` (ID over class automatic) | `designer.test.ts`, `conflicts.test.ts`, `e2e/conflicts.spec.ts` | Conforms |
| TL-C07 | `designer-conformance-real.test.ts` “TL-C07/TL-C18” (key inserted in elastic, bounce and overshooting Bézier tweens: two transitions, identical motion, one undo) | — | Conforms |
| TL-C08 | Not reachable: the Designer creates no MotionTween; the Timeline editor UI does (Timeline report) | — | Timeline only |
| TL-C09 | Not reachable from Designer edits; Timeline marks it as a host capability (open question C09) | — | Timeline only |
| TL-C10 | `timeline-real.test.ts` (centre X/Y, one undo); `shared-handles-designer.test.ts`, `e2e/shared-handles.spec.ts` (handle gesture, one undo, Escape leaves nothing); `shared-geometry-designer.test.ts` | — | Conforms |
| TL-C11 | `designer-conformance-real.test.ts` “TL-C11” (navigation and selection refresh the panel, no key, edit or history) | `designer.test.ts`, `shared-preview-designer.test.ts` | Conforms |
| TL-C12 | Timeline layer disclosure belongs to the Timeline editor UI (Timeline report) | `controls.test.ts`, `e2e/designer.spec.ts` | Timeline only |
| TL-C13 | `designer-conformance-real.test.ts` “TL-C13” (direct seek, linear playback and JSON export agree, with two selections) | `e2e/designer.spec.ts` | Conforms |
| TL-C14 | `timeline-ha10-conflicts.test.ts` (explicit, saved, undoable decision; choice A key only after confirmation; stale tickets refused; Designer path) | `conflicts.test.ts`, `e2e/conflicts.spec.ts` | Conforms (no genuine conflict browser journey) |
| TL-C15 | `playback-outputs-real.test.ts` (JSON, JS, continuous CSS, explained CSS refusal, hostile identifiers); `e2e/playback-outputs.spec.ts` | — | Conforms |
| TL-C16 | `project-codec-real.test.ts`, `project-capture-real.test.ts`, `project-open-real.test.ts` (keys, transitions and easing kept through open, undo and save); `e2e/project-files.spec.ts` (playback dictionaries refused as projects) | `project-rehydration.test.ts` | Conforms |
| TL-C17 | Effect choice lives in the Timeline transition dialog (open question D5); the Designer keeps easing through save (`project-open-real.test.ts`) | — | Timeline only |
| TL-C18 | `designer-conformance-real.test.ts` “TL-C07/TL-C18” (whole and fractional frames, before and after the inserted key) | — | Conforms |

Open Timeline-side questions (C09, G1/G2 structured diagnostics, D5/C17) stay with the
Timeline thread. TL-C12 and TL-C17 have no Designer surface. TL-C08 and TL-C09 are
reached only by editing transitions in the Timeline editor itself.
