import type { Column, ProcessingPath } from "@gc-eta/model";

export interface CaseDraft {
  column: Column;
  birthCountry?: string;
  category: string;
  priorityDate: string;
  path: ProcessingPath;
  /**
   * Optional. Once Form I-485 is filed the remaining wait is a government
   * adjudication rather than the bulletin, which is a different question with
   * a different answer, so the app has to know which one to give.
   */
  filedI485?: boolean;
  /** ISO date, when known. Only meaningful with filedI485. */
  filedOn?: string;
}

export type Screen = "case" | "results" | "explain" | "news" | "methodology";

/**
 * What a tap on the results screen's refresh has come to so far.
 *
 * "current" and "failed" are separate on purpose: a check that could not
 * reach the server has not established that anything is up to date, and
 * saying so would be the one kind of wrong answer this app cannot afford.
 */
export type RefreshState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "updated"; note: string }
  | { status: "current"; note: string }
  | { status: "failed"; note: string };
