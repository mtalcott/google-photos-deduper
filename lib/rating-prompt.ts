export const RATING_PROMPT_STORAGE_KEY = "ratingPrompt"

const SCANS_BEFORE_REPROMPT = 3

export type RatingPromptState = {
  successfulScans: number
  nextPromptAt: number
  completed: boolean
}

const DEFAULT_STATE: RatingPromptState = {
  successfulScans: 0,
  nextPromptAt: 1,
  completed: false
}

function normalizeState(value: unknown): RatingPromptState {
  if (!value || typeof value !== "object") return { ...DEFAULT_STATE }

  const candidate = value as Partial<RatingPromptState>
  return {
    successfulScans:
      typeof candidate.successfulScans === "number" &&
      Number.isFinite(candidate.successfulScans) &&
      candidate.successfulScans >= 0
        ? Math.floor(candidate.successfulScans)
        : 0,
    nextPromptAt:
      typeof candidate.nextPromptAt === "number" &&
      Number.isFinite(candidate.nextPromptAt) &&
      candidate.nextPromptAt >= 1
        ? Math.floor(candidate.nextPromptAt)
        : 1,
    completed: candidate.completed === true
  }
}

async function loadState(): Promise<RatingPromptState> {
  const stored = await chrome.storage.local.get(RATING_PROMPT_STORAGE_KEY)
  return normalizeState(stored[RATING_PROMPT_STORAGE_KEY])
}

async function saveState(state: RatingPromptState): Promise<void> {
  await chrome.storage.local.set({ [RATING_PROMPT_STORAGE_KEY]: state })
}

/** Records only a newly completed scan, never restored results. */
export async function recordSuccessfulScan(): Promise<boolean> {
  const current = await loadState()
  const next = {
    ...current,
    successfulScans: current.successfulScans + 1
  }
  await saveState(next)
  return !next.completed && next.successfulScans >= next.nextPromptAt
}

export async function deferRatingPrompt(): Promise<void> {
  const current = await loadState()
  await saveState({
    ...current,
    nextPromptAt: current.successfulScans + SCANS_BEFORE_REPROMPT
  })
}

export async function completeRatingPrompt(): Promise<void> {
  const current = await loadState()
  await saveState({ ...current, completed: true })
}

export function chromeWebStoreReviewUrl(extensionId: string): string {
  return `https://chrome.google.com/webstore/detail/${encodeURIComponent(extensionId)}/reviews`
}
