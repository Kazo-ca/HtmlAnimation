<!-- README.md -->
# HA9B history refusal feedback — verified local checkpoint

- Repository: Kazo-ca/JsAnimationTimeline
- Functional commit: 6d19da1f75af53e902b86164ce4cfb8003cef465
- Branch: v2/HA9B-history-refusal-events
- PR: https://github.com/Kazo-ca/JsAnimationTimeline/pull/132
- Target: v2/base. Open and unmerged. No tags or registry publication.
- Contract supplement: HA9-HISTORY-REFUSALS/1, included in timeline-ha9b-history-refusals-api.md.
- Base: HA10 a3f9c04be2dad14100434abf9a373e890c6fb3ac (documentation head); prerequisite PRs #128/#129/#130/#131.

With prepared host rendering, refused undo/redo now publishes command:refused
once after compensation. CommandRefusedError.reason is preserved without its
message prefix, and an ordinary command retains its original identity.
Composite entries expose a stable frozen descriptor whose do/undo are inert.
Immediate and queued callbacks remain guarded against reentrant mutations and
recursive refusal delivery. Empty history and compensation faults stay distinct.
The included HA10 final-candidate conflict API remains available.

## Archives

Versions remain 1.0.0. Identify this checkpoint by commit and SHA-256, not version
alone. Install all three npm archives together. Runtime and export-css are
byte-identical to HA10; the editor contains HA9B. Keep older archives unchanged.

| File | SHA-256 |
| --- | --- |
| kazo-ca-timeline-runtime-1.0.0.tgz | 4BC4CDF7A977B0112290E3B9A8E7BDCC8B8E0D5B24EAEC4DF0F12E5BFAECC26B |
| kazo-ca-timeline-editor-1.0.0.tgz | BC12A4A58670C9E18AB783DAF8E3B9A2F97B9DBD1133DFD9EA38418F3059FC22 |
| kazo-ca-timeline-export-css-1.0.0.tgz | B745CA1C740B926D29C6678DD682DE546D141A5E507ABC7DFA1012D66FCF93BE |
| JsTimeline.Blazor.1.0.0.nupkg | 9C305953275C810B98443351AD9F4A2F9676EFCAE9F7E42197261E45EB2CE3A4 |

## Designer installation and consumer check

Verify hashes, then copy the three tgz files under
vendor/timeline/6d19da1f75af53e902b86164ce4cfb8003cef465/ in the Designer repository.
From that repository:

```powershell
npm install --save-exact ./vendor/timeline/6d19da1f75af53e902b86164ce4cfb8003cef465/kazo-ca-timeline-runtime-1.0.0.tgz ./vendor/timeline/6d19da1f75af53e902b86164ce4cfb8003cef465/kazo-ca-timeline-editor-1.0.0.tgz ./vendor/timeline/6d19da1f75af53e902b86164ce4cfb8003cef465/kazo-ca-timeline-export-css-1.0.0.tgz
npm ls @kazo-ca/timeline-runtime @kazo-ca/timeline-editor @kazo-ca/timeline-export-css --all
npm test -- tests/timeline-atomic.test.ts -t "reports a public backend"
```

Keep one runtime/editor instance. Preserve the lockfile and verified vendor files.
Timeline has not written to the Designer repository or rerun its consumer tests.
The unchanged expectations are exactly "Permission undo refusée" and
"Permission redo refusée", received through command:refused with the restored
project/history/preview and no persistent fault. Do not weaken these tests or
replace the precise error with generic fallback text. The previously green HA9
observer-render test is a separate integration proof.

Transactions returning EditorTransactionResult keep their structured result
channel; they do not additionally emit the ordinary refusal event. Their reason
also preserves CommandRefusedError.reason. Retrying after the refusal callback
returns remains allowed. A nested mutation during the callback is refused.

## Validation

Clean dist, npm ci, zero-error lint, all workspace typechecks, package/demo builds.
4,088 JavaScript tests / 282 suites, including 22 new public regressions with RED
and GREEN evidence. Targeted regression: 207 tests / 20 suites; four measured
files reached 94.35% statements, 90.83% branches, 92.2% functions, 97.31% lines.
226 Playwright scenarios passed, CI=1, workers=2, retries=0, ports 9451/9452;
2026-11-01 03:27:06–03:28:18 UTC. Three HA9B browser scenarios also passed
separately. Test servers were stopped and the two ports verified free.
.NET Release: zero warnings/errors; 180 tests; local pack. The initial generated
asset-copy access denial was resolved by rerunning the same build with authorized
execution outside the sandbox, without source or permission changes.
npm/NuGet consumers passed. All 425 packed dist files and relevant NuGet assets
match the verified build. No dependency/lockfile changes; existing 30 development
audit issues remain. No C# source/schema changed, so no C# review or separate
Blazor browser rerun is claimed.

Native ECC planner/TDD and final general/TypeScript/security reviews ran with no
remaining findings. Details: ha9b-validation.md.
Reusable demo: demo/editor/history-refusals.html.
Logs: C:/Users/clefw/AppData/Local/Temp/JsTimeline-HA9B-validation-20261031/.
Shared spatial projection is still a separate follow-up, not delivered here.
