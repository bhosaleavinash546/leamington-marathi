import { Router } from 'express';
import {
  login,
  signupRequest,
  signupVerify,
  forgotPasswordRequest,
  forgotPasswordVerify,
  forgotPasswordReset,
} from '../controllers/authController';

const router = Router();

router.post('/login',                      login);
router.post('/signup/request',             signupRequest);
router.post('/signup/verify',              signupVerify);
router.post('/forgot-password/request',    forgotPasswordRequest);
router.post('/forgot-password/verify',     forgotPasswordVerify);
router.post('/forgot-password/reset',      forgotPasswordReset);

export default router;
