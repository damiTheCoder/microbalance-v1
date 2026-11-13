import 'dotenv/config';
import type { Content } from '@google/generative-ai';
import { runAgent } from './ai/agent.js';

const TURNS = [
  'What accounts do I have?',
  'Record a cash sale of 500 Naira.',
];

async function main(): Promise<void> {
  let history: Content[] = [];
  const replies: string[] = [];

  for (const [index, message] of TURNS.entries()) {
    const result = await runAgent(message, history);
    history = result.history;
    replies.push(result.reply);

    const tools = result.toolCalls.map((call) => call.name).join(', ') || 'none';
    console.log(
      `Turn ${index + 1} | tool: ${tools} | reply: ${result.reply.slice(0, 100)}`,
    );
  }

  console.log('--- exact replies ---');
  for (const [index, reply] of replies.entries()) {
    console.log(`${index + 1}: ${reply}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
