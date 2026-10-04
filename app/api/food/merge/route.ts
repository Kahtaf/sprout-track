import { executeWriteBatch, updateRows, snapshotGuard, D1ConflictError } from '@/prisma/d1-batch';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../db';
import { ApiResponse, FoodMergeResult } from '../../types';
import { withAuthContext, AuthResult } from '../../utils/auth';
import { checkWritePermission } from '../../utils/writeProtection';
import {
  buildFoodLogFoodFields,
  expandFoodItems,
  foodsJsonReferencesFoodId,
  rewriteFoodsJsonIds,
  validateFoodMerge,
} from '@/src/utils/foodLogUtils';

/** The FoodLog columns the merge planner needs (see the candidate select). */
export interface FoodMergeCandidate {
  id: string;
  foodId: string | null;
  foods: string | null;
  hadReaction: boolean;
  reactionDescription: string | null;
}

/** One planned rewrite: the log id plus the dual-write fields to persist. */
export interface FoodMergeUpdate {
  id: string;
  data: ReturnType<typeof buildFoodLogFoodFields>;
}

/** Planned rewrites sharing an identical payload, issued as one updateMany. */
export interface FoodMergeUpdateBatch {
  ids: string[];
  data: ReturnType<typeof buildFoodLogFoodFields>;
}

/**
 * Rows the merge has to touch: family-scoped logs referencing the source via
 * the legacy FK or inside their foods JSON. Rows that only belong to the
 * target are deliberately excluded — expandFoodItems() already synthesizes an
 * item from the legacy foodId when foods is NULL, so they need no backfill,
 * and including them made merge cost scale with the target's popularity.
 * Soft-deleted logs are included so history is remapped too.
 */
export function buildFoodMergeCandidateWhere(familyId: string, sourceFoodId: string) {
  return {
    familyId,
    OR: [{ foodId: sourceFoodId }, { foods: { contains: sourceFoodId } }],
  };
}

/**
 * Plan the merge in a single pass: every candidate referencing the source
 * yields exactly one update (so the reported count can't double-count), with
 * the FK remap, the foods JSON rewrite (deduping when source and target share
 * a meal) and the derived reaction fields all folded into one payload.
 */
export function planFoodMergeUpdates(
  candidates: FoodMergeCandidate[],
  sourceFoodId: string,
  targetFoodId: string
): FoodMergeUpdate[] {
  const updates: FoodMergeUpdate[] = [];
  for (const log of candidates) {
    if (log.foodId !== sourceFoodId && !foodsJsonReferencesFoodId(log.foods, sourceFoodId)) continue;

    const items = expandFoodItems({
      foodId: log.foodId === sourceFoodId ? targetFoodId : log.foodId,
      foods: rewriteFoodsJsonIds(log.foods, sourceFoodId, targetFoodId),
      time: new Date(0),
      hadReaction: log.hadReaction,
      reactionDescription: log.reactionDescription,
    });
    updates.push({
      id: log.id,
      data: buildFoodLogFoodFields(
        items.length > 0
          ? items
          : [
              {
                foodId: targetFoodId,
                hadReaction: log.hadReaction === true,
                reactionDescription: log.reactionDescription,
              },
            ]
      ),
    });
  }
  return updates;
}

/**
 * Collapse updates sharing an identical payload (the common case: many
 * single-food rows on the source) so the transaction issues a handful of
 * updateMany statements instead of one UPDATE per row.
 */
export function groupFoodMergeUpdates(updates: FoodMergeUpdate[]): FoodMergeUpdateBatch[] {
  const batches = new Map<string, FoodMergeUpdateBatch>();
  for (const update of updates) {
    const key = JSON.stringify(update.data);
    const batch = batches.get(key);
    if (batch) batch.ids.push(update.id);
    else batches.set(key, { ids: [update.id], data: update.data });
  }
  return Array.from(batches.values());
}

/**
 * Handle POST request to merge one catalog food into another (Settings >
 * Foods). Re-points FoodLog.foodId FK rows and rewrites foods JSON that
 * reference the source id, ORs commonAllergen onto the target, and
 * soft-deletes the source.
 */
async function handlePost(req: NextRequest, authContext: AuthResult) {
  const writeCheck = checkWritePermission(authContext);
  if (!writeCheck.allowed) {
    return writeCheck.response!;
  }

  try {
    const { familyId: userFamilyId } = authContext;
    if (!userFamilyId) {
      return NextResponse.json<ApiResponse<null>>({ success: false, error: 'User is not associated with a family.' }, { status: 403 });
    }

    const body = await req.json();
    const validation = validateFoodMerge(body.sourceFoodId, body.targetFoodId);
    if (!validation.valid) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }
    const { sourceFoodId, targetFoodId } = validation;

    const foods = await prisma.food.findMany({
      where: {
        id: { in: [sourceFoodId, targetFoodId] },
        familyId: userFamilyId,
        deletedAt: null,
      },
    });
    const source = foods.find(food => food.id === sourceFoodId);
    const target = foods.find(food => food.id === targetFoodId);
    if (!source || !target) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Food not found or access denied' },
        { status: 404 }
      );
    }

    const candidates = await prisma.foodLog.findMany({
      where: buildFoodMergeCandidateWhere(userFamilyId, source.id),
      select: { id: true, foodId: true, foods: true, hadReaction: true, reactionDescription: true },
    });
    const updates = planFoodMergeUpdates(candidates, source.id, target.id);
    const plans = candidates.map(row => snapshotGuard('FoodLog',
      '"id" = ? AND "familyId" = ? AND "foodId" IS ? AND "foods" IS ? AND "hadReaction" = ? AND "reactionDescription" IS ?',
      [row.id, userFamilyId, row.foodId, row.foods, row.hadReaction, row.reactionDescription]));
    plans.unshift(
      snapshotGuard('Food', '"id" = ? AND "familyId" = ? AND "deletedAt" IS NULL AND "commonAllergen" = ?', [source.id, userFamilyId, source.commonAllergen]),
      snapshotGuard('Food', '"id" = ? AND "familyId" = ? AND "deletedAt" IS NULL AND "commonAllergen" = ?', [target.id, userFamilyId, target.commonAllergen]),
      { sql: `SELECT CASE WHEN (SELECT COUNT(*) FROM "FoodLog" WHERE "familyId" = ? AND ("foodId" = ? OR instr("foods", ?) > 0)) = ? THEN 1 ELSE json('concurrent-food-log-change') END`, values: [userFamilyId, source.id, source.id, candidates.length] },
    );
    for (const batch of groupFoodMergeUpdates(updates)) {
      plans.push(updateRows('FoodLog', batch.data,
        `"id" IN (${batch.ids.map(() => '?').join(', ')}) AND "familyId" = ?`,
        [...batch.ids, userFamilyId]));
    }
    plans.push(updateRows('Food', { commonAllergen: source.commonAllergen || target.commonAllergen }, '"id" = ? AND "familyId" = ?', [target.id, userFamilyId]));
    plans.push(updateRows('Food', { deletedAt: new Date() }, '"id" = ? AND "familyId" = ?', [source.id, userFamilyId]));
    await executeWriteBatch(plans);
    const movedCount = updates.length;

    return NextResponse.json<ApiResponse<FoodMergeResult>>({
      success: true,
      data: { movedCount },
    });
  } catch (error) {
    if (error instanceof D1ConflictError) return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    console.error('Error merging foods:', error);
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: 'Failed to merge foods',
      },
      { status: 500 }
    );
  }
}

export const POST = withAuthContext(handlePost as any);
