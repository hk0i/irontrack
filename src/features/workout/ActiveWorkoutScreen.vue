<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue';
import {
  getRoutineById,
  getExerciseById,
  getExercisesForRoutine,
  getLastWorkoutBestSetForExercise,
  getSetsForSession,
  searchExercises,
  createExercise,
  logSet,
  updateSet,
  formatWeight,
  logWorkoutSession,
  todayString,
  RESISTANCE_TYPES,
  type Exercise,
  type ResistanceType,
  type SetEntry,
  type WeightUnit,
} from '../../shared/db';
import { COMMON_EXERCISES } from '../../shared/common-exercises';
import ScreenHeader from '../../shared/components/ScreenHeader.vue';
import SegmentedToggle from '../../shared/components/SegmentedToggle.vue';
import { settings } from '../../shared/store';
import { activeSession, setActiveSession, clearActiveSession } from '../../shared/active-session';
import { startRestTimer } from '../../shared/rest-timer';
import { requestRestTimerPermission } from '../../shared/rest-alert';
import type { NavParams, ScreenName, SetRowState } from '../../shared/types';
import SetRow from './SetRow.vue';

// Mirrors RoutineBuilderScreen's search pattern: mixes real Exercise rows
// with not-yet-created suggestions from COMMON_EXERCISES (id: null until
// selected).
type ExerciseOption = Exercise | { id: null; name: string };

const REST_SECONDS = 90;

// Deliberately not a strict 1-or-2-length tuple — the block-building loop in
// loadWorkout() constructs these dynamically and enforcing a tuple type
// there would add generic-narrowing ceremony for no real safety gain; the
// 1-or-2 invariant stays enforced by the template's v-if on .length, same
// as today.
interface WorkoutBlock {
  exercises: Exercise[];
}

// Weight is optional (bodyweight/banded exercises), so a 0 weight is a
// normal, common case — showing "0 lbs x 12" would read like a mistake, so
// the weight portion is omitted entirely when there's none logged.
function formatGhostText(weightInLbs: number, unit: WeightUnit, reps: number) {
  if (!weightInLbs) return `${reps} reps`;
  return `${formatWeight(weightInLbs, unit)} ${unit} x ${reps}`;
}

function makeEmptyRow(): SetRowState {
  return reactive({
    weightEntered: '',
    reps: '',
    unit: settings.preferredUnit,
    bandColors: [],
    checked: false,
    weightInvalid: false,
    repsInvalid: false,
    loggedSetId: null,
  });
}

const props = defineProps<{
  navParams?: NavParams;
}>();
const emit = defineEmits<{
  navigate: [screen: ScreenName, params?: NavParams];
}>();

// Read once — navParams doesn't change over this screen's lifetime.
// Threaded through to logSet so history can be grouped by routine.
const routineId = props.navParams?.routineId || null;

// Resolves which session this screen should use: reuse one already left
// in progress for this routine (so loadWorkout() can rehydrate its rows),
// discard-and-replace one left in progress for a different routine after
// confirming (single active session app-wide, mirrors DashboardScreen's
// delete confirmation), or start a brand-new one. Returns null only when
// the user declines to discard a different routine's in-progress session.
function resolveWorkoutSession(forRoutineId: string): { sessionId: string; startedAt: number } | null {
  const prior = activeSession.current;
  if (prior && prior.routineId === forRoutineId) {
    return { sessionId: prior.sessionId, startedAt: prior.startedAt };
  }
  if (prior) {
    const discard = confirm('You have an unfinished workout in progress. Discard it and start this one instead?');
    if (!discard) return null;
    clearActiveSession();
  }
  return { sessionId: crypto.randomUUID(), startedAt: Date.now() };
}

const session = routineId ? resolveWorkoutSession(routineId) : null;
if (routineId && !session) {
  emit('navigate', 'dashboard');
}

// Captured once, then reused for the lifetime of this screen instance —
// including across a resume, so Finish still records the full workout
// duration, not just time spent in this particular visit. See
// docs/edd-workout-duration.md.
const startedAt = session?.startedAt ?? null;

