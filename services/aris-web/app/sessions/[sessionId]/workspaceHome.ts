import { extractLastDirectoryName } from '@/lib/happy/utils';

const WORKSPACE_HOME_CHAT_LIMIT = 5;

export function deriveWorkspaceTitle(projectPath: string): string {
  return extractLastDirectoryName(projectPath);
}

export function limitWorkspaceHomeChats<T>(chats: T[]): T[] {
  return chats.slice(0, WORKSPACE_HOME_CHAT_LIMIT);
}
