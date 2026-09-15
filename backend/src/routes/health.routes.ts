import { Router } from 'express';
import { HealthController } from '../controllers/health.controller.js';

const router = Router();

router.get('/', HealthController.getRoot);
router.get('/health', HealthController.getHealth);
router.get('/health/live', HealthController.getLiveness);
router.get('/health/ready', HealthController.getReadiness);
router.get('/live', HealthController.getLiveness);
router.get('/ready', HealthController.getReadiness);

export default router;
