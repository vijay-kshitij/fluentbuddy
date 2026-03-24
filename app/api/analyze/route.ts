import { createServerSupabase } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  // 1. Verify user is authenticated
  const supabase = createServerSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse request
  const { messages } = await req.json();

  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json({ error: 'Invalid messages' }, { status: 400 });
  }

  // 3. Analyze with Claude
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: `Analyze this English learning conversation between a student and their AI tutor. Return ONLY valid JSON, no markdown backticks, no preamble.

Conversation:
${JSON.stringify(messages.slice(-20))}

Return this exact JSON structure:
{
  "corrections": [
    {"original": "what user said wrong", "corrected": "correct version", "explanation": "brief why"}
  ],
  "newWords": ["word1", "word2"],
  "fluencyScore": 75,
  "tip": "one specific tip for improvement"
}

Rules:
- Only include corrections for actual user messages (role: "user"), not AI messages
- fluencyScore should be 0-100 based on grammar accuracy, vocabulary range, and naturalness
- newWords should be words the user successfully used that show vocabulary growth
- tip should be specific and actionable
- If the conversation is too short to analyze, return fluencyScore: 70 and empty arrays`,
          },
        ],
      }),
    });

    if (!response.ok) {
      return NextResponse.json(
        { corrections: [], newWords: [], fluencyScore: 70, tip: 'Keep practicing daily!' },
      );
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '{}';
    const analysis = JSON.parse(text.replace(/```json|```/g, '').trim());

    return NextResponse.json(analysis);
  } catch (err) {
    return NextResponse.json({
      corrections: [],
      newWords: [],
      fluencyScore: 70,
      tip: 'Keep practicing daily!',
    });
  }
}
