import { createReplaySafeActivity, softDeleteActivity, requireActiveActivity, offlineMutationVersion, offlineWriteConflict, OfflineActivityError } from '@/prisma/offline-activity';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '../db';
import { ApiResponse, DiaperLogCreate, DiaperLogResponse } from '../types';
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
    const { familyId: userFamilyId, caretakerId } = authContext;
    if (!userFamilyId) {
      return NextResponse.json<ApiResponse<null>>({ success: false, error: 'User is not associated with a family.' }, { status: 403 });
    }

    const body: DiaperLogCreate = await req.json();

    const baby = await prisma.baby.findFirst({
      where: { id: body.babyId, familyId: userFamilyId },
    });

    if (!baby) {
      return NextResponse.json<ApiResponse<null>>({ success: false, error: 'Baby not found in this family.' }, { status: 404 });
    }
    
    const timeUTC = toUTC(body.time);
    
    const { record: diaperLog, created } = await createReplaySafeActivity(req, prisma.diaperLog, userFamilyId, body.babyId, (id, timestamp) => prisma.diaperLog.create({
      data: {
        ...(id ? { id } : {}),
        ...(timestamp ? { createdAt: timestamp, updatedAt: timestamp } : {}),
        babyId: body.babyId, type: body.type, condition: body.condition, color: body.color, blowout: body.blowout, creamApplied: body.creamApplied, notes: body.notes,
        time: timeUTC,
        caretakerId: caretakerId,
        familyId: userFamilyId,
      },
    }));

    // Format dates as ISO strings for response
    const response: DiaperLogResponse = {
      ...diaperLog,
      time: formatForResponse(diaperLog.time) || '',
      createdAt: formatForResponse(diaperLog.createdAt) || '',
      updatedAt: formatForResponse(diaperLog.updatedAt) || '',
      deletedAt: formatForResponse(diaperLog.deletedAt),
    };

    // Notify subscribers about activity creation (non-blocking)
    if (created) notifyActivityCreated(diaperLog.babyId, 'diaper', { accountId: authContext.accountId, caretakerId: authContext.caretakerId }, { type: body.type }).catch(console.error);
    if (created) resetTimerNotificationState(diaperLog.babyId, 'diaper').catch(console.error);

    return NextResponse.json<ApiResponse<DiaperLogResponse>>({
      success: true,
      data: response,
    }, { headers: { 'X-Offline-Replay': created ? 'false' : 'true' } });
  } catch (error) {
    if (offlineWriteConflict(error, req)) return NextResponse.json({ success: false, error: 'This activity changed while offline. Review the queued change.' }, { status: 409 });
    if (error instanceof OfflineActivityError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    console.error('Error creating diaper log:', error);
    return NextResponse.json<ApiResponse<DiaperLogResponse>>(
      {
        success: false,
        error: 'Failed to create diaper log',
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
    const { familyId: userFamilyId } = authContext;
    if (!userFamilyId) {
      return NextResponse.json<ApiResponse<null>>({ success: false, error: 'User is not associated with a family.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const body: Partial<DiaperLogCreate> = await req.json();

    if (!id) {
      return NextResponse.json<ApiResponse<DiaperLogResponse>>(
        {
          success: false,
          error: 'Diaper log ID is required',
        },
        { status: 400 }
      );
    }

    const existingDiaperLog = await prisma.diaperLog.findFirst({
      where: { id, familyId: userFamilyId },
    });

    if (!existingDiaperLog) {
      return NextResponse.json<ApiResponse<DiaperLogResponse>>(
        {
          success: false,
          error: 'Diaper log not found or access denied',
        },
        { status: 404 }
      );
    }

    requireActiveActivity(existingDiaperLog);
    const offlineVersion = offlineMutationVersion(req, existingDiaperLog);

    const data = {
      ...(body.time !== undefined ? { time: toUTC(body.time) } : {}),
      ...(body.type !== undefined ? { type: body.type } : {}),
      ...(body.condition !== undefined ? { condition: body.condition } : {}),
      ...(body.color !== undefined ? { color: body.color } : {}),
      ...(body.blowout !== undefined ? { blowout: body.blowout } : {}),
      ...(body.creamApplied !== undefined ? { creamApplied: body.creamApplied } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    };

    const diaperLog = await prisma.diaperLog.update({
      where: { id, familyId: userFamilyId, deletedAt: null, ...(offlineVersion ? { updatedAt: offlineVersion } : {}) },
      data,
    });

    // Format dates as ISO strings for response
    const response: DiaperLogResponse = {
      ...diaperLog,
      time: formatForResponse(diaperLog.time) || '',
      createdAt: formatForResponse(diaperLog.createdAt) || '',
      updatedAt: formatForResponse(diaperLog.updatedAt) || '',
      deletedAt: formatForResponse(diaperLog.deletedAt),
    };

    return NextResponse.json<ApiResponse<DiaperLogResponse>>({
      success: true,
      data: response,
    });
  } catch (error) {
    if (offlineWriteConflict(error, req)) return NextResponse.json({ success: false, error: 'This activity changed while offline. Review the queued change.' }, { status: 409 });
    if (error instanceof OfflineActivityError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    console.error('Error updating diaper log:', error);
    return NextResponse.json<ApiResponse<DiaperLogResponse>>(
      {
        success: false,
        error: 'Failed to update diaper log',
      },
      { status: 500 }
    );
  }
}

async function handleGet(req: NextRequest, authContext: AuthResult) {
  try {
    const { familyId: userFamilyId } = authContext;
    if (!userFamilyId) {
      return NextResponse.json<ApiResponse<null>>({ success: false, error: 'User is not associated with a family.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const babyId = searchParams.get('babyId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (id) {
      const diaperLog = await prisma.diaperLog.findFirst({
        where: { id, familyId: userFamilyId, deletedAt: null },
      });

      if (!diaperLog) {
        return NextResponse.json<ApiResponse<DiaperLogResponse>>(
          {
            success: false,
            error: 'Diaper log not found or access denied',
          },
          { status: 404 }
        );
      }

      // Format dates as ISO strings for response
      const response: DiaperLogResponse = {
        ...diaperLog,
        time: formatForResponse(diaperLog.time) || '',
        createdAt: formatForResponse(diaperLog.createdAt) || '',
        updatedAt: formatForResponse(diaperLog.updatedAt) || '',
        deletedAt: formatForResponse(diaperLog.deletedAt),
      };

      return NextResponse.json<ApiResponse<DiaperLogResponse>>({
        success: true,
        data: response,
      });
    }

    const diaperLogs = await prisma.diaperLog.findMany({
      where: {
        deletedAt: null,
        familyId: userFamilyId,
        ...(babyId && { babyId }),
        ...(startDate && endDate && {
          time: {
            gte: toUTC(startDate),
            lte: toUTC(endDate),
          },
        }),
      },
      orderBy: {
        time: 'desc',
      },
    });

    // Format dates as ISO strings for response
    const response: DiaperLogResponse[] = diaperLogs.map(diaperLog => ({
      ...diaperLog,
      time: formatForResponse(diaperLog.time) || '',
      createdAt: formatForResponse(diaperLog.createdAt) || '',
      updatedAt: formatForResponse(diaperLog.updatedAt) || '',
      deletedAt: formatForResponse(diaperLog.deletedAt),
    }));

    return NextResponse.json<ApiResponse<DiaperLogResponse[]>>({
      success: true,
      data: response,
    });
  } catch (error) {
    if (offlineWriteConflict(error, req)) return NextResponse.json({ success: false, error: 'This activity changed while offline. Review the queued change.' }, { status: 409 });
    if (error instanceof OfflineActivityError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    console.error('Error fetching diaper logs:', error);
    return NextResponse.json<ApiResponse<DiaperLogResponse[]>>(
      {
        success: false,
        error: 'Failed to fetch diaper logs',
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
    const { familyId: userFamilyId } = authContext;
    if (!userFamilyId) {
      return NextResponse.json<ApiResponse<null>>({ success: false, error: 'User is not associated with a family.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json<ApiResponse<void>>(
        {
          success: false,
          error: 'Diaper log ID is required',
        },
        { status: 400 }
      );
    }

    await softDeleteActivity(req, prisma.diaperLog, userFamilyId, id);

    return NextResponse.json<ApiResponse<void>>({
      success: true,
    });
  } catch (error) {
    if (offlineWriteConflict(error, req)) return NextResponse.json({ success: false, error: 'This activity changed while offline. Review the queued change.' }, { status: 409 });
    if (error instanceof OfflineActivityError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    console.error('Error deleting diaper log:', error);
    return NextResponse.json<ApiResponse<void>>(
      {
        success: false,
        error: 'Failed to delete diaper log',
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
