---
name: code-checker
description: "Diagnose and fix bugs in the Altio codebase. Reads the file, identifies root causes (not symptoms), proposes a minimal fix, applies it, and verifies no regressions."
argument-hint: "[file-path] [bug-description]"
---

# Code Checker

Systematic bug diagnosis and fix workflow for the Altio React Native / Expo project.

## Process

1. **Read** the full file in question
2. **Identify root cause** — not just the symptom
3. **Check constraints** — platform (iOS/Android), third-party lib limitations, component nesting
4. **Propose minimal fix** — no over-engineering
5. **Apply** the fix
6. **Verify** — no broken imports, no type errors, consistent with project patterns

## Common React Native pitfalls

- `Modal` inside `Modal` → second modal doesn't capture touches on iOS
- `DateTimePicker` inside `ScrollView` inside `Modal` → gesture conflicts
- `display="inline"/"spinner"` requires a standalone view, not nested in Modal
- `display="compact"` = native iOS button, works anywhere but may not render visibly without enough space
- Android: `display="default"` opens a system dialog, no nesting issues
- `TouchableOpacity` inside `ScrollView` with `nestedScrollEnabled` → may need `activeOpacity` fix

## Fix Template

```
ROOT CAUSE: [one sentence]
PLATFORM: [iOS / Android / both]
FIX: [minimal code change]
RISK: [low / medium — what could break]
```
