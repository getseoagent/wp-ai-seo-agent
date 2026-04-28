/**
 * Dunning schedule for failed recurring charges.
 *
 * `retry_count` is the number of failed attempts so far. RETRY_DAYS is indexed
 * by THAT count (0-indexed), so `nextChargeDelayDays(N)` answers:
 * "if we have N past failures, when should the (N+1)th attempt happen?"
 *
 *   N=0 (first failure just happened) → wait 1 day for retry #1
 *   N=1 → wait 3 days for retry #2
 *   N=2 → wait 7 days for retry #3
 *   N=3 → null (out of retries)
 *
 * MAX_RETRIES=3 means we make at most 3 retry attempts after the original
 * charge failed. The 4th overall failure (retry_count after increment === 3)
 * triggers cancellation. Numbers chosen to survive temporary card holds
 * without hammering issuers (decline-loop penalty avoidance).
 */
const RETRY_DAYS = [1, 3, 7] as const;
const MAX_RETRIES = RETRY_DAYS.length;

/** Delay (in days) until the next retry attempt given current retry_count.
 *  Returns null past the schedule — caller should cancel instead. */
export function nextChargeDelayDays(retryCount: number): number | null {
  if (retryCount < 0 || retryCount >= MAX_RETRIES) return null;
  return RETRY_DAYS[retryCount];
}

/** Whether retry_count has hit the cancel threshold. Worker calls this on the
 *  POST-increment count: a 0→1 transition is `shouldGiveUp(1)===false`, but
 *  a 2→3 transition is `shouldGiveUp(3)===true`. */
export function shouldGiveUp(retryCountAfterIncrement: number): boolean {
  return retryCountAfterIncrement >= MAX_RETRIES;
}

export function maxRetries(): number {
  return MAX_RETRIES;
}
