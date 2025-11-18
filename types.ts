export interface ScriptTab {
  id: string;
  title: string;
  content: string;
}

export enum Sender {
  USER = 'USER',
  AI = 'AI',
  SYSTEM = 'SYSTEM'
}

export interface ChatMessage {
  id: string;
  text: string;
  sender: Sender;
  timestamp: number;
  isError?: boolean;
}

export type AiActionType = 'GENERATE' | 'EXPLAIN' | 'FIX' | 'CHAT';