export type CustomerNotificationChannel = 'email';

export type CustomerNotificationRequest = {
  readonly customerReference: string;
  readonly recipient: string;
  readonly channel: CustomerNotificationChannel;
  readonly subject: string;
  readonly body: string;
  readonly orderReference: string;
  readonly metadata: Readonly<Record<string, unknown>>;
};

export type CustomerNotificationResult = {
  readonly notificationReference: string;
  readonly channel: CustomerNotificationChannel;
};

export const createCustomerNotificationRequest = (
  params: CustomerNotificationRequest,
): CustomerNotificationRequest => ({
  customerReference: params.customerReference,
  recipient: params.recipient,
  channel: params.channel,
  subject: params.subject,
  body: params.body,
  orderReference: params.orderReference,
  metadata: { ...params.metadata },
});

export const createCustomerNotificationResult = (
  params: CustomerNotificationResult,
): CustomerNotificationResult => params;
