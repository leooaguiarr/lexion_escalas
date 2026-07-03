"use client";

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { ErrorMessage } from '@/components/ErrorMessage';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/dashboard');
    });
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    if (mode === 'login') {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (loginError) {
        setError(loginError.message);
        return;
      }
      router.replace('/dashboard');
      return;
    }

    const { error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName || email.split('@')[0]
        }
      }
    });

    setLoading(false);
    if (signupError) {
      setError(signupError.message);
      return;
    }

    setMessage('Conta criada. Se a confirmação de e-mail estiver ativa no Supabase, confirme antes de entrar.');
    setMode('login');
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>Lexion Escalas</h1>
        <p>Organize escalas, turnos e pagamentos de forma simples.</p>

        <form onSubmit={handleSubmit} className="grid">
          {mode === 'signup' ? (
            <div className="form-row">
              <label>Nome completo</label>
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Seu nome" />
            </div>
          ) : null}

          <div className="form-row">
            <label>E-mail</label>
            <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@email.com" />
          </div>

          <div className="form-row">
            <label>Senha</label>
            <input type="password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="mínimo 6 caracteres" />
          </div>

          <ErrorMessage message={error} />
          {message ? <div className="success-message">{message}</div> : null}

          <button className="primary-button" disabled={loading} type="submit">
            {loading ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>

        <div className="actions">
          <button className="ghost-button" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
            {mode === 'login' ? 'Criar Conta' : 'Já tenho conta'}
          </button>
        </div>
      </section>
    </main>
  );
}
