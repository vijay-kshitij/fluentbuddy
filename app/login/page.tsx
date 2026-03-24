'use client';

import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function LoginPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && !loading) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loader}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <img 
          src="/bird.png" 
          alt="FluentBuddy Logo"
          style={{ 
            width: 64, 
            height: 64, 
            borderRadius: 8,
            transition: 'transform 0.2s',
            cursor: 'pointer'
          }}
          onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
          onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
        />
        <h1 style={styles.title}>FluentBuddy</h1>
        <p style={styles.subtitle}>
          Your AI English practice partner that remembers everything.
        </p>

        <button onClick={signInWithGoogle} style={styles.googleBtn}>
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          <span>Continue with Google</span>
        </button>

        <p style={styles.terms}>
          By continuing, you agree to practice English every day 😄
        </p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background: 'var(--bg)',
  } as React.CSSProperties,
  loader: {
    color: 'var(--text2)',
    fontSize: 14,
  } as React.CSSProperties,
  card: {
    maxWidth: 380,
    width: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    animation: 'fadeUp 0.5s ease',
  } as React.CSSProperties,
  title: {
    fontFamily: "'Fraunces', serif",
    fontSize: 32,
    fontWeight: 600,
    color: 'var(--amber)',
    textAlign: 'center' as const,
  } as React.CSSProperties,
  subtitle: {
    color: 'var(--text2)',
    fontSize: 15,
    textAlign: 'center' as const,
    marginTop: 8,
    lineHeight: 1.6,
    maxWidth: 300,
  } as React.CSSProperties,
  googleBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 28px',
    background: 'var(--surface)',
    color: 'var(--text)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 15,
    fontWeight: 500,
    marginTop: 32,
    width: '100%',
    justifyContent: 'center',
    border: '1px solid var(--surface3)',
  } as React.CSSProperties,
  terms: {
    color: 'var(--text3)',
    fontSize: 12,
    marginTop: 16,
    textAlign: 'center' as const,
  } as React.CSSProperties,
};
