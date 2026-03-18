import { useMutation } from '@tanstack/react-query';
import { aiApi } from '../lib/api';

export interface VoiceInsights {
  keyHighlights?: string[];
  risks?: string[];
  sentiment?: 'positive' | 'neutral' | 'negative';
  productivityScore?: number;
  suggestions?: string[];
}

export interface StandupVoiceResult {
  summary: string;
  yesterday: string;
  today: string;
  blockers: string;
  insights: VoiceInsights;
}

export interface EodVoiceResult {
  summary: string;
  accomplishments: string;
  plan_for_tomorrow: string;
  blockers: string;
  mood: 'GREEN' | 'YELLOW' | 'RED';
  insights: VoiceInsights;
}

export function useProcessVoice() {
  return useMutation({
    mutationFn: (params: {
      transcript: string;
      type: 'standup' | 'eod';
      projectId?: string;
      date?: string;
    }) => aiApi.processVoice(params),
  });
}
