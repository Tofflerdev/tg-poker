import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AdminLogin } from '../AdminLogin';

beforeEach(() => {
  // Reset localStorage between tests
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('AdminLogin', () => {
  it('renders username input, password input, and Sign In button', () => {
    render(<AdminLogin onLoginSuccess={vi.fn()} />);
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('on successful POST /api/admin/login response, stores JWT to localStorage and calls onLoginSuccess', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ token: 'fake.jwt.value' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );
    const onLoginSuccess = vi.fn();
    render(<AdminLogin onLoginSuccess={onLoginSuccess} />);
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'hunter2' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(localStorage.getItem('adminJwt')).toBe('fake.jwt.value'));
    expect(onLoginSuccess).toHaveBeenCalledTimes(1);
  });

  it('on 401 response, surfaces "Invalid username or password" error and clears password field', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    );
    render(<AdminLogin onLoginSuccess={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'admin' } });
    const pwd = screen.getByLabelText(/password/i) as HTMLInputElement;
    fireEvent.change(pwd, { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByText(/invalid username or password/i)).toBeInTheDocument());
    expect(pwd.value).toBe(''); // password cleared per UI-SPEC
    // Username preserved per UI-SPEC
    expect((screen.getByLabelText(/username/i) as HTMLInputElement).value).toBe('admin');
  });
});
