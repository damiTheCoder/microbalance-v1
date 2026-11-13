export type LedgerErrorCode = 'VALIDATION' | 'NOT_FOUND' | 'STATE';

/**
 * Domain error for the ledger/ERP layer. The API maps the code to an HTTP
 * status: VALIDATION -> 400, NOT_FOUND -> 404, STATE -> 409.
 */
export class LedgerError extends Error {
  readonly code: LedgerErrorCode;

  constructor(code: LedgerErrorCode, message: string) {
    super(message);
    this.name = 'LedgerError';
    this.code = code;
  }
}
