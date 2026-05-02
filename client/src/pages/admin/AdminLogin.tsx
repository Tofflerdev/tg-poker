import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Card } from '../../components/ui';

/**
 * Phase 5 / Plan 05-05 / ADMIN-03 / UI-SPEC §AdminLoginPage.
 *
 * Username/password form — POSTs /api/admin/login, stores JWT to localStorage
 * on 200, surfaces 'Invalid username or password' on 401, clears password field.
 */

interface AdminLoginProps {
  onLoginSuccess: () => void;
}

const loginSchema = z.object({
  username: z.string().min(1, 'Required'),
  password: z.string().min(1, 'Required'),
});
type LoginForm = z.infer<typeof loginSchema>;

export const AdminLogin: React.FC<AdminLoginProps> = ({ onLoginSuccess }) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<LoginForm>({
    defaultValues: { username: '', password: '' },
  });
  const [serverError, setServerError] = useState<string | null>(null);

  const onSubmit = async (values: LoginForm) => {
    setServerError(null);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: values.username, password: values.password }),
      });
      if (res.status === 200) {
        const body = (await res.json()) as { token: string };
        localStorage.setItem('adminJwt', body.token);
        onLoginSuccess();
        return;
      }
      if (res.status === 401) {
        setServerError('Invalid username or password. Check your credentials.');
        // Clear password but preserve username (UI-SPEC).
        setValue('password', '');
        return;
      }
      setServerError('Server error. Try again.');
    } catch {
      setServerError('Server error. Try again.');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-surface-base)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <Card
        variant="neutral"
        style={{ maxWidth: 360, width: '100%', padding: 24 }}
      >
        <h1
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--color-active)',
            margin: 0,
          }}
        >
          Admin Access
        </h1>
        <p
          style={{
            fontSize: 13,
            color: 'var(--color-neutral)',
            margin: '4px 0 16px',
          }}
        >
          NightRiver control panel
        </p>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <label
            htmlFor="admin-username"
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--color-neutral)',
              marginBottom: 4,
            }}
          >
            Username
          </label>
          <input
            id="admin-username"
            type="text"
            autoComplete="username"
            {...register('username', { required: 'Required' })}
            style={inputStyle}
          />
          {errors.username && (
            <span style={errorStyle}>{errors.username.message}</span>
          )}

          <label
            htmlFor="admin-password"
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--color-neutral)',
              margin: '12px 0 4px',
            }}
          >
            Password
          </label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            {...register('password', { required: 'Required' })}
            style={inputStyle}
          />
          {errors.password && (
            <span style={errorStyle}>{errors.password.message}</span>
          )}

          {serverError && (
            <div style={{ ...errorStyle, marginTop: 12 }}>{serverError}</div>
          )}

          <div style={{ marginTop: 16 }}>
            <Button type="submit" variant="active" emphasis fullWidth>
              Sign In
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 44,
  background: 'rgba(255,255,255,0.04)',
  border: '1.5px solid color-mix(in srgb, var(--color-active) 50%, transparent)',
  borderRadius: 10,
  color: '#fff',
  fontSize: 14,
  padding: '0 12px',
  outline: 'none',
  boxSizing: 'border-box',
};

const errorStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  color: 'var(--color-action-fold)',
  marginTop: 4,
};
