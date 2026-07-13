export type AutomationOrderContext = {
  readonly id: string;
  readonly reference?: string;
};

export type AutomationCustomerContext = {
  readonly id: string;
  readonly email?: string;
};

export type AutomationPaymentContext = {
  readonly id: string;
  readonly status: string;
  readonly amount?: number;
  readonly currency?: string;
};

export type AutomationProviderContext = {
  readonly id: string;
  readonly type: string;
};

export type AutomationContextMetadata = Readonly<Record<string, unknown>>;

/**
 * Execution context passed through every automation step.
 */
export type AutomationContext = {
  readonly automationId: string;
  readonly runId: string;
  readonly order: AutomationOrderContext;
  readonly customer: AutomationCustomerContext;
  readonly payment: AutomationPaymentContext;
  readonly provider: AutomationProviderContext;
  readonly metadata: AutomationContextMetadata;
};
