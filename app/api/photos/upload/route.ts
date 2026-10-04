import { withAuthContext } from '../../utils/auth';
import { unavailableFeature, FILE_STORAGE_UNAVAILABLE } from '@/src/lib/worker-capabilities';

export const POST = withAuthContext(async () => unavailableFeature(FILE_STORAGE_UNAVAILABLE));
