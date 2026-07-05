# Admin Dashboard

Web application for merchants and platform operators.

## Purpose

Provide a unified interface to configure automations, monitor runs, manage inventory rules, and inspect notification delivery — without requiring WordPress or direct API access.

## Planned responsibilities

- Automation builder and rule management UI
- Inventory sync status, overrides, and reconciliation views
- Notification templates, channels, and delivery logs
- Provider connection management
- Role-based access for merchants vs. platform admins

## Dependencies

- Communicates with `api-server` only (no direct package imports in production builds)
- May share types from `packages/core` at build time

## Status

Structure only — no UI code yet.
