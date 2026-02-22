import { Router } from 'express';
import {
  getBlocks,
  createBlock,
  updateBlock,
  deleteBlock,
} from '../controllers/blockController';
import { authMiddleware, adminOnly } from '../middleware/authMiddleware';

const router = Router();

router.use(authMiddleware);

router.get('/', adminOnly, getBlocks);
router.post('/', adminOnly, createBlock);
router.put('/:id', adminOnly, updateBlock);
router.delete('/:id', adminOnly, deleteBlock);

export default router;
