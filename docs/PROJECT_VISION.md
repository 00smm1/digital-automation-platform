# Project Vision

**Project:** Digital Automation Platform  
**Owner:** Osama AL-Sharif  
**Status:** Sprint 0 — Platform foundation

## Mission

Build a commerce-agnostic automation platform that orchestrates order fulfillment, inventory, and customer communication across multiple storefronts and service providers — without tying core business logic to any single CMS or marketplace.

## Problem

Digital merchants often run WooCommerce, regional platforms (Salla, Zid), or global storefronts (Shopify) alongside payment gateways, fulfillment APIs, and notification channels. Today, integrations are duplicated, brittle, and locked inside each channel's plugin or theme layer.

## Solution

A central platform that:

- Executes automations (triggers → conditions → actions) independent of where the order originated
- Delivers digital goods via **API provisioning** or **inventory-based allocation**
- Syncs stock and reservations across channels through a unified inventory engine
- Sends notifications through a dedicated notification engine
- Connects to storefronts through thin **connectors**, not embedded platform logic

## Anchor use case: Lord TV

The first production deployment validates the platform end-to-end:

| Component | Role |
|-----------|------|
| WooCommerce | Storefront and checkout (via WordPress connector) |
| AdfPay | Payment capture |
| IPTV provider API | API-based delivery of subscription credentials |
| Email | Customer notification and credential delivery |

Lord TV proves the automation pipeline: order paid → provision via IPTV API → notify customer by email — with the platform core owning orchestration, not WordPress.

## Success criteria

- Platform core runs and is testable without WordPress installed
- WordPress connector forwards events and settings only; no fulfillment logic in PHP
- Lord TV live flow completes with audit trail and retry on failure
- Connector interface documented for Salla, Zid, and Shopify

## Non-goals (Sprint 0)

- Multi-tenant SaaS billing or self-service onboarding
- Visual automation builder in the admin dashboard
- Connectors beyond WordPress/WooCommerce

## Guiding principles

1. **Platform first** — Core domain logic lives in shared packages and the API server.
2. **Connectors, not cores** — Storefront integrations are adapters, interchangeable over time.
3. **Explicit delivery models** — API delivery and inventory delivery are first-class concepts.
4. **Observable by default** — Every automation run is logged, traceable, and replayable.
