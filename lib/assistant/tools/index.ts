import type { AssistantTool } from "./types";
import { searchHorses, getHorseDetails, getHorseActivity } from "./horses";
import { getUpcomingSchedule, searchLogEntries } from "./schedule";
import {
  getFinancialSummary,
  getOutstandingReceivables,
} from "./financial";
import { getDocumentStatus } from "./documents";
import { getUserBarns, getBarnSummary } from "./barns";

export const ASSISTANT_TOOLS: AssistantTool[] = [
  searchHorses,
  getHorseDetails,
  getHorseActivity,
  getUpcomingSchedule,
  searchLogEntries,
  getFinancialSummary,
  getOutstandingReceivables,
  getDocumentStatus,
  getUserBarns,
  getBarnSummary,
];

const TOOL_MAP = new Map(ASSISTANT_TOOLS.map((t) => [t.definition.name, t]));

export function getToolByName(name: string): AssistantTool | undefined {
  return TOOL_MAP.get(name);
}

export { type AssistantTool, type ToolContext } from "./types";
