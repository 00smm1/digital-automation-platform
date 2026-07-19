# Documentation

Architecture, decisions, and operational guides for the Digital Automation Platform.

## Documents

| Document                                             | Description                                        |
| ---------------------------------------------------- | -------------------------------------------------- |
| [PROJECT_VISION.md](PROJECT_VISION.md)               | Mission, Lord TV anchor use case, success criteria |
| [ARCHITECTURE.md](ARCHITECTURE.md)                   | Target system design, layers, delivery models      |
| [ARCHITECTURE_BASELINE.md](ARCHITECTURE_BASELINE.md) | Architecture as implemented after Sprint 8         |
| [PACKAGE_BOUNDARIES.md](PACKAGE_BOUNDARIES.md)       | Package ownership and dependency rules             |
| [ROADMAP.md](ROADMAP.md)                             | Phased delivery plan through production v1         |
| [DECISIONS.md](DECISIONS.md)                         | Architecture decision index                        |
| [decisions/](decisions/)                             | Detailed sprint ADRs (ADR-004 onward)              |

## Planned contents

| Document      | Description                                            |
| ------------- | ------------------------------------------------------ |
| API reference | Generated from `api-server` when implemented           |
| Runbooks      | Incident response, deployment, and rollback procedures |
| Onboarding    | Developer setup and contribution guidelines            |

## Conventions

- Use Markdown for all docs unless a diagram tool (e.g. Mermaid) is needed
- ADRs follow the format: Context → Decision → Consequences
- Keep docs close to the code they describe; link from package and app READMEs

## Status

Foundation and baseline documents are in place through Sprint 9. API reference, runbooks, and onboarding guides will follow as components are implemented.
