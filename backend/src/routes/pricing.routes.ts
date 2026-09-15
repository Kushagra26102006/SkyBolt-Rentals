import { Router } from 'express';
import { pricingController } from '../controllers/pricing.controller.js';

const pricingRoutes = Router();

/**
 * @route   POST /api/v1/pricing/quote
 * @desc    Generate an authoritative rental price quote breakdown
 * @access  Public
 */
pricingRoutes.post('/quote', pricingController.getQuote);

export default pricingRoutes;
