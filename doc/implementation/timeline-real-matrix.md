<!-- doc/implementation/timeline-real-matrix.md -->
# Real Timeline verification — Designer consumer matrix

Reference HA-REAL-MATRIX-001/r4, 2026-11-01. This is a consumer evidence record and
API request; it does not amend HA-TL-001/r2 or claim a delivered shared signature.

## Current installed HA9B reference — consumer verification ongoing

Functional reference `6d19da1f75af53e902b86164ce4cfb8003cef465` includes HA8 atomic
transactions, HA9 prepared rendering, HA10 final-candidate conflicts and the
`HA9-HISTORY-REFUSALS/1` supplement. All three archives were installed together after
the preceding test run ended. Their hashes, installed public manifests/ESM and all four
copied contract checksums pass verification; runtime is deduplicated. Previous immutable
vendor checkpoints are retained.

The two unchanged public backend refusal regressions now pass with the precise reasons
`Permission undo refusée` and `Permission redo refusée`. Only the fault-accessor test seam
needed the new additive `resolveHtmlConflict` method delegated to its genuine instance.
No expected refusal, timeout or retry policy was weakened. Full consumer validation of
this reference is recorded below as it executes; provider test counts are not our evidence.

Fifteen editable-file journeys and three explicit spatial-unavailability checks passed
across Chromium/Firefox/WebKit with CI=1, workers=2 and retries=0. These cover native
download, unsupported-source validation, invalid-file refusal, root reset and the complete
A/B/open/edit/undo/redo chain with source journal and metadata. All 693 unit/integration
tests pass, including the 26 native opening cases. See `editable-project.md` for the
initial browser failures, their fixes and the exact PR record of final full validation.

General adapter lot (2026-11-02, branch `codex/general-adapter`): the bridge now reads
the recursive layer tree, so folders and class-group selector layers are listed and
selectable. Gradient identities are read, composed and edited on any selector layer.
Explicit first-edit targets, including class groups, become root layers with
collision-free `objectN` identities. Several targets created in one command share one
undo. Writes still use an explicit property mapping table and remain opacity-only until
the atomic CSS lot. Opening refuses only a gradient whose owner is not a selector layer.
Timeline's own refusal of an absent target is kept unchanged.

Atomic CSS lot (2026-11-02, branch `codex/atomic-css`, stacked on the general adapter):
`integration/css-mappings.ts` maps opacity, color and the four logical border-style
longhands. Hyphenated declarations use explicit stable aliases such as
`borderBlockStartStyle` with an explicit style binding; nothing is inferred from a
camelCase name. A declared or inferable binding takes its base from Timeline inspection.
A new alias reads each group member through the public `readHtmlPropertyBase` inside the
preview owner's source window. The real context is never mutated, and divergent group
bases are refused. Colors accept hexadecimal, `rgb()`/`rgba()` and `transparent`; named
colors, variables and CSS-wide keywords are refused explicitly, because Timeline's
internal parsers are not public. Several properties and targets commit as one command
with one undo. Locked layers (directly or through a folder), duplicate declarations and
implicit binding replacement are refused before mutation.

HA10 conflict lot (2026-11-02, branch `codex/ha10-conflicts`, stacked on atomic CSS):
`integration/conflict-bridge.ts` maps Timeline's blocking diagnostics onto the local r3
conflict capability. Each conflict is reported under its binding's CSS name, so aliases
match the Designer.
- Choices are Timeline's own `choices` × `policies`. The native `id` and `signature`
  are passed through as opaque values and never parsed.
- Choice A is announced only when the winner's own style contribution has a first key
  after the conflict start. It writes that key's value at the start frame, limited to
  the public `contributions` pair.
- `editor.transactions.resolveHtmlConflict` commits the decision and its announced keys
  as one native transaction and one undo. No local period engine, signature or winner
  exists.
- The canonical ID-over-class case stays automatic.

Two consumer fixes made the Designer's own confirmation guard compatible with HA10.
The final revalidation sees Timeline's candidate, so the bridge reports the confirmed
revision while it is confirming. The target guard now compares source attributes through
the shared preview owner, because committed preview styles are not source changes.

