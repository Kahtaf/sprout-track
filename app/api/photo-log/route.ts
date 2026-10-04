import { withAuthContext } from '../utils/auth';
import { unavailableFeature, FILE_STORAGE_UNAVAILABLE } from '@/src/lib/worker-capabilities';

// No metadata or linked-history mutations until durable attachment storage is configured.
export const GET = withAuthContext(async () => unavailableFeature(FILE_STORAGE_UNAVAILABLE));
export const POST = withAuthContext(async () => unavailableFeature(FILE_STORAGE_UNAVAILABLE));
export const PUT = withAuthContext(async () => unavailableFeature(FILE_STORAGE_UNAVAILABLE));
export const DELETE = withAuthContext(async () => unavailableFeature(FILE_STORAGE_UNAVAILABLE));
