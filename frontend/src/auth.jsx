import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = still loading
  // true after the user arrives from a "reset password" email, until they set a new password
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password });
  const signOut = () => supabase.auth.signOut();
  const sendReset = email => supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  const setNewPassword = async password => {
    const res = await supabase.auth.updateUser({ password });
    if (!res.error) setRecovering(false);
    return res;
  };

  return (
    <AuthContext.Provider value={{ session, recovering, signIn, signOut, sendReset, setNewPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
