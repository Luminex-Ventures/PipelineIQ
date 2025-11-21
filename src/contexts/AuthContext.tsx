import { createContext, useContext, useEffect, useState } from 'react';
import { User, AuthError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { getUserRoleInfo, type UserRoleInfo } from '../lib/rbac';

interface AuthContextType {
  user: User | null;
  roleInfo: UserRoleInfo | null;
  loading: boolean;
  signUp: (email: string, password: string, name: string, inviteToken?: string) => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [roleInfo, setRoleInfo] = useState<UserRoleInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        const info = await getUserRoleInfo(session.user.id);
        setRoleInfo(info);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        setUser(session?.user ?? null);
        if (session?.user) {
          const info = await getUserRoleInfo(session.user.id);
          setRoleInfo(info);
        } else {
          setRoleInfo(null);
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, name: string, inviteToken?: string) => {
    if (!inviteToken) {
      return { error: { message: 'An invite code is required to create an account' } as AuthError };
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name }
      }
    });

    if (error || !data.user) {
      return { error };
    }

    const { error: acceptError } = await supabase.rpc('accept_workspace_invite', {
      invite_token: inviteToken
    });

    if (acceptError) {
      return { error: { message: acceptError.message } as AuthError };
    }

    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, roleInfo, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
