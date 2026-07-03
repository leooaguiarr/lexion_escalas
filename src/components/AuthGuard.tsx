"use client";

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
      if (!data.session) router.replace('/login');
    }).catch((error) => {
      console.error('Erro ao buscar sessão:', error);
      if (!mounted) return;
      setLoading(false);
      // Se não conseguiu buscar a sessão (ex: credenciais inválidas),
      // enviamos para o login para não ficar preso na tela de carregamento.
      router.replace('/login');
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) router.replace('/login');
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [router, pathname]);

  if (loading) {
    return <div className="center-screen">Carregando...</div>;
  }

  if (!session) return null;

  return <>{children}</>;
}