// Identifies this one workout instance. Tagged onto every set logged
// during this screen's lifetime and reused as the workouts row's id on
// Finish, so history can group this session's sets together instead of
// merging them with any other same-day session of the same routine.
const sessionId = session?.sessionId ?? null;

// Marks this session resumable the moment it starts, not just on Finish —
// otherwise navigating away before ever tapping Finish would still lose it.
// Requesting notification permission here (rather than lazily on the first
// rest timer) keeps the prompt out of the way before it's ever needed. No
// need to distinguish fresh-start from resume: the browser only prompts
// once regardless of how many times this is called — requestRestTimerPermission
// itself no-ops once permission is no longer 'default'.
if (session && routineId) {
  setActiveSession({ sessionId: session.sessionId, routineId, startedAt: session.startedAt });
  requestRestTimerPermission();
}

const blocks = ref<WorkoutBlock[]>([]);
const ghostTextByExercise: Record<string, string | null> = reactive({});
const setRowsByExercise: Record<string, SetRowState[]> = reactive({});

// Rebuilds a checked row from a previously logged set, so resuming a
// session shows exactly what was already done. Reuses the persisted
// values verbatim — there's no way to tell "typed 0" apart from "left
// blank" once collapsed into a SetEntry, so a genuine 0 just redisplays
// as 0, same as any other logged value.
function rowFromSet(set: SetEntry): SetRowState {
  return reactive({
    weightEntered: String(set.weightEntered),
    reps: String(set.reps),
    unit: set.unit,
    bandColors: set.bandColors ? [...set.bandColors] : [],
    checked: true,
    weightInvalid: false,
    repsInvalid: false,
    loggedSetId: set.id,
  });
}

// Seeds one exercise's row array (pre-checked rows rebuilt from any sets
// already logged this session, plus a trailing empty row) and ghost text.
// Shared by loadWorkout(), for every routine/ad-hoc exercise present when
// the screen loads, and appendAdhocBlock(), for one added live mid-workout
// (where existingSets is empty — nothing's been logged for it yet).
async function seedExerciseState(exercise: Exercise, existingSets: SetEntry[] = []) {
  const rows = existingSets.filter((s) => s.exerciseId === exercise.id).map(rowFromSet);
  setRowsByExercise[exercise.id] = reactive([...rows, makeEmptyRow()]);
  const lastSet = await getLastWorkoutBestSetForExercise(exercise.id, sessionId);
  ghostTextByExercise[exercise.id] = lastSet ? formatGhostText(lastSet.weightInLbs, lastSet.unit, lastSet.reps) : null;
}

async function loadWorkout() {
  if (!routineId || !sessionId) return;
  const routine = await getRoutineById(routineId);
  if (!routine) return;

  const exercises = await getExercisesForRoutine(routine);

  // Empty for a brand-new session — sessionSets only has rows when
  // resuming one already left in progress.
  const sessionSets = await getSetsForSession(sessionId);

  // Sets logged this session against an exercise the routine doesn't list
  // are from an ad-hoc exercise added mid-workout before the user left.
  // Add those exercises in too so resuming reconstructs them as standalone
  // blocks — this is what makes ad-hoc exercises survive a resume. Their
  // supersetWith (if any) is deliberately ignored below: ad-hoc additions
  // are always standalone, never paired into a superset.
  const routineExerciseIds = new Set(exercises.map((e) => e.id));
  const adhocExerciseIds = [...new Set(sessionSets.map((s) => s.exerciseId))].filter((id) => !routineExerciseIds.has(id));
  for (const id of adhocExerciseIds) {
    const exercise = await getExerciseById(id);
    if (exercise) exercises.push(exercise);
  }

  // Populate every exercise's row array and ghost text *before* exposing
  // blocks to the template. pairedRows() reads straight from
  // setRowsByExercise for both sides of a superset without a null-check,
  // so blocks must never become visible while a partner's rows haven't
  // been seeded yet — otherwise a render could land in that gap (this
  // loop awaits getLastWorkoutBestSetForExercise per exercise) and throw.
  // Superset pairs are always logged/added/removed in lockstep (see
  // addSupersetRow/removeSupersetRow), so rebuilding each exercise's rows
  // independently from its own sets, in logged order, still keeps both
  // sides index-aligned for pairedRows().
  for (const exercise of exercises) {
    await seedExerciseState(exercise, sessionSets);
  }

  const seen = new Set<string>();
  const builtBlocks: WorkoutBlock[] = [];
  for (const exercise of exercises) {
    if (seen.has(exercise.id)) continue;
    seen.add(exercise.id);
    // Only pairs two routine-defined exercises — an ad-hoc exercise is
    // always standalone, even if its supersetWith happens to point at
    // (or be pointed at by) something else, so a resumed session's
    // layout matches what "+ Add exercise" produces live.
    const partner =
      routineExerciseIds.has(exercise.id) && exercise.supersetWith
        ? exercises.find((e) => e.id === exercise.supersetWith && routineExerciseIds.has(e.id))
        : undefined;
    if (partner) {
      seen.add(partner.id);
      builtBlocks.push({ exercises: [exercise, partner] });
    } else {
      builtBlocks.push({ exercises: [exercise] });
    }
  }
  blocks.value = builtBlocks;
}

