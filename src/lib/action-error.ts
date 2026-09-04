const SERIALIZATION_CONFLICT_CODE = 'P2034';

/**
 * Prisma reports a serializable transaction retry as P2034. Keep that
 * implementation detail out of forms and give the operator a useful action.
 */
export function actionErrorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === SERIALIZATION_CONFLICT_CODE
  ) {
    return 'The invoice changed during this request. Refresh and try again.';
  }
  return error instanceof Error ? error.message : fallback;
}
