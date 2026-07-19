import { Result } from '../../../shared/types/result.js';
import {
  createCustomerNotificationResult,
  type CustomerNotificationRequest,
  type CustomerNotificationResult,
} from '../../../domain/notification/customer-notification.js';
import { CustomerNotificationError } from '../../../domain/notification/errors/notification-errors.js';
import type { CustomerNotificationPort } from '../ports/customer-notification-port.js';

/**
 * In-memory customer notification adapter for tests and local composition.
 */
export class InMemoryCustomerNotificationAdapter implements CustomerNotificationPort {
  private readonly sentNotifications: CustomerNotificationRequest[] = [];
  private configuredError?: CustomerNotificationError;
  private notificationSequence = 0;

  configureError(error: CustomerNotificationError): void {
    this.configuredError = error;
  }

  reset(): void {
    this.configuredError = undefined;
    this.notificationSequence = 0;
    this.sentNotifications.length = 0;
  }

  getSentNotifications(): readonly CustomerNotificationRequest[] {
    return this.sentNotifications.map((notification) => ({
      ...notification,
      metadata: { ...notification.metadata },
    }));
  }

  async notify(
    request: CustomerNotificationRequest,
  ): Promise<
    import('../../../shared/types/result.js').Result<
      CustomerNotificationResult,
      CustomerNotificationError
    >
  > {
    this.sentNotifications.push({
      ...request,
      metadata: { ...request.metadata },
    });

    if (this.configuredError !== undefined) {
      return Result.fail(this.configuredError);
    }

    this.notificationSequence += 1;

    return Result.ok(
      createCustomerNotificationResult({
        notificationReference: `notification-${this.notificationSequence}`,
        channel: request.channel,
      }),
    );
  }
}
