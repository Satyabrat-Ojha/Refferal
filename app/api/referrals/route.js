import { currentUser } from '@clerk/nextjs/server';
import { createReferralHandler } from '../../../lib/referral-handler.js';
import { createReferralRepository } from '../../../lib/referral-repository.js';
import { getPrisma } from '../../../lib/prisma.js';

export const runtime = 'nodejs';

export const POST = createReferralHandler({
  getUser: currentUser,
  saveReferral: createReferralRepository(getPrisma),
});
