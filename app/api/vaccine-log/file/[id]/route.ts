import { withAuthContext } from '../../../utils/auth';
import { unavailableFeature, FILE_STORAGE_UNAVAILABLE } from '@/src/lib/worker-capabilities';

export const GET = withAuthContext(async () => unavailableFeature(FILE_STORAGE_UNAVAILABLE));
export const DELETE = withAuthContext(async () => unavailableFeature(FILE_STORAGE_UNAVAILABLE));
