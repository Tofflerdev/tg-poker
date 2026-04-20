# Deferred Items — Phase 03

Items discovered during plan execution that are OUT OF SCOPE for the current
plan and should be triaged separately.

---

## [Plan 03-03] Pre-existing TypeScript error in `useTelegram.ts`

- **Found during:** Task 3 TypeScript verification
- **File:** `client/src/hooks/useTelegram.ts:131`
- **Error:**
  ```
  Argument of type '{ id: string; telegramId: number; username: string; firstName: string; lastName: string; photoUrl: string; balance: number; }' is not assignable to parameter of type 'SetStateAction<TelegramUser>'.
    Property 'displayName' is missing in type '...' but required in type 'TelegramUser'.
  ```
- **Scope check:** `git log --oneline -3 -- client/src/hooks/useTelegram.ts`
  shows last touch in commit `f9519a9` (pre-Phase 03). Plan 03-03 did not
  modify this file.
- **Disposition:** Deferred — pre-existing dev-mode auth bootstrap bug,
  unrelated to action-bubble work. Triage in a follow-up plan (suggest Phase
  03-04 or a Phase-04 chore plan to clean up pre-existing type errors).
