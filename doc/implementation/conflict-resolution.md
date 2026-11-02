<!-- doc/implementation/conflict-resolution.md -->
# Batch 3a — explicit conflict resolution

Reference: HA-DESIGN-CONFLICT-001/r1. Date: 2026-10-30.
Consumes HA-DESIGN-001/r1 and HA-TL-001/r2 without changing either document.
Branch: `codex/conflict-resolution`, based on `codex/css-property-editors`.

## Scope and plan

The ECC planner selected the conflict-resolution portion of production-plan step 3.
Independent gradient tracks remain batch 3b. The incoming HA3/HA4 API notes and
HTML-context schema are read-only coordination inputs; no executable Timeline
reference is available or claimed by this batch.

1. Add an optional, versioned local adapter conflict capability. It supplies
   authoritative diagnostic periods, choices, saved decisions and atomic commands.
2. Present diagnostics and an explicit confirmation in the Designer. Route only
   already evaluated values on the affected overlap. Keep older adapters conservative.
3. Add shared prerecorded simulation fixtures and an interactive conflict workshop.
4. Validate undo, events, stale drafts, case59, browsers and package consumers;
   run ECC general, TypeScript and security reviews and prepare a stacked draft PR.

No interpolation, hold, frame scanning, key management or tween splitting moves
into the Designer. A choice that creates a starting key is available only when
the adapter advertises that exact, resolving action, including its announced writes.
One adapter command must undo both the decision and its writes.

## User journeys and UI contract

The author inspects the affected property, objects, elements and explicit interval,
opens a choice, reads its consequences and confirms or cancels. A saved choice is
independent of selection and can be undone through the shared history. A stale
signature suspends unsafe routing and requires a new choice. The group/ID reference
case remains automatic with no dialogue or additional key.

Use the existing paper/green authoring workbench and amber diagnostic treatment.
The affected property and interval precede target details; a modal confirmation
contains the choice, consequence and any explicitly announced keys. Test 320x960,
768x960, 1024x960 and 1440x960, wrapping long selectors and preserving keyboard focus.
Empty: no issues. Partial: suspend only unresolved overlap/property. Error: show
refusal/stale diagnostic with a fresh choice. Success: saved decision and shared undo.
Loading/permission states do not apply to this synchronous local simulation.

## Delivered

The optional HA-ADAPTER-001/r3 capability provides diagnostic tickets, explicit
choices, announced keys and stored resolutions. The Designer uses those tickets
without deriving periods or temporal values. A missing capability retains the older
current-frame suspension/refusal. The CSS panel and DOM tree gained no dependency.

The inspector shows the affected property, objects, elements, interval and saved or
stale state. Confirmation uses the exact fresh snapshot captured in its ticket.
Frame/selection/lifecycle or target-context changes invalidate a draft. The adapter
checks the guard around validation and commits through its shared history.
`resolutionchange` reports the detached project decision context after execute,
undo or redo; it never reports temporary CSS as an original-document change.

The shared simulation has three workshops: priority only, explicit priority plus
starting key (A), and stale decision. It contains authored samples only at
1/20/49/50/75/100. Pending/accepted A prefix samples are separate: a non-overlapping
member retains its base before its later key until A is explicitly confirmed.
No temporal hold, interpolation or key-splitting semantics are implemented here.

## TDD and review evidence

- RED checkpoint `ec8fb38`: four loaded integration tests failed on missing
  conflict API/actions, rather than an import failure.
- GREEN checkpoint `239042f`: 23 focused conflict/projection tests passed.
- Further RED/GREEN regressions cover a contradictory stale ticket, focus lost
  after confirmation, fresh announcements after an unnotified signature change,
  later exact-frame edits masked by scripted samples, the non-overlap prefix and
  preservation of unrelated properties in the accepted A outcome.
- Final focused set: 26 tests in `conflicts.test.ts`, `conflict-projection.test.ts`
  and `conflict-fixtures.test.ts`. Every accepted command has shared undo coverage.
- ECC planner and TDD guide ran before implementation. General, TypeScript and
  security custom Codex reviewers ran; all confirmed findings were reproduced,
  corrected and re-reviewed. Final results: APPROVE with no remaining findings.
  The last general review of browser-measurement deltas and last security delta
  review were static; their approval does not claim a browser run or real bridge.

## Validation executed

| Check | Result |
| --- | --- |
| `npm ci --offline --ignore-scripts --cache .npm-cache --no-audit --no-fund` | Passed from the lockfile/cache. First attempt met a server-log lock; stopped only the verified demo process, moved its logs outside node_modules and retried successfully. |
| `npm run lint` / `npm run typecheck` | Passed, zero lint warnings and strict TypeScript. |
| `npm run test:coverage` | 341 passed in 17 files; 93.27% statements, 80.90% branches, 96.60% functions, 98.06% lines. |
| `npm run build` | All three ESM/declaration/CSS packages passed. |
| `npm run build:demo` | Production demo passed. |
| `npm run check:packages` | Actual archives installed offline into a separate consumer; typecheck and bundle passed. |
| `CI=1 npm run test:e2e` | Final full run: 183 passed across Chromium, Firefox and WebKit in 5.1 minutes, including 33 conflict journeys. Initial measurement failures are described below. |
| UI evidence checker | Passed `artifacts/evidence/conflict-design-evidence.json`; the parent inspected all four rendered Chromium captures. |

The initial browser run exposed three measurement failures in existing geometry
journeys. Firefox added document coordinates with a 0.0000305px rounding difference;
the refusal check now verifies the unchanged transform and a 0.0001px coordinate
bound. WebKit natively scrolled its viewport by 2px to click the partly clipped
header Undo button; the target's document position, dimensions and board scroll
were unchanged. The test now compares document positions after that navigation,
retaining the original 0.5px bounds and immediate preview/board-scroll checks.
No geometry production code, retries or test timeouts were changed.

All engine-related tests use **simulations**. No real Timeline version, TL-C14
conformance or real export fidelity is claimed. The incoming integration documents
remain untouched and uncommitted where they arrived that way. The HA4 note informs
future mapping, but the local r3 capability is explicitly distinct from its schema.

Independent gradient/stop tracks and stage handles remain batch 3b. Project
save/reload and exports remain later batches. Nothing is merged or published.