onMounted(loadWorkout);

function addRow(exerciseId: string) {
  setRowsByExercise[exerciseId].push(makeEmptyRow());
}

// Supersets always add a set to both exercises together, keeping their
// row arrays index-synced so "Set N" always pairs the right two rows.
function addSupersetRow(exerciseIdA: string, exerciseIdB: string) {
  setRowsByExercise[exerciseIdA].push(makeEmptyRow());
  setRowsByExercise[exerciseIdB].push(makeEmptyRow());
}

function getRow(exerciseId: string, index: number): SetRowState | undefined {
  const rows = setRowsByExercise[exerciseId];
  return rows ? rows[index] : undefined;
}

// Only the trailing row is ever eligible for removal — see SetRow's
// `removable` prop comment. Also keeps at least one row per exercise, so
// there's always somewhere to log a set.
function isLastRow(exerciseId: string, index: number): boolean {
  const rows = setRowsByExercise[exerciseId];
  return rows.length > 1 && index === rows.length - 1;
}

function removeRow(exerciseId: string, index: number) {
  if (!isLastRow(exerciseId, index)) return;
  setRowsByExercise[exerciseId].splice(index, 1);
}

// Mirrors addSupersetRow — a superset's two row arrays are added to and
// removed from together, keeping them index-synced.
function removeSupersetRow(exerciseIdA: string, exerciseIdB: string, index: number) {
  if (!isLastRow(exerciseIdA, index) || !isLastRow(exerciseIdB, index)) return;
  setRowsByExercise[exerciseIdA].splice(index, 1);
  setRowsByExercise[exerciseIdB].splice(index, 1);
}

// Zips a superset pair's two row arrays into { index, rowA, rowB } tuples
// so the template can render Set 1 of A immediately above Set 1 of B,
// then Set 2 of A above Set 2 of B, etc. rowA/rowB are references to the
// same reactive row objects the arrays hold, so v-model bindings on them
// still mutate the real state.
function pairedRows(block: WorkoutBlock): { index: number; rowA: SetRowState; rowB: SetRowState }[] {
  const [exerciseA, exerciseB] = block.exercises;
  const rowsA = setRowsByExercise[exerciseA.id];
  if (!rowsA) return [];
  return rowsA
    .map((rowA, index) => ({ index, rowA, rowB: getRow(exerciseB.id, index) }))
    .filter((pair): pair is { index: number; rowA: SetRowState; rowB: SetRowState } => Boolean(pair.rowB));
}

function toggleUnit(row: SetRowState) {
  row.unit = row.unit === 'lbs' ? 'kg' : 'lbs';
}