HA11 lot (2026-11-02, branch `codex/ha11-spatial`, stacked on HA10): the verified
HA11 checkpoint `2b920f1123458b2ddd80d5c726eb1b11047e1d82` is installed from
`vendor/timeline/2b920f1…/`. Its archive SHA-256 values match the provider record, and
`HA11-SPATIAL-PROJECTION/1` is verified with the four earlier contracts. On the new
packages and before any consumer change, 722/722 tests and 264/264 browser journeys
passed unchanged.

`integration/spatial-bridge.ts` maps the Designer geometry writes (translate, rotation,
scale, pivot) to explicit `spatial*` aliases with `spatial` bindings. HA4 builtins such as
`rotation` keep their absolute meaning.
- Each layer gets one `prepend-trs` projection captured from the source inside the
  preview owner's source window. An authored inline value is preferred; otherwise the
  computed value is used, with provenance recorded either way.
- A track's unit is fixed by its first key, and a unit change is refused rather than
  converted.
- Bases come from the definition: identity for adjustments, the captured origin for a
  pivot in the same unit, and an explicit refusal otherwise. The internal
  `readHtmlSpatialValue` and group-source capture are not public.
- Groups must share one demonstrable source. Rendering passes `resolveHtmlSpatialBindings`
  results to `composeHtmlDeclarations`.
- The Designer's own fields and handles still refuse geometry while a shared preview
  exists. Enabling them is the next step.

These packages are local unpublished archives, not an assumption about a registry release.

The preceding HA9 record is archived in `timeline-real-matrix-r3.md`.

| Current genuine consumer path | Evidence exercised in this lot | Explicit boundary |
| --- | --- | --- |
| Authoring capture | Native keys, retained curve sources/transitions/easings, context, net journal and metadata; no sampling/load/history mutation | Editable envelope only; no playback export implied. |
| Source reattachment | Trusted host source at its actual Full XPath location, raw null/empty expectations, root attributes and a new animated ID applied from the journal | Host supplies original HTML/CSS and stable resource revision again. |
| Same-history project opening | Original A nodes/listeners/owner preserved through B and back; old attribute and key commands still undo/redo; B settings/time remain coherent | Folders and any selector-layer gradient owner open; an ownerless gradient refuses before mutation. |
| Opening compensation | Partial mount, Root adoption and renderer failures restore exact nodes/parents, authoring data, context, journal, owner, policy and redo | Irrecoverable compensation is a persistent fault, never a clean rejection. |
| Replay resource guards | Mount/render invalidation on undo/redo, active A independent of unavailable B, including no CSS projection | No obsolete UI confirmation reused for replay. |
| Files and source journal UI | Real downloads, read-only validation, explicit open/undo/redo, source metadata retained, fresh workshop root reset | Demo catalogue contains its three source fixtures only. |
| Recursive inventory, targets and class groups | Genuine nested folders, nested gradient owners, class-group first edits, multi-target single undo and early refusals (`timeline-general-adapter.test.ts`) | Writes are mapped explicitly through the CSS mapping table. |
| Atomic CSS | Genuine opacity, color and logical border-style keys with typed source bases, aliases, group bases, compound single undo and early refusals (`timeline-css-atomic.test.ts`) | Other CSS declarations, named colors and r3 spatial adjustments stay explicitly unmapped. |
| HA10 conflicts and choice A | Genuine priority decision, choice A with its announced key, one undo/redo, stale revision/signature/choice/guard refusals, canonical ID-over-class, aliased CSS name and the Designer path (`timeline-ha10-conflicts.test.ts`) | No browser journey yet; `before-first` policies are mapped generically but no native fixture produced one. |
| HA11 spatial projection (bridge) | Genuine translate/rotate/scale/pivot keys, source capture and authored suffix, pivot base, compound single undo, unit refusal and group-source refusal (`timeline-ha11-spatial.test.ts`) | Designer fields/handles still refuse with the shared preview; no sourceTransform capture track or explicit conversion UI yet. |
| Outputs | Existing simulations | No faithful JSON/JS/CSS playback export claim. |

