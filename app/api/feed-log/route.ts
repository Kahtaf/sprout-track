import { createReplaySafeActivity, softDeleteActivity, requireActiveActivity, offlineMutationVersion, offlineWriteConflict, OfflineActivityError } from '@/prisma/offline-activity';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '../db';
import { ApiResponse, FeedLogCreate, FeedLogResponse } from '../types';
import { FeedType } from '@prisma/client';
import { withAuthContext, AuthResult } from '../utils/auth';
import { toUTC, formatForResponse } from '../utils/timezone';
import { checkWritePermission } from '../utils/writeProtection';
import { notifyActivityCreated, resetTimerNotificationState } from '@/src/lib/notifications/activityHook';

async function handlePost(req: NextRequest, authContext: AuthResult) {
  // Check write permissions for expired accounts
  const writeCheck = checkWritePermission(authContext);
  if (!writeCheck.allowed) {
    return writeCheck.response!;
  }

  try {
    const body: FeedLogCreate = await req.json();
    const { familyId, caretakerId } = authContext;

    // Validate that the baby belongs to the family
    const baby = await prisma.baby.findFirst({
      where: {
        id: body.babyId,
        familyId: familyId,
      },
    });

    if (!baby) {
      return NextResponse.json<ApiResponse<null>>(
        {
          success: false,
          error: 'Baby not found in this family.',
        },
        { status: 404 }
      );
    }

    // Convert all dates to UTC for storage
    const timeUTC = toUTC(body.time);
    
    const data = {
      babyId: body.babyId,
      time: timeUTC,
      type: body.type,
      caretakerId: authContext.caretakerId,
      ...(body.startTime && { startTime: toUTC(body.startTime) }),
      ...(body.endTime && { endTime: toUTC(body.endTime) }),
      ...(body.feedDuration !== undefined && { feedDuration: body.feedDuration }),
      ...(body.amount !== undefined && { amount: body.amount }),
      ...(body.breastMilkAmount !== undefined && { breastMilkAmount: body.breastMilkAmount }),
      ...(body.unitAbbr && { unitAbbr: body.unitAbbr }),
      ...(body.side && { side: body.side }),
      ...(body.food && { food: body.food }),
      ...(body.sessionId && { sessionId: body.sessionId }),
      // Handle notes and bottleType - convert empty strings to null
      notes: body.notes && body.notes.trim() ? body.notes : null,
      bottleType: body.bottleType && body.bottleType.trim() ? body.bottleType : null,
      hadReaction: body.hadReaction === true,
      reactionDescription: body.reactionDescription && body.reactionDescription.trim() ? body.reactionDescription : null,
      reactionCause: body.reactionCause && body.reactionCause.trim() ? body.reactionCause : null,
      familyId,
    };
    
    const { record: feedLog, created } = await createReplaySafeActivity(req, prisma.feedLog, familyId, body.babyId, (id, timestamp) => prisma.feedLog.create({
      data: { ...data, ...(id ? { id } : {}), ...(timestamp ? { createdAt: timestamp, updatedAt: timestamp } : {}) },
    }));

    // Format dates as ISO strings for response
    const response: FeedLogResponse = {
      ...feedLog,
      time: formatForResponse(feedLog.time) || '',
      createdAt: formatForResponse(feedLog.createdAt) || '',
      updatedAt: formatForResponse(feedLog.updatedAt) || '',
      deletedAt: formatForResponse(feedLog.deletedAt),
    };

    // Notify subscribers about activity creation (non-blocking)
    if (created) notifyActivityCreated(feedLog.babyId, 'feed', { accountId: authContext.accountId, caretakerId: authContext.caretakerId }, { type: body.type, amount: body.amount, unitAbbr: body.unitAbbr, food: body.food, side: body.side }).catch(console.error);
    if (created) resetTimerNotificationState(feedLog.babyId, 'feed').catch(console.error);

    return NextResponse.json<ApiResponse<FeedLogResponse>>({
      success: true,
      data: response,
    }, { headers: { 'X-Offline-Replay': created ? 'false' : 'true' } });
  } catch (error) {
    if (offlineWriteConflict(error, req)) return NextResponse.json({ success: false, error: 'This activity changed while offline. Review the queued change.' }, { status: 409 });
    if (error instanceof OfflineActivityError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    console.error('Error creating feed log:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create feed log';
    return NextResponse.json<ApiResponse<FeedLogResponse>>(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

async function handlePut(req: NextRequest, authContext: AuthResult) {
  // Check write permissions for expired accounts
  const writeCheck = checkWritePermission(authContext);
  if (!writeCheck.allowed) {
    return writeCheck.response!;
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const body: Partial<FeedLogCreate> = await req.json();
    const { familyId } = authContext;

    if (!id) {
      return NextResponse.json<ApiResponse<FeedLogResponse>>(
        {
          success: false,
          error: 'Feed log ID is required',
        },
        { status: 400 }
      );
    }

    // Get family ID from request headers (with fallback to body)
    const existingFeedLog = await prisma.feedLog.findUnique({
      where: { id },
    });

    if (!existingFeedLog) {
      return NextResponse.json<ApiResponse<FeedLogResponse>>(
        {
          success: false,
          error: 'Feed log not found',
        },
        { status: 404 }
      );
    }

    // Check family access
    if (existingFeedLog.familyId !== familyId) {
      return NextResponse.json<ApiResponse<FeedLogResponse>>(
        {
          success: false,
          error: 'Forbidden',
        },
        { status: 403 }
      );
    }

    requireActiveActivity(existingFeedLog);
    const offlineVersion = offlineMutationVersion(req, existingFeedLog);
    if (body.babyId !== undefined && body.babyId !== existingFeedLog.babyId) {
      const baby = await prisma.baby.findFirst({ where: { id: body.babyId, familyId, deletedAt: null } });
      if (!baby) return NextResponse.json({ success: false, error: 'Baby not found in this family.' }, { status: 404 });
    }

    // Process all date fields - convert to UTC
    const data = {
      ...(body.time ? { time: toUTC(body.time) } : {}),
      ...(body.startTime ? { startTime: toUTC(body.startTime) } : {}),
      ...(body.endTime ? { endTime: toUTC(body.endTime) } : {}),
      ...(body.feedDuration !== undefined ? { feedDuration: body.feedDuration } : {}),
      // Handle notes and bottleType - convert empty strings to null
      notes: body.notes && body.notes.trim() ? body.notes : null,
      ...(body.bottleType && body.bottleType.trim() ? { bottleType: body.bottleType } : { bottleType: null }),
      ...(body.breastMilkAmount !== undefined ? { breastMilkAmount: body.breastMilkAmount } : {}),
      ...(body.hadReaction !== undefined ? { hadReaction: body.hadReaction === true } : {}),
      ...(body.reactionDescription !== undefined
        ? { reactionDescription: body.reactionDescription && body.reactionDescription.trim() ? body.reactionDescription : null }
        : {}),
      ...(body.reactionCause !== undefined
        ? { reactionCause: body.reactionCause && body.reactionCause.trim() ? body.reactionCause : null }
        : {}),
      ...Object.entries(body)
        .filter(([key]) => ['babyId', 'type', 'amount', 'unitAbbr', 'side', 'food', 'sessionId'].includes(key))
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {}),
    };

    const feedLog = await prisma.feedLog.update({
      where: { id, familyId: familyId, deletedAt: null, ...(offlineVersion ? { updatedAt: offlineVersion } : {}) },
      data,
    });

    // Format dates as ISO strings for response
    const response: FeedLogResponse = {
      ...feedLog,
      time: formatForResponse(feedLog.time) || '',
      createdAt: formatForResponse(feedLog.createdAt) || '',
      updatedAt: formatForResponse(feedLog.updatedAt) || '',
      deletedAt: formatForResponse(feedLog.deletedAt),
    };

    return NextResponse.json<ApiResponse<FeedLogResponse>>({
      success: true,
      data: response,
    });
  } catch (error) {
    if (offlineWriteConflict(error, req)) return NextResponse.json({ success: false, error: 'This activity changed while offline. Review the queued change.' }, { status: 409 });
    if (error instanceof OfflineActivityError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    console.error('Error updating feed log:', error);
    return NextResponse.json<ApiResponse<FeedLogResponse>>(
      {
        success: false,
        error: 'Failed to update feed log',
      },
      { status: 500 }
    );
  }
}

async function handleGet(req: NextRequest, authContext: AuthResult) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const babyId = searchParams.get('babyId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const typeParam = searchParams.get('type');
    const { familyId } = authContext;

    const queryParams: any = {
      deletedAt: null,
      familyId,
      ...(babyId && { babyId }),
      ...(typeParam && { type: typeParam as FeedType }),
      ...(startDate && endDate && {
        time: {
          gte: toUTC(startDate),
          lte: toUTC(endDate),
        },
      }),
    };

    if (id) {
      const feedLog = await prisma.feedLog.findFirst({
        where: {
          deletedAt: null,
          id,
          familyId,
        },
      });

      if (!feedLog) {
        return NextResponse.json<ApiResponse<FeedLogResponse>>(
          {
            success: false,
            error: 'Feed log not found',
          },
          { status: 404 }
        );
      }

      // Format dates as ISO strings for response
      const response: FeedLogResponse = {
        ...feedLog,
        time: formatForResponse(feedLog.time) || '',
        createdAt: formatForResponse(feedLog.createdAt) || '',
        updatedAt: formatForResponse(feedLog.updatedAt) || '',
        deletedAt: formatForResponse(feedLog.deletedAt),
      };

      return NextResponse.json<ApiResponse<FeedLogResponse>>({
        success: true,
        data: response,
      });
    }

    const feedLogs = await prisma.feedLog.findMany({
      where: queryParams,
      orderBy: {
        time: 'desc',
      },
    });

    // Format dates as ISO strings for response
    const response: FeedLogResponse[] = feedLogs.map(feedLog => ({
      ...feedLog,
      time: formatForResponse(feedLog.time) || '',
      createdAt: formatForResponse(feedLog.createdAt) || '',
      updatedAt: formatForResponse(feedLog.updatedAt) || '',
      deletedAt: formatForResponse(feedLog.deletedAt),
    }));

    return NextResponse.json<ApiResponse<FeedLogResponse[]>>({
      success: true,
      data: response,
    });
  } catch (error) {
    if (offlineWriteConflict(error, req)) return NextResponse.json({ success: false, error: 'This activity changed while offline. Review the queued change.' }, { status: 409 });
    if (error instanceof OfflineActivityError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    console.error('Error fetching feed logs:', error);
    return NextResponse.json<ApiResponse<FeedLogResponse[]>>(
      {
        success: false,
        error: 'Failed to fetch feed logs',
      },
      { status: 500 }
    );
  }
}

async function handleDelete(req: NextRequest, authContext: AuthResult) {
  // Check write permissions for expired accounts
  const writeCheck = checkWritePermission(authContext);
  if (!writeCheck.allowed) {
    return writeCheck.response!;
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const { familyId } = authContext;

    if (!id) {
      return NextResponse.json<ApiResponse<void>>(
        {
          success: false,
          error: 'Feed log ID is required',
        },
        { status: 400 }
      );
    }

    // Get family ID from request headers
    await softDeleteActivity(req, prisma.feedLog, familyId, id);

    return NextResponse.json<ApiResponse<void>>({
      success: true,
    });
  } catch (error) {
    if (offlineWriteConflict(error, req)) return NextResponse.json({ success: false, error: 'This activity changed while offline. Review the queued change.' }, { status: 409 });
    if (error instanceof OfflineActivityError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    console.error('Error deleting feed log:', error);
    return NextResponse.json<ApiResponse<void>>(
      {
        success: false,
        error: 'Failed to delete feed log',
      },
      { status: 500 }
    );
  }
}

// Apply authentication middleware to all handlers
// Use type assertions to handle the multiple return types
export const GET = withAuthContext(handleGet as (req: NextRequest, authContext: AuthResult) => Promise<NextResponse<ApiResponse<any>>>);
export const POST = withAuthContext(handlePost as (req: NextRequest, authContext: AuthResult) => Promise<NextResponse<ApiResponse<any>>>);
export const PUT = withAuthContext(handlePut as (req: NextRequest, authContext: AuthResult) => Promise<NextResponse<ApiResponse<any>>>);
export const DELETE = withAuthContext(handleDelete as (req: NextRequest, authContext: AuthResult) => Promise<NextResponse<ApiResponse<any>>>);
