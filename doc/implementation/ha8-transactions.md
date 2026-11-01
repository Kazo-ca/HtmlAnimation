<!-- doc/implementation/ha8-transactions.md -->
# Atomic host transactions — consumer integration

Branch `codex/ha8-transactions`, based on the unmerged gradient PR #6.
Consumes `HA8-TRANSACTIONS/1` from the immutable provider reference
`f6de3c592c8c90c35285332f704ef68dfcce0b41`. The four original handoff documents
and eight incoming local integration files remain untouched. This is an in-progress
consumer verification record, not a full-product completion claim.

## Short plan established by ECC planner

1. Verify all three archives together and public installed exports/declarations.
2. Replace the custom stage decorator with the public inspection stage participant.
3. Map structure/bindings/keys and prepared host effects to one existing history.
4. Prove exact compensation, notifications, fault locking and native undo/redo.
5. Exercise real browser journeys, complete ordinary validation and ECC reviews.

## Installed provenance

| Package | Bytes | SHA-256 |
| --- | ---: | --- |
| runtime | 458115 | E8AED4B5126B6335DB78A9ACBBA27BD5B7924192CE11641C32FA9EBD63B6251F |
| editor | 1143418 | 3EACD0734240493740FE5F5095E19CE58F8CD51C84824BFB1EBF6A0D8CA57908 |
| export-css | 74077 | B745CA1C740B926D29C6678DD682DE546D141A5E507ABC7DFA1012D66FCF93BE |

All three are dev-only local file dependencies under the new immutable vendor path.
`check:timeline-artifacts` passed and the runtime is deduplicated. Historical HA6/7
archives are retained. The copied contract's SHA-256 is
`AF74AFE1A6C4F37C621D91A1B47395D570B3D6C41A9B0777F0037AF80250FD9D`.
No dependency was changed during a running test. Provider evidence is described in
the retained delivery README; it does not substitute for our adapter tests.

## Prepared original-document effect

The local boundary moves to HA-ADAPTER-001/r5. `ReversibleEffect.prepare(direction)`
is an optional pure capture for the real atomic participant; old simulation adapters
retain `redo/undo`. Real HA8 refuses an effect lacking preparation.

`setAttribute` captures raw value/absence, the net Full XPath journal, pending document
success, deferred notification buffer, target reference and first-execution flag.
Rollback restores that capture directly, including a partial apply; it never invokes
an inverse user action. Stale external source attributes and now-duplicate IDs refuse
preparation without overwriting the source. Already animated retargeting remains refused.

TDD: one runtime RED on missing preparation, then 14 simulation tests GREEN, including
partial DOM/tree failures, exact journal/target/pending restoration and preserved redo.
These tests verify the Designer participant, not the real backend transaction engine.

## Confirmed remaining rendering gap

The genuine HA8 test observes `document:changed`, `property:changed` and
`transaction:changed`. A gradient angle command has already installed its new document,
context and undo availability when `document:changed` fires, but the Designer's DOM
still displays the previous angle (90 rather than 35). Rendering on
`transaction:changed` is too late.

The inspection stage correctly does not own rendering. Solving only Designer-issued
commands with an ad-hoc preview effect would leave native Timeline UI/direct IEditor
commands outside the guarantee. Depending on listener registration order would also
leave earlier plugin observers exposed. A supported public prepared host-render path
must cover all these commands, undo/redo and rollback before success notifications.
The Designer must remain the single preview writer, and the Timeline must own temporal
evaluation and authoritative per-element HTML resolution. The failing real test is
retained; this guarantee is not marked complete or silently reduced.

The gap was reported through the supervising session. Integration continues on the
independent structural/effect paths while the public support is resolved.

Reproduction: `npm test -- tests/timeline-atomic.test.ts -t "exposes the committed Designer preview"`.
The same test now executes Designer and direct Timeline commands, including undo/redo,
and inspects all backend success events. It remains RED on the old DOM value.

Independent checks executed on installed HA8: 517 tests passed with this single known
RED excluded by an explicit name filter (not a complete-green suite); 30 genuine browser
journeys passed across Chromium/Firefox/WebKit with CI=1, two workers and zero retries.
Those journeys include new structure, first opacity object, ID/class effects and history.
The three package builds, both demo entries and strict typecheck passed. Final complete
coverage/browser/review gates remain pending the rendering support and any later mappings.

Intermediate ECC review findings were reproduced and fixed: context/effect-only groups
now transport preview/cancel refreshes without accepted-edit events; public `isGrouping`
rejects independent Designer commands before their effects. History refusals retain their
reason instead of appearing as empty history. Fault diagnostics are normalized and
latched, including unknown history exceptions and clock flush failures after commit.
Those three real test files passed 42 tests with the one backend-render test explicitly
excluded, followed by a separate genuine RED confirming the remaining gap. The clock
failures use the real Timeline clock with an injected exception after its actual advance.
No timeout or retry was increased. A slow initial structural composition was replaced by
one static activation component per unrecorded gradient; runtime samples remain dominant.

## Product work still separate

General CSS mapping, the exact group/ID case and genuine HA4 conflicts require public
bindings/bases and authoritative per-element resolution. Solution A signature changes
and relative r3 geometry/pivot mapping await the partner's explicit verified support.
No endpoint conversion or conflict signature rewrite is permitted as a workaround.
Versioned editable save/reload and faithful JSON/JS/CSS exports remain later plan steps.
No package publication, tag, deployment or merge is authorized by this integration.
