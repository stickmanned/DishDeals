export class WorkflowError extends Error {
  constructor(public code: string, message: string, public retryable = false) { super(message); }
}
export function safeError(error: unknown) {
  if (error instanceof WorkflowError) return { code: error.code, message: error.message, retryable: error.retryable };
  return { code: "PROCESSING_FAILED", message: "Processing failed. Retry or provide clearer source content.", retryable: false };
}
