import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';

export interface Me {
  id: string;
  email: string;
  name: string;
  city: string | null;
  danceSince: string | null;
  instagram: string | null;
  references: string | null;
  emailVerified: boolean;
  role: 'user' | 'moderator' | 'admin';
  status: string;
  statusNote: string | null;
  totpEnabled: boolean;
  mfa: boolean;
  createdAt: number;
}

interface Config {
  turnstileSiteKey: string | null;
  mailEnabled: boolean;
}

interface SessionValue {
  me: Me | null;
  config: Config;
  loading: boolean;
  refresh: () => Promise<void>;
  isMember: boolean;
  isStaff: boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [config, setConfig] = useState<Config>({ turnstileSiteKey: null, mailEnabled: false });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [m, c] = await Promise.all([api<{ user: Me | null }>('/auth/me'), api<Config>('/config')]);
    setMe(m.user);
    setConfig(c);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, [refresh]);

  const isMember = me?.status === 'approved';
  const isStaff = isMember && (me?.role === 'moderator' || me?.role === 'admin');
  return <SessionContext.Provider value={{ me, config, loading, refresh, isMember, isStaff }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('SessionProvider missing');
  return value;
}