Native project-opening tests use the installed packages and public fault seams. The
separate `project-rehydration` tests use a simulated host and prove only the reusable
participant. Final ordinary gate results and exact CI head are reported in the editable
project PR; the early targeted browser counts above are not a full-product completion.

## Previous installed HA9 reference — historical evidence

Functional reference `c340203e50ac84f5fb58e8f9e60dc83f3c2bdf56`, contracts
`HA8-TRANSACTIONS/1` and `HA9-HOST-RENDER/1`. The three archives are dev-only local
dependencies installed together. `check:timeline-artifacts` verifies their size/hash,
installed public manifests/ESM and copied contract checksums. Runtime is deduplicated.

The unchanged backend observer regression now passes: execute/undo/redo through the
Designer and directly through Timeline expose the committed DOM, context and history.
The early-created shared preview owner replaces notification-time Designer rendering.
Owner compensation, initialization, seek, destruction retry, native loads and the exact
four-button group/ID reference have targeted genuine tests. Two new RED/GREEN tests cover
native color/text reading and cleanup after bridge bootstrap failure.

Two genuine tests still fail on the public reason of refused backend undo/redo. HA9
discards `command:refused` while cancelling its atomic notification batch; the bridge
therefore has only its generic French refusal. The precise expected reasons remain in
the tests. This is not a full-green integration checkpoint. HA10 archives have been
received separately but are not active here and do not fix those two cases.

General CSS/target creation, conflict A and source-relative r3 spatial mapping remain
separate work. Shared spatial fields/handles are explicitly disabled meanwhile.
Project codec/capture/opening verification is recorded independently in
`editable-project.md`; it is not implied by an owner-render test.

The previous matrix is preserved in `timeline-real-matrix-r2.md`.

## Previous installed HA8 reference — historical evidence

Functional reference `f6de3c592c8c90c35285332f704ef68dfcce0b41`,
contract `HA8-TRANSACTIONS/1`. The three immutable archives are installed together;
their sizes/hashes and exact installed manifests/ESM match. Runtime is deduplicated.
The public factory/transaction/result declarations have been read from those packages.
See `ha8-transactions.md` for provenance, RED/GREEN and the confirmed remaining
backend-notification/Designer-render gap. That guarantee is not complete.

| Current consumer path | Executed evidence | Remaining limit |
| --- | --- | --- |
| New gradient point + bindings + four keys | Genuine integration tests and three-browser journey, shared undo/redo with stable IDs and false initial presence | Backend observers still need prepared Designer rendering before notification. |
| First opacity edit on the witness | Genuine object/target/binding/base/key transaction, hold/direct seek and undo removing object/context | This private mapping covers opacity on the fixture witness; general CSS is a separate extension. |
| Original ID/class effects | Genuine three-browser edits, Full XPath journal and shared undo/redo; 14 simulation tests for exact participant compensation | Animated retargeting remains refused. No source save/reload claim. |
| Fault and compensation | Genuine refused partial apply preserves redo; failed rollback is faulted and blocks mutation/history | Final reviewed conformance and render participant compensation remain pending. |
| Element geometry/conflicts/output | Existing simulations and explicit genuine refusals | Relative r3/HA4 and conflict-A support are being coordinated; project round-trip/exports remain later work. |

517 independent tests passed with the known rendering RED explicitly filtered out;
30 genuine browser journeys passed. This is not a full-green HA8 integration result.

The original HA7 matrix is archived in `timeline-real-matrix-r1.md`. Its tested subset
and historical boundaries below are retained as history, not assumed HA8 passes.

## Previous HA7 reference and completed checkpoint evidence

Previous functional commit: `a3b7652534a4532050d8c21d3703f957c50d61d9`, branch
`v2/HA7-gradient-stop-order`, PR128 open and unmerged. Documentary head:
`f88738c3b9ade14850b8f9ce91dfda6a336eec64`. All three new archives were verified
and installed together from a new immutable vendor path; HA6 was not overwritten.

