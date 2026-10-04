import { executeWriteBatch, updateRows, settingsGuard, D1ConflictError } from '@/prisma/d1-batch';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '../db';
import {
  ApiResponse,
  SleepLocationRenameResult,
  SleepLocationSettings,
  SleepLocationSummary,
} from '../types';
import { withAuthContext, AuthResult } from '../utils/auth';
import { checkWritePermission } from '../utils/writeProtection';
import {
  applyLocationOrder,
  buildSleepLocationSummaries,
  updateSettingsAfterDelete,
  updateSettingsAfterRename,
  validateLocationAdd,
  validateLocationDelete,
  validateLocationRename,
  SleepLocationSettingsShape,
} from '@/src/utils/sleepLocationUtils';

type SettingsRecord = { id: string; sleepLocationSettings?: string | null } | null;

function parseLocationSettings(settings: SettingsRecord): SleepLocationSettingsShape {
  const empty: SleepLocationSettingsShape = { hiddenLocations: [], customLocations: [], locationOrder: [] };
  if (!settings?.sleepLocationSettings) return empty;
  try {
    const parsed = JSON.parse(settings.sleepLocationSettings) as SleepLocationSettings;
    return {
      hiddenLocations: Array.isArray(parsed.hiddenLocations) ? parsed.hiddenLocations : [],
      customLocations: Array.isArray(parsed.customLocations) ? parsed.customLocations : [],
      locationOrder: Array.isArray(parsed.locationOrder) ? parsed.locationOrder : [],
    };
  } catch {
    return empty;
  }
}

const findSettings = (client: typeof prisma | any, familyId: string) =>
  client.settings.findFirst({
    where: { familyId },
    orderBy: { updatedAt: 'desc' },
  });

/** Missing owner settings must be repaired through secure family setup. */
function locationPlans(settings: any, shape: SleepLocationSettingsShape) {
  if (!settings) throw new Error('Family settings are missing');
  return [settingsGuard(settings), updateRows('Settings',
    { sleepLocationSettings: JSON.stringify(shape) }, '"id" = ?', [settings.id])];
}

async function getSummaries(familyId: string): Promise<SleepLocationSummary[]> {
  const grouped = await prisma.sleepLog.groupBy({
    by: ['location'],
    where: {
      familyId,
      deletedAt: null,
      location: { not: null },
    },
    _count: { _all: true },
  });
  const settings = await findSettings(prisma, familyId);
  const { hiddenLocations, customLocations, locationOrder } = parseLocationSettings(settings);
  const summaries = buildSleepLocationSummaries(
    grouped.map((g: any) => ({ location: g.location, count: g._count._all })),
    hiddenLocations,
    customLocations,
  );
  return applyLocationOrder(summaries, locationOrder ?? []);
}

async function handleGet(req: NextRequest, authContext: AuthResult): Promise<NextResponse<ApiResponse<SleepLocationSummary[]>>> {
  try {
    const { familyId: userFamilyId } = authContext;
    if (!userFamilyId) {
      return NextResponse.json<ApiResponse<SleepLocationSummary[]>>({ success: false, error: 'User is not associated with a family.' }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: await getSummaries(userFamilyId) });
  } catch (error) {
    if (error instanceof D1ConflictError) return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    console.error('Error retrieving sleep locations:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load sleep locations' },
      { status: 500 }
    );
  }
}

async function handlePost(req: NextRequest, authContext: AuthResult): Promise<NextResponse<ApiResponse<{ name: string }>>> {
  const writeCheck = checkWritePermission(authContext);
  if (!writeCheck.allowed) {
    return writeCheck.response!;
  }

  try {
    const { familyId: userFamilyId } = authContext;
    if (!userFamilyId) {
      return NextResponse.json<ApiResponse<{ name: string }>>({ success: false, error: 'User is not associated with a family.' }, { status: 403 });
    }

    const body = await req.json();
    const existingNames = (await getSummaries(userFamilyId)).map((l) => l.name);
    const validation = validateLocationAdd(body.name, existingNames);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }
    const { name } = validation;

    const settings = await findSettings(prisma, userFamilyId);
    const shape = parseLocationSettings(settings);
    shape.customLocations = [...shape.customLocations, name];
    await executeWriteBatch(locationPlans(settings, shape));

    return NextResponse.json({ success: true, data: { name } });
  } catch (error) {
    if (error instanceof D1ConflictError) return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    console.error('Error adding sleep location:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update sleep locations' },
      { status: 500 }
    );
  }
}

async function handlePut(req: NextRequest, authContext: AuthResult): Promise<NextResponse<ApiResponse<SleepLocationRenameResult>>> {
  const writeCheck = checkWritePermission(authContext);
  if (!writeCheck.allowed) {
    return writeCheck.response!;
  }

  try {
    const { familyId: userFamilyId } = authContext;
    if (!userFamilyId) {
      return NextResponse.json<ApiResponse<SleepLocationRenameResult>>({ success: false, error: 'User is not associated with a family.' }, { status: 403 });
    }

    const body = await req.json();
    const validation = validateLocationRename(body.from, body.to);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }
    const { from, to } = validation;

    const settings = await findSettings(prisma, userFamilyId);
    const shape = parseLocationSettings(settings);
    const plans = locationPlans(settings, updateSettingsAfterRename(shape, from, to));
    plans.push(updateRows('SleepLog', { location: to }, '"familyId" = ? AND "location" = ?', [userFamilyId, from]));
    const results = await executeWriteBatch(plans);
    const updatedCount = results[results.length - 1].meta.changes;

    return NextResponse.json({ success: true, data: { updatedCount } });
  } catch (error) {
    if (error instanceof D1ConflictError) return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    console.error('Error renaming sleep location:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update sleep locations' },
      { status: 500 }
    );
  }
}

async function handleDelete(req: NextRequest, authContext: AuthResult): Promise<NextResponse<ApiResponse<{ removed: boolean }>>> {
  const writeCheck = checkWritePermission(authContext);
  if (!writeCheck.allowed) {
    return writeCheck.response!;
  }

  try {
    const { familyId: userFamilyId } = authContext;
    if (!userFamilyId) {
      return NextResponse.json<ApiResponse<{ removed: boolean }>>({ success: false, error: 'User is not associated with a family.' }, { status: 403 });
    }

    const body = await req.json();
    const validation = validateLocationDelete(body.name);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }
    const { name } = validation;

    const inUseError = 'This location is still in use. Merge it into another location instead.';
    const inUse = await prisma.sleepLog.count({ where: { familyId: userFamilyId, location: name, deletedAt: null } });
    if (inUse > 0) throw new Error(inUseError);
    const settings = await findSettings(prisma, userFamilyId);
    const shape = parseLocationSettings(settings);
    const plans = locationPlans(settings, updateSettingsAfterDelete(shape, name));
    // The batch validates absence again so a new matching sleep log cannot race deletion.
    plans.unshift({ sql: `SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM "SleepLog" WHERE "familyId" = ? AND "location" = ? AND "deletedAt" IS NULL) THEN 1 ELSE json('location-in-use') END`, values: [userFamilyId, name] });
    await executeWriteBatch(plans);

    return NextResponse.json({ success: true, data: { removed: true } });
  } catch (error) {
    if (error instanceof D1ConflictError) return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    if (error instanceof Error && error.message.includes('still in use')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    console.error('Error deleting sleep location:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update sleep locations' },
      { status: 500 }
    );
  }
}

export const GET = withAuthContext(handleGet);
export const POST = withAuthContext(handlePost);
export const PUT = withAuthContext(handlePut);
export const DELETE = withAuthContext(handleDelete);
