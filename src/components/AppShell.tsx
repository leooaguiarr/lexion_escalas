"use client";

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Profile } from '@/lib/types';

const links = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/schedules', label: 'Escalas' },
  { href: '/guards', label: 'Seguranças' },
  { href: '/locations', label: 'Locais' },
  { href: '/payments', label: 'Pagamentos' },
  { href: '/reports', label: 'Relatórios' }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    async function loadProfile() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userData.user.id)
        .single();
      setProfile(data as Profile | null);
    }
    loadProfile();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar no-print">
        <div className="brand">
          <div className="brand-mark">LE</div>
          <div>
            <strong>Lexion Escalas</strong>
            <span>MVP</span>
          </div>
        </div>
        <nav className="nav-list">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className={pathname.startsWith(link.href) ? 'nav-link active' : 'nav-link'}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <small>{profile?.full_name ?? 'Usuário'}</small>
          <small className="muted">{profile?.role ?? ''}</small>
          <button className="ghost-button" onClick={signOut}>Sair</button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
