export type ToolName =
  | 'create_chat'
  | 'switch_agent'
  | 'list_chats'
  | 'get_status'
  | 'none';

export type VoiceMode = 'off' | 'handsfree';

export type ToolCall = {
  tool: ToolName;
  args?: Record<string, unknown>;
};

export function extractToolCall(text: string): ToolCall | null {
  // Look for a fenced json block first.
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1] ?? text;

  // Find the first JSON object in the candidate.
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;

  const jsonText = candidate.slice(start, end + 1).trim();
  try {
    const parsed = JSON.parse(jsonText) as any;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.tool !== 'string') return null;

    const tool = parsed.tool as ToolName;
    const allowed: ToolName[] = [
      'create_chat',
      'switch_agent',
      'list_chats',
      'get_status',
      'none',
    ];
    if (!allowed.includes(tool)) return null;

    const args = parsed.args && typeof parsed.args === 'object' ? parsed.args : undefined;
    return { tool, args };
  } catch {
    return null;
  }
}
