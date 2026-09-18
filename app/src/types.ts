import type { Column, ProcessingPath } from "@gc-eta/model";

export interface CaseDraft {
  column: Column;
  birthCountry?: string;
  category: string;
  priorityDate: string;
  path: ProcessingPath;
}

export type Screen = "case" | "results" | "explain" | "news";
