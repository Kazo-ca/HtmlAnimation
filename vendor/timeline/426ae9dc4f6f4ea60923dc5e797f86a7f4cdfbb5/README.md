<!-- README.md -->
# HA10 final-candidate conflicts — verified local checkpoint

- Repository: Kazo-ca/JsAnimationTimeline
- Functional commit: 426ae9dc4f6f4ea60923dc5e797f86a7f4cdfbb5
- Branch: v2/HA10-final-candidate-conflicts
- PR: https://github.com/Kazo-ca/JsAnimationTimeline/pull/131
- Target: v2/base. Open and unmerged. No tags or registry publication.
- Contract: HA10-FINAL-CANDIDATE-CONFLICTS/1, included in timeline-ha10-conflict-api.md.
- Base: HA9 98c1e216e5fad056f6a99f744cba78a988fd1ab6 (documentation head); prerequisite PRs #128/#129/#130.

HA10 adds editor.transactions.resolveHtmlConflict. It validates the original
blocking diagnostic ticket and explicit winner/prefix choice, applies only the
announced participant key writes, then creates the decision from the real final
diagnostic. A conflict eliminated by the writes needs no saved decision. No
implicit key, fabricated signature, internal import or second history is needed.

## Archives

Versions remain 1.0.0. Identify these files by commit and SHA-256, not version
alone. Install all three npm archives together; runtime and editor changed,
export-css is byte-identical to HA9. Keep the previous archives unchanged.

| File | SHA-256 |
| --- | --- |
| kazo-ca-timeline-runtime-1.0.0.tgz | 4BC4CDF7A977B0112290E3B9A8E7BDCC8B8E0D5B24EAEC4DF0F12E5BFAECC26B |
| kazo-ca-timeline-editor-1.0.0.tgz | 471DDFD1D34D47A9A0854CDD3E6AF33A05C6E6292CD2C598D65E9C45A52D190C |
| kazo-ca-timeline-export-css-1.0.0.tgz | B745CA1C740B926D29C6678DD682DE546D141A5E507ABC7DFA1012D66FCF93BE |
| JsTimeline.Blazor.1.0.0.nupkg | 106104EC5D21F89965CFEDC7BA6B58EDCE6FF21276219CB7B1E6A397D7AEC773 |

## Designer handoff

Verify hashes, copy the three tgz files under
vendor/timeline/426ae9dc4f6f4ea60923dc5e797f86a7f4cdfbb5/ in the Designer repository,
then install them together from that repository:

```powershell
npm install --save-exact ./vendor/timeline/426ae9dc4f6f4ea60923dc5e797f86a7f4cdfbb5/kazo-ca-timeline-runtime-1.0.0.tgz ./vendor/timeline/426ae9dc4f6f4ea60923dc5e797f86a7f4cdfbb5/kazo-ca-timeline-editor-1.0.0.tgz ./vendor/timeline/426ae9dc4f6f4ea60923dc5e797f86a7f4cdfbb5/kazo-ca-timeline-export-css-1.0.0.tgz
npm ls @kazo-ca/timeline-runtime @kazo-ca/timeline-editor @kazo-ca/timeline-export-css --all
```

Keep one runtime instance. Timeline has not written to the Designer repository.
Use the public IHtmlConflictTransactionRequest: label, stageId,
confirmation:{id,signature}, winnerLayerId, optional beforeFirst, optional
kind:'set' properties, and required isCurrent. The new diagnostic contributions
list supplies allowed {layerId,property} pairs, including CSS aliases. Do not
parse opaque IDs or signature strings. Do not mix an older runtime archive with
this editor API.

The host guard protects DOM identity/membership, source CSS and the UI ticket;
the HA4 signature alone does not encode all of these. The request is captured
once inside the busy boundary. The guard reads sources outside preview and is
checked through commit. Repeating an already resolved ticket is refused.
Undo/cancel restore the exact known prior conflict; redo revalidates current
context/capabilities without rerunning the old UI guard. The HA9 prepared host
renderer remains the single preview writer. Test this real public path in the
Designer before claiming integration complete.

## Validation

Clean dist, npm ci, zero-error lint, all workspace typechecks, package/demo builds.
4,066 JavaScript tests / 280 suites, including 45 HA10 public tests and executed
RED/GREEN regressions. 223 Playwright scenarios passed, CI=1, workers=2,
retries=0, ports 9441/9442, 2026-11-01 03:06:20–03:07:30 UTC. Six new browser
scenarios also passed separately. Test servers were stopped and ports checked free.
.NET Release: zero warnings/errors, 180 tests, local pack. npm/NuGet consumers
passed, including conflict transaction public types under Bundler and NodeNext
ESM/CJS. All 425 packed dist files and the relevant NuGet assets match the build.

Native ECC planner/TDD and final general/TypeScript/security reviews ran; no
remaining findings in the HA10 delta. No C# source/schema changed, so no C# review
or separate Blazor browser rerun is claimed. No dependencies changed; the existing
30 development audit issues remain. Full details: ha10-validation.md.
Reusable demo: demo/editor/final-candidate-conflicts.html.
Local logs: C:/Users/clefw/AppData/Local/Temp/JsTimeline-HA10-validation-20261031/.

## Separate follow-ups

Shared spatial projection is not delivered here. The independently reported
missing command:refused reason on some HA9 undo/redo paths is also not fixed in
HA10; see ha9-history-refusals.md. Its two consumer RED tests remain distinct
from the Designer observer-render test reported green on HA9. Do not overwrite
any previous checkpoint while installing or testing this one.
