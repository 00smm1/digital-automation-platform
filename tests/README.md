# Tests

Cross-package integration and end-to-end test suites.

## Purpose

Validate behavior that spans multiple packages and apps — beyond unit tests that live alongside individual components.

## Planned structure

```
tests/
├── integration/     # Multi-package flows (e.g. order → automation → notification)
├── e2e/             # Full stack tests against running services
├── fixtures/        # Shared test data and mock responses
└── helpers/         # Test utilities and setup/teardown
```

## Scope

| Layer       | Location                       | Examples                                  |
| ----------- | ------------------------------ | ----------------------------------------- |
| Unit        | Co-located in each package/app | Engine step execution, template rendering |
| Integration | `tests/integration/`           | API → automation → notification pipeline  |
| E2E         | `tests/e2e/`                   | Plugin event → API → dashboard visibility |

## Status

Test harness not yet implemented.