| Archive | Bytes | SHA-256 |
| --- | ---: | --- |
| runtime 1.0.0 | 452565 | 64000DD3C3FA3F6EBF0F82029E244DA7151E6F3AF3B81A41D74B924A41E227F2 |
| editor 1.0.0 | 1107559 | 3FC98E27B0090800D4F7F16717E29B4F2ACDEA3E63328525CFC115FD078B11CA |
| export-css 1.0.0 | 74077 | B745CA1C740B926D29C6678DD682DE546D141A5E507ABC7DFA1012D66FCF93BE |

`check:timeline-artifacts` passed: installed public manifests/ESM bundles match the
verified archives byte for byte. Runtime is deduplicated. HA7 implements the chosen
rendering sort; genuine Designer journeys are recorded separately. HA8 atomic host
transactions are authorized but are not delivered by these archives.

## Initial installed HA6 reference (historical)

Source: `Kazo-ca/JsAnimationTimeline`, integrated `v2/base` commit
`f93429bd55d3f950b31bb833c6068176de0555bd`. Functional HA6 reference:
`3345e1ca499c5141527275bf72ba9e7c1e5e5811`. Provenance was relayed from
`timeline-ha6-lot3b-delivery.md`; the later choice of local installation overrides
its older introductory paragraph saying that choice was pending.

The three original archives were hash-checked, copied into immutable
`vendor/timeline/f93429bd55d3f950b31bb833c6068176de0555bd/` and installed together
as dev dependencies. Runtime is deduplicated. These are genuine package imports,
without Vite aliases into the Timeline source tree. The three publishable Designer
packages keep their existing dependency boundary.

| Archive | Bytes | SHA-256 |
| --- | ---: | --- |
| runtime 1.0.0 | 452546 | F8B213E5B51EE7545A1DB281B2524D13B5D4555DB752BBAAC6285F190D633405 |
| editor 1.0.0 | 1107559 | 3FC98E27B0090800D4F7F16717E29B4F2ACDEA3E63328525CFC115FD078B11CA |
| export-css 1.0.0 | 74108 | C567D1CDE307531E902012A72E757F9DFAC4276901381D0139F5026289EC2A29 |

Installation performed: ordinary offline npm install, scripts disabled. `npm ls`
confirms one runtime shared by editor/export-css. Browser style entry:
`@kazo-ca/timeline-editor/timeline-editor.css` (explicit import required).

## Required real evidence on one exact reference

Designer-owned tests import the installed archives, not Timeline source or mocks.
18 focused integration tests and all 21 browser journeys passed. The broader local
240-case browser run had 238 passes/two unrelated accessibility timeouts under load;
clean-install coverage had 492 passes/one 5s genuine-test timeout. These are not complete
local-green results. Simulation results never enter this table.

| ID / contract | Genuine-package journey | Current limit |
| --- | --- | --- |
| R-G01 / TL-C01,C02 | Edit one gradient angle/stop channel; independent keys and unrelated tracks intact. | PASS limited mapped gradients, tests/timeline-real.test.ts and browser journeys. No arbitrary CSS/new-object claim. |
| R-G02 / TL-C04,C05 | Direct seeks before/after first key; no implicit key, runtime owns hold. | PASS genuine direct seek/base/hold before and after the key; no Designer evaluator. |
| R-G03 | Opaque normalized stop color and independent alpha; stable IDs through crossing. | PASS HA7 sorted evaluated output, stable stored structure and independent alpha. |
| R-G04 / TL-C10 | Two-component center/radii transaction, one undo/redo and proper events. | PASS keys-only center/radii commands and center gesture. Own notifications coalesced; backend observations are not globally atomic in HA7. |
| R-G05 | Presence of a pre-registered point at image 50, initial false, no false key at1. | PASS limited presence path; definition was registered before editing, so this does not prove structural creation. |
| R-G06 | New definition + bindings + four component writes; all restored by one undo/redo. | BLOCKED and visibly refused: atomic host context/effect API missing in installed HA7; await HA8. |
| R-G07 / TL-C11,C12 | Seek, object/point/property selection, expansion and refresh without user edits. | Row IDs are opaque. |
| R-G08 / TL-C06,C13,C14 | Case59, group source divergence, explicit/stale decisions independent of selection. | Local r3 conflict schema requires explicit HA4 mapping. |
| R-G09 / TL-C16 | Editable project round-trip: original keys, identities, HTML structure/context. | Generic document and HTML context saved separately. |
| R-G10 / TL-C15 | JSON/JS faithful per-frame render; CSS accepts supported hold or explicitly refuses gradient interpolation. | HA5 discrete precision versus HA6 continuous guarantee. |
| R-S01 | Source matrix + local r3 adjustment versus HA4 decomposed component semantics. | BLOCKED mapping: no silent property-name equivalence. |
| R-H01 | Original ID/class effect + keys share atomic history and post-commit events. | BLOCKED same host-effect API gap as R-G06. |
| TL-C03,C07,C08,C09,C17,C18 | Runtime capture/splitting/easing invariants through the actual Designer adapter. | Not established by installed packages or Timeline's own tests alone. |

