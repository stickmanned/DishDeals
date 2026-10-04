# N-SIM-A handoff
Branch t-17-native-simulator-qa, base 4241d26. Full report: docs/qa/simulator/n-sim-a-report.md.
- Actual unsigned Dinedeals scheme build (app + ReelShare) on iPhone 17e iOS 27.0: BUILD SUCCEEDED, install + launch ok.
- App renders blank (placeholder WebsiteURL): web/auth/bridge/provider/publish E2E blocked, not passed.
- Real system share sheet -> ReelShare extension exercised with synthetic local Safari fixture: link, text, unsupported, two-link, plain, cancel behave as documented; save step reports App Group setup error because the build is unsigned.
- Writable paths only: docs/qa/simulator/, docs/handoffs/n-sim-a.md, tests/native/simulator/. No source/project/signing changes. Real phone acceptance pending.
