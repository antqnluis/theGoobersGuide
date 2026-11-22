/** The database error message (a snake_case code for our RPCs), or '' when there is none. */
export function readErrorMessage(error: unknown) {
  return error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
    ? error.message
    : ''
}