Additional real regression evidence: frame changes during a command cancel its public
group; mutation from the adapter's terminal notification is synchronously refused and
can be retried afterward; a direct backend nested property write is detected and its
whole group cancelled before commit. This detection does not prevent HA7's intermediate
backend notifications. Accepted-value receipts remain correct when an observer seeks.
Public stage metadata reads preserve preview and original inline spelling in both
Designer/host disposal orders, including unrelated live declarations.

The structural-add fixture and source ID/class undo tests use simulations only. The
genuine bridge refuses HTML effects; no R-H01 pass is claimed. Geometry handles for
gradient geometry are distinct from the existing r3 element-transform adjustment model;
the latter is refused in the genuine bridge until its HA4 semantics are explicitly mapped.

Remaining product work after this independent 3b slice: complete atomic host participation
on one delivered HA8 reference; real conflict/spatial mapping; versioned editable-project
save/reload including original HTML context and decisions; faithful JSON/JS/CSS output
with explicit unsupported cases; full TL-C01–TL-C18 consumer verification and browser
journeys on the same final reference. A debug JSON view is not project round-trip/export
completion. No batch is closed by reducing its promised semantics.

## Minimal requested extension — HA-HISTORY-REQUEST-001/r1

The consumer needs a public command/transaction mechanism that can register opaque
host-context effects beside temporal writes. Names are not prescribed here. Required
guarantees: validate permissions/ticket before and after host callbacks; apply all or
none; compensate both document and host effects on any failure/veto; cancel preserves
the previous redo stack; undo/redo restore both and revalidate capabilities; observations
occur only after the complete commit. Context includes gradient definitions/bindings,
conflict decisions and persistent ID/class changes. The generic engine need not know
CSS, DOM or XPath.

Conformance must include rejected middle writes, throwing effects, reentrant frame or
selection changes, cancellation, redo after changed capabilities and lifecycle invalidation.
Using load(document), a second history, or setAnimationContext in a pure ICommand is
not an acceptable substitute. Timeline's reported cancelGroup behavior does not promise
undo callbacks for such effects. Structural-add finalization stays suspended.

The user selected synchronous refusal of mutations requested during terminal
notification. There is no implicit queue; a new call after notification may succeed.
Read-only observations/navigation must not corrupt the accepted-value receipt.

Additional HA8 consumer obligations, awaiting its delivered public contract:

- A metadata-only `IStage` decorator does not automatically inherit atomic
  participation registered on its original HTML stage. Matching `stageId:'html'`
  is insufficient. Require a supported public decorator/participant or a verified
  single-writer mount; never use internal exports.
- ID/class effects capture net journal, pending document notifications, initial
  execution flag and target state. Compensation must restore the exact capture,
  not call the inverse user action and prepare another notification.
- Compensation failure must remain an explicit faulted state with visible
  diagnostic and blocked editing/history until coherent recovery. Mapping it to
  ordinary rejected, or swallowing it in a catch, would falsely promise no effects.
