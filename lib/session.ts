import { getIronSession, IronSession } from 'iron-session';
import { cookies } from 'next/headers';

export interface SessionData {
  isLoggedIn?: boolean;
  userId?: string;
  userName?: string;
  userPhone?: string;
  role?: string;
  developerUnlocked?: boolean;
  aiConfig?: SessionAIConfig;
  aiPresets?: SessionAIPreset[];
}

export type SessionAIConfig = {
  enabled: boolean;
  provider: string;
  apiStyle: 'openai-chat';
  baseUrl: string;
  model: string;
  rulesPrompt: string;
  apiKey?: string;
  updatedAt: string;
};

export type SessionAIPreset = {
  id: string;
  notes: string;
  provider: string;
  baseUrl: string;
  model: string;
  rulesPrompt: string;
  apiKey?: string;
  createdAt: string;
};

const sessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: 'clockin_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 30,
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}
