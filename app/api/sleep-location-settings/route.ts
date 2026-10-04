import { executeWriteBatch, updateRows, settingsGuard, D1ConflictError } from '@/prisma/d1-batch';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '../db';
import { ApiResponse, SleepLocationSettings } from '../types';
import { withAuthContext, AuthResult } from '../utils/auth';
import { mergeLocationSettings } from '@/src/utils/sleepLocationUtils';

async function handleGet(req: NextRequest, authContext: AuthResult): Promise<NextResponse<ApiResponse<SleepLocationSettings>>> {
  try {
    const { familyId: userFamilyId } = authContext;
    if (!userFamilyId) {
      return NextResponse.json<ApiResponse<SleepLocationSettings>>({ success: false, error: 'User is not associated with a family.' }, { status: 403 });
    }

    const settings = await prisma.settings.findFirst({
      where: { familyId: userFamilyId },
      orderBy: { updatedAt: 'desc' },
    });

    const defaultResult: SleepLocationSettings = { hiddenLocations: [] };

    if (!settings) {
      return NextResponse.json({ success: true, data: defaultResult });
    }

    const settingsWithField = settings as unknown as (typeof settings & { sleepLocationSettings?: string });

    if (!settingsWithField.sleepLocationSettings) {
      return NextResponse.json({ success: true, data: defaultResult });
    }

    try {
      const parsed = JSON.parse(settingsWithField.sleepLocationSettings) as SleepLocationSettings;
      return NextResponse.json({ success: true, data: parsed });
    } catch {
      return NextResponse.json({ success: true, data: defaultResult });
    }
  } catch (error) {
    if (error instanceof D1ConflictError) return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    console.error('Error retrieving sleep location settings:', error);
    return NextResponse.json({ success: true, data: { hiddenLocations: [] } });
  }
}

async function handlePost(req: NextRequest, authContext: AuthResult): Promise<NextResponse<ApiResponse<SleepLocationSettings>>> {
  try {
    const { familyId: userFamilyId } = authContext;
    if (!userFamilyId) {
      return NextResponse.json<ApiResponse<SleepLocationSettings>>({ success: false, error: 'User is not associated with a family.' }, { status: 403 });
    }

    const body = await req.json();
    // The body is a partial patch, not a full settings object — a visibility
    // toggle sends only hiddenLocations and a reorder sends only locationOrder.
    const { hiddenLocations, locationOrder } = body as Partial<SleepLocationSettings>;

    const isStringArray = (v: unknown): v is string[] =>
      Array.isArray(v) && v.every((n) => typeof n === 'string');

    if (hiddenLocations === undefined && locationOrder === undefined) {
      return NextResponse.json(
        { success: false, error: 'Provide hiddenLocations, locationOrder, or both' },
        { status: 400 }
      );
    }
    if (hiddenLocations !== undefined && !isStringArray(hiddenLocations)) {
      return NextResponse.json(
        { success: false, error: 'Invalid format: hiddenLocations must be an array of strings' },
        { status: 400 }
      );
    }
    if (locationOrder !== undefined && !isStringArray(locationOrder)) {
      return NextResponse.json(
        { success: false, error: 'Invalid format: locationOrder must be an array of strings' },
        { status: 400 }
      );
    }

    const settings = await prisma.settings.findFirst({ where: { familyId: userFamilyId }, orderBy: { updatedAt: 'desc' } });
    if (!settings) throw new Error('Family settings are missing');
    let existing: SleepLocationSettings = { hiddenLocations: [] };
    if (settings.sleepLocationSettings) {
      try { existing = JSON.parse(settings.sleepLocationSettings); } catch { /* defaults */ }
    }
    const merged = mergeLocationSettings(existing, { hiddenLocations, locationOrder });
    await executeWriteBatch([
      settingsGuard(settings),
      updateRows('Settings', { sleepLocationSettings: JSON.stringify(merged) }, '"id" = ?', [settings.id]),
    ]);

    return NextResponse.json({
      success: true,
      data: merged,
    });
  } catch (error) {
    if (error instanceof D1ConflictError) return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    console.error('Error saving sleep location settings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save sleep location settings' },
      { status: 500 }
    );
  }
}

export const GET = withAuthContext(handleGet);
export const POST = withAuthContext(handlePost);
