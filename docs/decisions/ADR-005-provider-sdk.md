# ADR-005: Provider SDK

**Status:** Accepted  
**Date:** 2026-07-13  
**Owner:** Osama AL-Sharif

## Context

The Digital Automation Platform integrates with external systems such as payment gateways, subscription platforms, and fulfillment services. Without a shared abstraction, each automation or connector would embed provider-specific logic and transport code directly.

That approach creates duplicated integration code, makes testing difficult, and couples core domain logic to vendor SDKs and HTTP clients.

## Decision

### 1. Provider logic is abstracted in `@dap/core`

The provider layer defines contracts only:

- `Provider`
- `ProviderFactory`
- `ProviderRegistry`
- `ProviderRequest` / `ProviderResponse` / `ProviderResult`
- `ProviderError`
- `ProviderHealthStatus`
- `ProviderConfiguration`
- `ProviderCapability`

No HTTP clients, `fetch`, `axios`, or vendor SDKs belong in the core package. Transport and vendor code will live in future adapter packages or infrastructure layers that implement these contracts.

### 2. Capabilities are explicit and typed

Providers declare supported capabilities such as:

- `CreateAccount`
- `SuspendAccount`
- `DeleteAccount`
- `RenewSubscription`
- `ChangePackage`
- `ResetPassword`
- `ValidateCredentials`
- `HealthCheck`

Automations and services request work by capability, not by vendor API shape. This keeps orchestration provider-agnostic.

### 3. Multiple providers are registered through dependency injection

`ProviderRegistry` supports multiple provider instances and factories. Applications compose the registry at startup by injecting factories and configurations. No provider implementation ships in Sprint 6; only the abstraction and test doubles are included.

## Consequences

- Core automation and inventory logic can target stable provider contracts.
- Vendor-specific adapters can be added later without rewriting orchestration.
- Unit tests can use in-memory stub providers with no network access.
- Actual IPTV, payment, and storefront integrations remain future work outside this abstraction layer.

## Related components

- `packages/core/src/domain/provider/provider.ts`
- `packages/core/src/domain/provider/provider-registry.ts`
- `packages/core/src/domain/provider/provider-factory.ts`
