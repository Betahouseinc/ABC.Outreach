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
  // set when an admin created the account with a password they picked (Team page)
  const mustChangePassword = !!session?.user?.user_metadata?.must_change_password;
  const setNewPassword = async password => {
    const res = await supabase.auth.updateUser({ password, data: { must_change_password: false } });
    if (!res.error) setRecovering(false);
    return res;
  };

  return (
    <AuthContext.Provider value={{ session, recovering, mustChangePassword, signIn, signOut, sendReset, setNewPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
