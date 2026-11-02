<!-- doc/implementation/editable-project.md -->
# Editable project — independent persistence slice

Reference HA-PROJECT-001/r1, 2026-10-31. This slice follows the explicit persistence
step in `plan.md`. It does not complete general CSS/group, spatial or conflict
integration work. Genuine integration uses the immutable HA9B reference in the
Timeline artifact manifest; pure and simulated tests remain separately identified.

## Product choices confirmed

The user's direct answer to question 0 of `call_14de248d5b864eb3b8dd77ed0ba9faf8`
requires the host to supply the original HTML/CSS again. The project is not an archive
of those resources. The user's direct answer to question 1 confirms manual file
save/load demonstration plus a host API.
No autosave or remote storage is introduced by this slice.

The host already owns the HTML and reapplication of ID/class changes. A saved source
reference contains an opaque host ID and revision. Actual opening must verify that
reference against the supplied source and check original XPath/attribute expectations;
resolving a path on an unrelated document is not a successful reattachment.

## Short plan established by ECC planner

1. Add a versioned editable envelope and a pure, dependency-free codec/validator.
2. Validate native Timeline data through injected ports and genuine public validators.
3. Capture/save complete native document, HTML context and original-source journal.
4. Open against a verified host source using a reversible coordinated mount, not an
   unannounced `load()` that discards the shared history.
5. Add the manual demonstration and faithful JSON/JS/CSS outputs through real APIs,
   with exact round-trip and browser evidence on one pinned Timeline reference.

## First independent sublot

`format:'html-animation-project'`, `version:1` identifies an editable envelope with:

- `source:{id,revision}` supplied and subsequently verified by the host;
- the complete native `timeline`, with initial values, keys, transitions, easings,
  retained curve sources, object identities, selectors and native metadata;
- complete `htmlContext`, including bindings, gradient/point identities and saved
  conflict decisions/signatures;
- the net `documentChanges` journal with original Full XPath and raw null/empty values;
- explicit real/simulation `provenance` and optional host JSON `metadata`.

The codec imports no Timeline, DOM or storage implementation. Required validation ports
check the native document/context; a structurally valid stale decision remains saved
for authoritative diagnosis instead of receiving a rewritten signature. Unsupported
envelope versions and playback JSON are refused, never silently migrated into projects.

Input/outputs are detached and bounded JSON data. Functions, accessors, cycles,
non-finite values and live DOM objects are refused without invoking getters or `toJSON`.
Safe copies preserve valid nested JSON property names without prototype assignment.
The source contains no preview styles or pre-evaluated frame dictionaries. Read-only
encoding/decoding creates no command/history entry and cannot mutate a document.

TDD starts with a runtime RED on the missing actual root export, followed by structural,
copy, hostile-data and round-trip tests. These pure tests do not claim real reload,
source reattachment, migration, playback or output fidelity.

## Native capture and reversible opening

The installed `editor.toJSON()` shares `editor.document`; capture must detach it.
`editor.load()` freezes its input and clears history, so it is not by itself an
undoable project-open operation. `integration/project-capture.ts` detaches the complete
native authoring state without sampling, rendering or changing history. Capture refuses
provisional/faulted state and detects a document/context transaction during serialization.

`integration/project-open.ts` accepts a decoded project and a trusted detached source
root supplied by the host. This root has the same tag/namespace as the permanent mounted
scene; the host guarantees its opaque reference and ready HTML/CSS resources. The file
itself never supplies executable HTML. Original Full XPath and raw null/empty attribute
expectations are validated at the actual mounted document location. Invalid references,
paths, raw values and global final-ID collisions are refused explicitly.

One public native transaction replaces the document/context and mounts the source with
its saved journal. `editor.load()` is never called. The previous and new actual nodes,
listeners and preview owners are retained for undo/redo on the same Designer instance.
The Root API `prepareProjectRehydration(readNext, direction)` prepares private state
compensation; it does not mount HTML or replay ID/class edits as new user commands.
`executeProjectMutation(action)` brackets the trusted host operation so success is
published only after its final flush. `getProjectState()` returns a detached source,
metadata and current net journal for subsequent captures.

`projectchange` publishes the complete restored source profile/journal and direction
once per accepted execute/undo/redo. It is distinct from `documentchange` for a new
attribute edit, `propertychange` for a new temporal edit and all temporary preview styles.
Failed compensation latches the existing persistent fault instead of claiming rejection.

The private workshop bridge currently accepts its mapped root layers and stable
`gradientObject`/`#gradient-box` gradient identity. Unmapped nested/group gradient data
must be refused before source consumption. The reusable codec retains the broader native
authoring schema; accepting JSON does not certify that a particular host can edit it.

The genuine demo provides manual download, file validation and explicit undoable opening.
Its host source catalogue contains `gradient-workshop-linear`, `-radial` and `-conic`,
revision `source-v1`. Unknown sources remain valid files but cannot open in this workshop.
The selected file does not replace the current project until **Ouvrir le projet** is used.
The simulation workshop remains separate.

`fixtures/gradient-workshop-conic-project.json` was captured through the genuine HA9B
Chromium save flow. Its sole angle key at frame 50, native context and peer-ID journal
are retained as a reusable download in the demo. The French chooser/filename use host
UI text rather than depending on the browser's native file-input language.

## Executed consumer validation

- Reproducible offline `npm ci --ignore-scripts --no-audit --cache .npm-cache`: passed.
- Lint, typecheck, three package builds, both demo builds, artifact/contract checks
  and the offline packed-package consumer: passed.
- Complete coverage run: 693 tests / 36 files passed, `--maxWorkers=1`, no filtered
  regression. Coverage: 92.88% statements, 82.86% branches, 96.71% functions,
  98.44% lines. Native opening includes 26 genuine cases; simulation tests are separate.
- Initial full browser run at `8780bb9`: 259 passed, five failed (three obsolete `r3`
  text expectations and two pointer clicks intercepted by a gradient center handle).
  The fix checks the actual French unavailability reason and selects through the
  real structure tree. Disabled-state/key assertions, retries and deadlines are unchanged.
- Corrected targeted runs: three spatial-control checks and 15 file journeys passed
  across Chromium/Firefox/WebKit, `CI=1`, workers=2, retries=0. Root-reset RED/GREEN,
  source journal, metadata, downloads, actual file chooser and full shared undo/redo
  are included.
- General, TypeScript and security native ECC static reviews approved the final
  implementation and small UI/test follow-up after findings were corrected. Reviews
  did not execute the parent's checks; no C# or dependency-audit result is claimed.

The final full-browser and exact-head CI results are recorded in
[draft PR #8](https://github.com/Kazo-ca/HtmlAnimation/pull/8), after those checks run.
Provider validation counts never replace these consumer results.

## Output boundaries still required

Public native validation and HTML context cloning are usable by integration ports.
Internal-looking declarations are not permission to deep-import unpublished functions.
Later outputs use `compilePlayback`, `compileHtmlPlayback`, `exportHtmlJavascript` and
`exportHtmlCss`; their exact declarations/capabilities and results need their own tests.
An export refusal must not prevent saving the editable project.
