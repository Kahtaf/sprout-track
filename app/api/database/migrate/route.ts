import { withSysAdminAuth } from '../../utils/auth';
import { unavailableFeature, DATABASE_RESTORE_UNAVAILABLE } from '@/src/lib/worker-capabilities';

export const POST = withSysAdminAuth(async () => unavailableFeature(DATABASE_RESTORE_UNAVAILABLE));
