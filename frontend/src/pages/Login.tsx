import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock } from 'lucide-react';
import { AuthLayout } from '../components/layout/AuthLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';
import logo from '../assets/E2M_Logo.png';

export function Login() {
  const [email, setEmail] = useState('admin@e2m.com');
  const [password, setPassword] = useState('password123');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const login = useAuthStore(state => state.login);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await api.post('/auth/login', { email, password });
      login(response.data.user, response.data.access_token);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to login');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      <Card>
        <CardHeader style={{ textAlign: 'center', paddingBottom: '28px' }}>
          <img
            src={logo}
            alt="E2M"
            style={{
              width: '65px',
              height: '65px',
              borderRadius: '0px',
              margin: '0 auto 18px',
            }}
          />
          <CardTitle style={{ fontSize: '1.5rem', letterSpacing: '-0.03em' }}>Welcome to E2M</CardTitle>
          <CardDescription>Sign in to the AI Hiring Platform</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Input 
              type="email" 
              placeholder="Email address" 
              leftIcon={<Mail size={18} />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input 
              type="password" 
              placeholder="Password" 
              leftIcon={<Lock size={18} />}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && <div style={{ color: 'var(--danger)', fontSize: '0.875rem', textAlign: 'center' }}>{error}</div>}
            <Button type="submit" size="lg" isLoading={isLoading} style={{ marginTop: '8px' }}>
              Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
