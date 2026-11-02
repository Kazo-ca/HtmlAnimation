<!-- README.md -->
# HA9 prepared host rendering — verified local checkpoint

- Repository: Kazo-ca/JsAnimationTimeline
- Functional commit: c340203e50ac84f5fb58e8f9e60dc83f3c2bdf56
- Branch: v2/HA9-designer-integration-bridge
- PR: https://github.com/Kazo-ca/JsAnimationTimeline/pull/130
- Target: v2/base. PR remains open and unmerged. No tags or registry publication.
- Contract: HA9-HOST-RENDER/1, included in timeline-ha9-host-render-api.md.
- Base: HA8 f6de3c592c8c90c35285332f704ef68dfcce0b41; pending prerequisite PRs #128 and #129.

This is the host-render checkpoint only. Final-candidate conflict resolution and
shared spatial projection are separate authorized follow-ups, not delivered here.

## Archives

All local versions remain 1.0.0. Identify this checkpoint by commit and SHA-256,
not by the version number. Install all three npm archives together. Runtime and
export-css have the same bytes as HA8; the editor contains the new renderer API.
The NuGet package contains the same verified runtime/editor ESM and editor CSS.

| File | SHA-256 |
| --- | --- |
| kazo-ca-timeline-runtime-1.0.0.tgz | E8AED4B5126B6335DB78A9ACBBA27BD5B7924192CE11641C32FA9EBD63B6251F |
| kazo-ca-timeline-editor-1.0.0.tgz | 9C816308D0AB97E6FF0CB94FE56101379C01967A3C95D53FFCC8140221FE96C4 |
| kazo-ca-timeline-export-css-1.0.0.tgz | B745CA1C740B926D29C6678DD682DE546D141A5E507ABC7DFA1012D66FCF93BE |
| JsTimeline.Blazor.1.0.0.nupkg | 0575088DD5E9CE4989A6965C5584F82F3D3609F2E6F08C485BAB6627E1E50300 |

## Designer installation and integration

1. Verify these hashes before copying. Keep older HA7/HA8 archives unchanged.
2. Copy the three tgz files into the Designer repository under
   vendor/timeline/c340203e50ac84f5fb58e8f9e60dc83f3c2bdf56/.
3. From that repository, install all three local paths together:

```powershell
npm install --save-exact ./vendor/timeline/c340203e50ac84f5fb58e8f9e60dc83f3c2bdf56/kazo-ca-timeline-runtime-1.0.0.tgz ./vendor/timeline/c340203e50ac84f5fb58e8f9e60dc83f3c2bdf56/kazo-ca-timeline-editor-1.0.0.tgz ./vendor/timeline/c340203e50ac84f5fb58e8f9e60dc83f3c2bdf56/kazo-ca-timeline-export-css-1.0.0.tgz
npm ls @kazo-ca/timeline-runtime @kazo-ca/timeline-editor @kazo-ca/timeline-export-css --all
```

Keep one runtime instance. Preserve the resulting lockfile and the verified vendor
archives. No registry version is implied by these files. Timeline has not written
to the Designer repository or installed them there.

Use the public EditorOptions.hostRenderer with createHtmlInspectionStage. Prepare
from candidate.document, candidate.htmlContexts, candidate.time and candidate.sample.
The participant returns the existing synchronous IPreparedHostChange contract.
Remove the previous late preview writer; keep a single DOM owner and exact rollback
of style attributes/priorities and host journals. Do not import internal helpers.

Reentrant mutations during notifications are refused synchronously; a new call
immediately after notification is allowed. Read the included contract for seek,
clock failure, active-group cancellation, initialization and destruction semantics.
The host callbacks remain trusted code with a synchronous, side-effect-free prepare.

Run the Designer regression:

```powershell
npm test -- tests/timeline-atomic.test.ts -t 'exposes the committed Designer preview'
```

The expected gradient series is 35 -> 90 -> 35 -> 55 -> 35 -> 55 for transaction
execute/undo/redo and direct Timeline edit/undo/redo. Each first public observer
must already see the matching DOM, context and history. Timeline's tests do not
claim that the Designer adapter has passed; its own integration test must run.

## Validation

Clean dist, npm ci, zero-error lint, all workspace typechecks, package/demo builds.
4,021 JavaScript tests / 276 suites including 37 new host-render tests.
217 Playwright scenarios passed, CI=1, workers=2, retries=0, ports 9431/9432;
2026-11-01 02:38:10–02:39:23 UTC. Seven HA9 browser scenarios are retained.
.NET Release build: zero warnings/errors; 180 tests; local pack.
npm/NuGet consumers passed, including public host-render types for Bundler and
NodeNext ESM/CJS, C# and static assets. All 424 packed dist files match the build.

Native ECC planner/TDD, general, TypeScript and security reviews completed.
Final reviews have no remaining findings. No C# source/schema changed, so no C#
review or separate Blazor browser rerun is claimed. Existing 30 development audit
issues are unchanged; dependencies and lockfile were not modified in this lot.

See ha9-validation.md for evidence and corrected failures. Local logs are in
C:/Users/clefw/AppData/Local/Temp/JsTimeline-HA9-validation-20261031/.
Reusable demo: demo/editor/host-rendering.html (serve the built editor demo).