// partnerRow is only passed for superset rows. The rest banner should
// fire once per superset pair, after whichever exercise is checked off
// last — not after each individual component set — so it only starts
// here when there's no partner (standalone exercise) or the partner's
// matching row is already checked. Only fires on a first-time log, not
// when re-saving an edit made after unlockRow.
async function checkRow(exerciseId: string, row: SetRowState, partnerRow: SetRowState | null = null) {
  if (row.checked) return;
  // Weight is optional — bodyweight/banded exercises (scapular wall
  // slides, banded rows, etc.) have nothing to enter there. Reps is the
  // only field that's always required.
  const weightText = row.weightEntered.trim();
  const weightEntered = weightText === '' ? 0 : parseFloat(weightText);
  const reps = parseInt(row.reps, 10);
  row.weightInvalid = Number.isNaN(weightEntered);
  row.repsInvalid = Number.isNaN(reps);
  if (row.weightInvalid || row.repsInvalid) return;

  // A row already carrying a loggedSetId was unlocked for editing, not
  // logged for the first time — update the existing set in place rather
  // than creating a duplicate, which would also churn its id/createdAt
  // and reshuffle history ordering.
  const isEdit = Boolean(row.loggedSetId);
  // Spread — row is deeply reactive, so row.bandColors is a Proxy-wrapped
  // array. IndexedDB structured-clones everything Dexie writes, and it
  // can't clone a Proxy; a plain array copy is required at the DB boundary.
  const bandColors = [...row.bandColors];
  if (isEdit) {
    await updateSet(row.loggedSetId!, { reps, weightEntered, unit: row.unit, bandColors });
  } else {
    const set = await logSet({
      exerciseId,
      date: todayString(),
      reps,
      weightEntered,
      unit: row.unit,
      routineId,
      sessionId,
      bandColors,
    });
    row.loggedSetId = set.id;
  }
  row.checked = true;
  // Ghost text is deliberately left untouched here — it always reflects
  // the prior workout's best set (set once in loadWorkout), never what's
  // being logged in this session, so set 2 never shows set 1's own data.

  if (!isEdit && (!partnerRow || partnerRow.checked)) {
    startRestTimer(REST_SECONDS);
  }
}

// Re-opens an already-logged row for editing. Doesn't touch the
// database — the existing set stays as-is until the next reps change
// re-saves it via checkRow's update path above.
function unlockRow(row: SetRowState) {
  row.checked = false;
}

function viewHistory(exerciseId: string) {
  emit('navigate', 'progress-chart', { initialExerciseId: exerciseId });
}

// The only path that records a session duration — the header back-arrow
// still just navigates away with no write, since leaving mid-workout
// isn't "finishing" it.
// finishing guards against a second tap landing before the first async
// write + navigation completes (no loading state on the button, so a
// double-tap or a device double-firing the click event would otherwise
// write duplicate session rows).
const finishing = ref(false);
async function finishWorkout() {
  if (finishing.value) return;
  finishing.value = true;
  if (routineId && startedAt) {
    await logWorkoutSession({ id: sessionId!, routineId, date: todayString(), startedAt, endedAt: Date.now() });
  }
  clearActiveSession();
  emit('navigate', 'dashboard');
}

// Ad-hoc exercise search — same pattern as RoutineBuilderScreen's, trimmed
// down (no drag-reorder): search/create here is session-only. The exercise
// gets logged and shows up in this workout's history, but is never written
// back into the routine's saved exerciseIds — Routine Builder stays the
// only place that permanently changes a routine's exercise list.
const showAddExercise = ref(false);
const searchQuery = ref('');
const searchResults = ref<Exercise[]>([]);

// Applied to whatever exercise gets created next via search/create-new.
// Existing exercises keep whatever type they already have; there's no
// per-row cycle button here to change it post-add, only at creation time.
// Sticky across multiple ad-hoc adds in the same workout, not reset after
// each one.
const newExerciseResistanceType = ref<ResistanceType>('weight');

watch(
  searchQuery,
  async (query) => {
    searchResults.value = await searchExercises(query);
  },
  { immediate: true }
);

const mergedResults = computed<ExerciseOption[]>(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return [];
  const dbNames = new Set(searchResults.value.map((e) => e.name.toLowerCase()));
  const commonMatches = COMMON_EXERCISES.filter((name) => name.toLowerCase().includes(query) && !dbNames.has(name.toLowerCase())).map(
    (name) => ({ id: null, name })
  );
  return [...searchResults.value, ...commonMatches];
});

