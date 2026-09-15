import { Request, Response, NextFunction } from 'express';
import { pricingService } from '../pricing/pricing.service.js';
import { pricingQuoteSchema } from '../validators/pricing.validator.js';
import { PricingQuoteRequest } from '../pricing/pricing.types.js';

export class PricingController {
  /**
   * POST /api/v1/pricing/quote
   * Computes authoritative price quote breakdown for requested vehicle and rental interval
   */
  public async getQuote(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedInput = pricingQuoteSchema.parse(req.body);
      const quote = await pricingService.generateQuote(validatedInput as PricingQuoteRequest);

      res.status(200).json({
        success: true,
        statusCode: 200,
        data: quote
      });
    } catch (err) {
      next(err);
    }
  }
}

export const pricingController = new PricingController();
export default pricingController;
