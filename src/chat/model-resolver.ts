import { PricingService } from './pricing.service';
import { UnsupportedModelError } from '../common/errors';

/**
 * The slice of PricingService this resolver needs. Narrowing it keeps the
 * function testable without constructing anything that touches the database.
 */
export type ModelCatalogue = Pick<
  PricingService,
  'isSupported' | 'supportedModels'
>;

/**
 * Decides which model answers a message.
 *
 * A per-message `model` wins over the session's default, and never replaces
 * it: one message asking for a pricier model must not silently re-price every
 * message after it. The session's default is read here, not written.
 */
export function resolveModel(
  requested: string | undefined,
  sessionDefault: string,
  catalogue: ModelCatalogue,
): string {
  const model = requested ?? sessionDefault;
  if (!catalogue.isSupported(model)) {
    throw new UnsupportedModelError(model, catalogue.supportedModels());
  }
  return model;
}