const exactMatchExists = computed(() => mergedResults.value.some((e) => e.name.toLowerCase() === searchQuery.value.trim().toLowerCase()));

// Already part of this workout — a routine exercise or one added ad-hoc
// earlier in the session — so it's grayed out instead of offered again.
function isInWorkout(exercise: ExerciseOption): boolean {
  if (exercise.id) return exercise.id in setRowsByExercise;
  return blocks.value.some((b) => b.exercises.some((e) => e.name.toLowerCase() === exercise.name.toLowerCase()));
}

async function appendAdhocBlock(exercise: Exercise) {
  await seedExerciseState(exercise);
  blocks.value.push({ exercises: [exercise] });
  showAddExercise.value = false;
  searchQuery.value = '';
}

async function addAdhocExercise(exercise: ExerciseOption) {
  if (isInWorkout(exercise)) return;
  if (exercise.id) {
    await appendAdhocBlock(exercise);
    return;
  }
  const created = await createExercise({ name: exercise.name, resistanceType: newExerciseResistanceType.value });
  await appendAdhocBlock(created);
}

async function createAndAddAdhocExercise() {
  const name = searchQuery.value.trim();
  if (!name) return;
  const created = await createExercise({ name, resistanceType: newExerciseResistanceType.value });
  await appendAdhocBlock(created);
}
</script>

