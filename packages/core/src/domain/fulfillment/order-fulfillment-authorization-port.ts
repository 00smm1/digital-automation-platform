import type { Result } from '../../shared/types/result.js';
import type { OrderFulfillmentAuthorizationError } from './errors/order-fulfillment-authorization-errors.js';

export type OrderFulfillmentAuthorizationPort = {
  tryAcquire(params: {
    readonly externalOrderReference: string;
  }): Promise<Result<void, OrderFulfillmentAuthorizationError>>;

  markFulfilled(params: {
    readonly externalOrderReference: string;
  }): Promise<Result<void, OrderFulfillmentAuthorizationError>>;

  release(params: {
    readonly externalOrderReference: string;
  }): Promise<Result<void, OrderFulfillmentAuthorizationError>>;

  isFulfilled(externalOrderReference: string): Promise<boolean>;
};
