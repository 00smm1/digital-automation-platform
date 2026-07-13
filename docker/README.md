# Docker

Container images and compose stacks for local development and deployment.

## Purpose

Provide reproducible environments for the full platform stack and individual services.

## Planned structure

```
docker/
├── compose/         # docker-compose files for local and staging stacks
├── images/          # Dockerfiles per app and service
└── config/          # Shared env templates and service configuration
```

## Planned services

| Service         | Source                 | Notes                    |
| --------------- | ---------------------- | ------------------------ |
| api-server      | `apps/api-server`      | Primary backend          |
| admin-dashboard | `apps/admin-dashboard` | Static or SSR frontend   |
| postgres        | —                      | Primary datastore        |
| redis           | —                      | Cache and job queues     |
| worker          | TBD                    | Background job processor |

## Usage

> Compose files and Dockerfiles are not yet defined. This directory establishes the layout for future container configuration.

## Status

Structure only — no Dockerfiles or compose files yet.
