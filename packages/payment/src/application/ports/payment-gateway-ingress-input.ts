export type PaymentGatewayIngressInput = {
  readonly sourceId: string;
  readonly externalEventId: string;
  readonly eventType: string;
  readonly rawBody: string;
  readonly signature: string;
  readonly secret: string;
  readonly receivedAt: Date;
};
