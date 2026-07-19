import type { Result } from '../../../shared/types/result.js';
import type {
  DigitalProductProvisioningRequest,
  DigitalProductProvisioningResult,
} from '../../../domain/provisioning/digital-product-provisioning.js';
import type { DigitalProductProvisioningError } from '../../../domain/provisioning/errors/provisioning-errors.js';

export type DigitalProductProvisioningPort = {
  provision(
    request: DigitalProductProvisioningRequest,
  ): Promise<Result<DigitalProductProvisioningResult, DigitalProductProvisioningError>>;
};
