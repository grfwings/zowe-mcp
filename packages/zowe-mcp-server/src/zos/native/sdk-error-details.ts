/*
 * This program and the accompanying materials are made available under the terms of the
 * Eclipse Public License v2.0 which accompanies this distribution, and is available at
 * https://www.eclipse.org/legal/epl-v20.html
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Copyright Contributors to the Zowe Project.
 *
 */

/**
 * Extracts `additionalDetails` from an SDK ImperativeError (or any error with that property).
 * Returns undefined when not present or empty.
 */
export function getAdditionalDetails(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'additionalDetails' in err) {
    const details = err.additionalDetails;
    if (typeof details === 'string' && details.trim().length > 0) {
      return details.trim();
    }
  }
  return undefined;
}

/**
 * Matches the SDK's `esmReturnCode`/`esmReasonCode` JSON keys (quoted, then a colon), so the
 * zowex prose "ESM rc: 8" in the same details is left alone.
 */
const ESM_CODE_KEY = /"esm(Return|Reason)Code"(\s*:)/g;

/**
 * Builds a user-facing error message that includes additionalDetails when available.
 *
 * SAF return codes in the details use the same vendor-neutral `productReturnCode`/
 * `productReasonCode` names as `CertActionResult.safReturnCodes` (#70). Only the returned text is
 * renamed; callers still classify errors on the raw SDK details.
 */
export function formatErrorWithDetails(message: string, details?: string): string {
  if (!details) return message;
  return `${message}\nDetails:\n${details.replace(ESM_CODE_KEY, '"product$1Code"$2')}`;
}

/**
 * Extracts the command output from an SDK error raised for a TSO command that ended with
 * return code 4.
 *
 * In TSO, rc 4 is a warning, not a failure: `LISTCAT LEVEL(x)` and `SEARCH CLASS(USER) MASK(x)`
 * use it for "no entries matched" and still produce their output (for example
 * `IDC3012I ENTRY x NOT FOUND`). The SDK reports any non-zero rc as an error and carries the
 * output in `additionalDetails` as JSON (`{"data": "<output>", ...}`).
 *
 * Returns the output text for an rc 4 error, or undefined for any other error (including other
 * return codes and details that are not in the expected shape), so callers rethrow those.
 */
export function getTsoWarningOutput(err: unknown): string | undefined {
  if (!(err instanceof Error) || !/\brc '4'/.test(err.message)) return undefined;
  const details = getAdditionalDetails(err);
  if (!details) return undefined;
  try {
    const parsed: unknown = JSON.parse(details);
    if (
      parsed &&
      typeof parsed === 'object' &&
      'data' in parsed &&
      typeof parsed.data === 'string'
    ) {
      return parsed.data;
    }
  } catch {
    // not JSON: treat as a real error
  }
  return undefined;
}