<template>
  <div class="min-h-screen bg-background text-foreground pb-32">
    <ScreenHeader title="Workout" @back="emit('navigate', 'dashboard')" />

    <main class="px-4 py-4 space-y-6">
      <div v-for="block in blocks" :key="block.exercises[0].id">
        <!-- Standalone exercise -->
        <div v-if="block.exercises.length === 1" class="bg-surface border border-border rounded-2xl p-4">
          <div class="flex items-center justify-between mb-1">
            <h2 class="font-semibold text-base">{{ block.exercises[0].name }}</h2>
            <button @click="viewHistory(block.exercises[0].id)" class="px-3 py-2 rounded-lg bg-surface-2 text-xs font-semibold text-secondary active:bg-surface-3">History</button>
          </div>
          <div class="text-sm text-foreground-muted mb-3">
            <span v-if="ghostTextByExercise[block.exercises[0].id]">Last: [{{ ghostTextByExercise[block.exercises[0].id] }}]</span>
            <span v-else>No history yet</span>
          </div>

          <div class="space-y-2">
            <SetRow
              v-for="(row, index) in setRowsByExercise[block.exercises[0].id]"
              :key="index"
              :row="row"
              :index="index"
              :resistance-type="block.exercises[0].resistanceType || 'weight'"
              :removable="isLastRow(block.exercises[0].id, index)"
              @toggle-unit="toggleUnit(row)"
              @check="checkRow(block.exercises[0].id, row)"
              @unlock="unlockRow(row)"
              @remove="removeRow(block.exercises[0].id, index)"
            />
          </div>

          <button @click="addRow(block.exercises[0].id)" class="mt-3 w-full py-2.5 rounded-lg bg-surface-2 text-sm font-semibold text-secondary active:bg-surface-3">+ Add set</button>
        </div>

        <!-- Superset pair: one high-contrast bounding box, sets interleaved A1/B1/A2/B2/... -->
        <div v-else class="bg-surface border-2 border-primary-strong rounded-2xl p-4">
          <div class="flex items-center justify-between mb-3">
            <h2 class="font-semibold text-base">{{ block.exercises[0].name }} + {{ block.exercises[1].name }}</h2>
            <span class="text-xs uppercase tracking-wide text-primary-bright font-semibold flex-shrink-0">Superset</span>
          </div>

          <div class="space-y-3 text-xs text-foreground-muted mb-4">
            <div v-for="exercise in block.exercises" :key="exercise.id" class="flex items-center justify-between gap-2">
              <div class="min-w-0">
                <div class="text-foreground-subtle font-medium text-sm">{{ exercise.name }}</div>
                <span v-if="ghostTextByExercise[exercise.id]">Last: [{{ ghostTextByExercise[exercise.id] }}]</span>
                <span v-else>No history yet</span>
              </div>
              <button @click="viewHistory(exercise.id)" class="px-2 py-1.5 rounded-lg bg-surface-2 text-xs font-semibold text-secondary active:bg-surface-3 flex-shrink-0">History</button>
            </div>
          </div>

          <div class="space-y-3">
            <div v-for="pair in pairedRows(block)" :key="pair.index" class="rounded-xl bg-surface-2/60 p-2 space-y-2">
              <div class="text-xs text-foreground-faint px-1">Set {{ pair.index + 1 }}</div>

              <div>
                <div class="text-xs text-foreground-muted mb-1">{{ block.exercises[0].name }}</div>
                <SetRow
                  :row="pair.rowA"
                  compact
                  :resistance-type="block.exercises[0].resistanceType || 'weight'"
                  :removable="isLastRow(block.exercises[0].id, pair.index)"
                  @toggle-unit="toggleUnit(pair.rowA)"
                  @check="checkRow(block.exercises[0].id, pair.rowA, pair.rowB)"
                  @unlock="unlockRow(pair.rowA)"
                  @remove="removeSupersetRow(block.exercises[0].id, block.exercises[1].id, pair.index)"
                />
              </div>

              <div>
                <div class="text-xs text-foreground-muted mb-1">{{ block.exercises[1].name }}</div>
                <SetRow
                  :row="pair.rowB"
                  compact
                  :resistance-type="block.exercises[1].resistanceType || 'weight'"
                  :removable="isLastRow(block.exercises[1].id, pair.index)"
                  @toggle-unit="toggleUnit(pair.rowB)"
                  @check="checkRow(block.exercises[1].id, pair.rowB, pair.rowA)"
                  @unlock="unlockRow(pair.rowB)"
                  @remove="removeSupersetRow(block.exercises[0].id, block.exercises[1].id, pair.index)"
                />
              </div>
            </div>
          </div>

          <button @click="addSupersetRow(block.exercises[0].id, block.exercises[1].id)" class="mt-3 w-full py-2.5 rounded-lg bg-surface-2 text-sm font-semibold text-secondary active:bg-surface-3">+ Add set</button>
        </div>
      </div>
    </main>

    <div class="px-4 mb-3">
      <button
        v-if="!showAddExercise"
        @click="showAddExercise = true"
        class="w-full py-3 rounded-xl bg-surface-2 text-sm font-semibold text-secondary active:bg-surface-3"
      >
        + Add exercise
      </button>

      <div v-else class="bg-surface border border-border rounded-2xl p-4 space-y-2">
        <div class="flex items-center justify-between mb-1">
          <label class="text-sm text-foreground-muted">Add exercise</label>
          <button
            @click="
              showAddExercise = false;
              searchQuery = '';
            "
            class="text-sm text-foreground-muted"
          >
            Cancel
          </button>
        </div>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search exercises..."
          class="w-full rounded-xl bg-surface border border-border px-4 py-3 text-base"
        />

        <SegmentedToggle :options="RESISTANCE_TYPES" v-model="newExerciseResistanceType" size="sm" />
        <p class="text-xs text-foreground-faint">Resistance type for the next new exercise you add.</p>

        <div v-if="searchQuery.trim()" class="space-y-1">
          <button
            v-if="!exactMatchExists"
            @click="createAndAddAdhocExercise"
            class="w-full text-left px-4 py-3 rounded-xl bg-primary/10 border border-primary/40 text-primary-bright"
          >
            + Create "{{ searchQuery }}" as new exercise
          </button>
          <button
            v-for="exercise in mergedResults"
            :key="exercise.id || exercise.name"
            @click="addAdhocExercise(exercise)"
            :disabled="isInWorkout(exercise)"
            class="w-full text-left px-4 py-3 rounded-xl bg-surface border border-border disabled:opacity-40"
          >
            {{ exercise.name }}
          </button>
        </div>
      </div>
    </div>

    <div class="px-4">
      <button
        @click="finishWorkout"
        :disabled="finishing"
        class="w-full py-4 rounded-xl bg-primary text-on-primary font-semibold text-base active:bg-primary-bright disabled:opacity-60"
      >
        Finish Workout
      </button>
    </div>
  </div>
</template>
