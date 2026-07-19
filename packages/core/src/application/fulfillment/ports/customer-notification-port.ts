import type { Result } from '../../../shared/types/result.js';
import type {
  CustomerNotificationRequest,
  CustomerNotificationResult,
} from '../../../domain/notification/customer-notification.js';
import type { CustomerNotificationError } from '../../../domain/notification/errors/notification-errors.js';

export type CustomerNotificationPort = {
  notify(
    request: CustomerNotificationRequest,
  ): Promise<Result<CustomerNotificationResult, CustomerNotificationError>>;
};
