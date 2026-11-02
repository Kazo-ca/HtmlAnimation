<!-- README.md -->
# Timeline HA8 local delivery

Functional source: `f6de3c592c8c90c35285332f704ef68dfcce0b41`.
Repository: `Kazo-ca/JsAnimationTimeline`.
Branch: `v2/HA8-atomic-host-transactions`, based on HA7
`f88738c3b9ade14850b8f9ce91dfda6a336eec64`.
Contract: `HA8-TRANSACTIONS/1` in `doc/integration/timeline-ha8-api.md`.
Pull request: [#129](https://github.com/Kazo-ca/JsAnimationTimeline/pull/129),
targeting `v2/base`, open and unmerged. Depends on HA7 PR #128.

This delivery includes HA7 gradient sorting and HA8 atomic document, HTML
context and reversible host-effect history. It also exports
`createHtmlInspectionStage` for a host that owns DOM rendering. It does not
contain or certify a modified HtmlAnimation adapter.

These are local artifacts, not registry releases. Versions remain `1.0.0`;
identify this delivery by source commit and SHA-256. Do not mix these archives
with the older HA6/HA7 runtime or editor. Do not publish or tag them.

## Install in the Designer session

The Designer session owns installation and its own tests. Copy the three tgz
files into `vendor/timeline/f6de3c592c8c90c35285332f704ef68dfcce0b41/` in that
repository, then install them together from its root:

```powershell
npm install --save-exact --ignore-scripts ./vendor/timeline/f6de3c592c8c90c35285332f704ef68dfcce0b41/kazo-ca-timeline-runtime-1.0.0.tgz ./vendor/timeline/f6de3c592c8c90c35285332f704ef68dfcce0b41/kazo-ca-timeline-editor-1.0.0.tgz ./vendor/timeline/f6de3c592c8c90c35285332f704ef68dfcce0b41/kazo-ca-timeline-export-css-1.0.0.tgz
```

Replace the custom inspection-stage wrapper with the public factory. The host
effect must implement pure `prepare(direction)` and exact `rollback()`, including
partially applied DOM writes, the Full XPath journal and pending notification
buffers. A redo/undo pair alone does not establish this guarantee. Check
`transactions.fault`; a failed compensation requires host restoration and a new
editor instance. No rendering is implicitly performed by the inspection stage.

The NuGet package is available for local consumption only. Its C# API and schema
are unchanged; it ships the verified JavaScript assets.

## Evidence

- Clean dist, npm ci, lint with zero errors, all-workspace typecheck and builds.
- 3,984 tests in 269 suites; 210 Playwright tests with CI=1, two workers and zero
  retries (2026-11-01 01:40:13–01:41:22 UTC), ports 9421/9422.
- .NET Release build: zero warnings/errors; 180 tests passed; local pack passed.
- Local archive consumers: ESM/CommonJS, CSS, playback, HA8 transactions and
  inspection types under Bundler/NodeNext ESM+CJS; C# consumer and NuGet assets.
- All 422 packaged dist files match the final local builds byte for byte.
- ECC planner, TDD, general, TypeScript and security roles ran; final reviews
  have no outstanding findings. No C# source/schema changed; no C# review claimed.
- Browser demo and tests are retained in `demo/editor/atomic-transactions.html`
  and `e2e/validation/atomic-transactions.spec.ts`.

Full local evidence: `doc/v2/todo/ha8-validation.md` and
`%TEMP%/JsTimeline-HA8-validation-20261031/`.

## SHA-256

| Artifact | SHA-256 |
| --- | --- |
| kazo-ca-timeline-runtime-1.0.0.tgz | E8AED4B5126B6335DB78A9ACBBA27BD5B7924192CE11641C32FA9EBD63B6251F |
| kazo-ca-timeline-editor-1.0.0.tgz | 3EACD0734240493740FE5F5095E19CE58F8CD51C84824BFB1EBF6A0D8CA57908 |
| kazo-ca-timeline-export-css-1.0.0.tgz | B745CA1C740B926D29C6678DD682DE546D141A5E507ABC7DFA1012D66FCF93BE |
| JsTimeline.Blazor.1.0.0.nupkg | DB9731B3CE4D03D36BC6084F012F69EC62FA5278804E9685EB6D852E56884823 |
