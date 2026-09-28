import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import {
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Shield,
  ShieldCheck,
  User,
  Lock,
  Loader2,
  AlertTriangle,
  ArrowRight,
  Mail,
  Briefcase,
} from 'lucide-react';

// ─── Helpers ────────────────────────────────────────────────────────────────
const ROLE_LABELS: Record<string, string> = {
  org_owner: 'Organization Owner',
  org_admin: 'Organization Admin',
  billing_manager: 'Billing Manager',
  workspace_admin: 'Workspace Admin',
  member: 'Member',
  viewer: 'Viewer',
};

const ROLE_COLORS: Record<string, string> = {
  org_owner: '#7c3aed',
  org_admin: '#6d28d9',
  billing_manager: '#0891b2',
  workspace_admin: '#0284c7',
  member: '#059669',
  viewer: '#d97706',
};

function PasswordStrength({ password }: { password: string }) {
  const score = [/.{8,}/, /[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) =>
    r.test(password)
  ).length;

  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];
  const colors = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'];

  if (!password) return null;

  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: '3px',
              borderRadius: '99px',
              background: i <= score ? colors[score] : 'rgba(255,255,255,0.1)',
              transition: 'all 0.3s ease',
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: '11px', color: colors[score] }}>{labels[score]}</span>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export const AcceptInvite: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';
  const login = useAuthStore((state) => state.login);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [formError, setFormError] = useState('');

  // ── Fetch invitation preview ───────────────────────────────────────────────
  const {
    data: preview,
    isLoading,
    error: previewError,
  } = useQuery({
    queryKey: ['invite-preview', token],
    queryFn: async () => {
      const { data } = await api.get(`/invite/preview/${token}`);
      return data as {
        email: string;
        role: string;
        orgName: string;
        inviterName: string;
        expiresAt: string;
        isExistingUser: boolean;
        hasPassword: boolean;
      };
    },
    enabled: !!token,
    retry: false,
  });

  useEffect(() => {
    if (preview?.isExistingUser) setName('');
  }, [preview]);

  // ── Accept mutation ────────────────────────────────────────────────────────
  const acceptMutation = useMutation({
    mutationFn: async (payload: { token: string; name?: string; password?: string }) => {
      const { data } = await api.post('/invite/accept', payload);
      return data as {
        accessToken: string;
        refreshToken: string;
        user: { id: string; name: string; email: string; avatarUrl: string | null };
        organizationId: string;
        role: string;
      };
    },
    onSuccess: (data) => {
      // Store tokens and user, then advance to success screen
      localStorage.setItem('boardly_access_token', data.accessToken);
      if (data.refreshToken) localStorage.setItem('boardly_refresh_token', data.refreshToken);
      // Update axios default header immediately
      api.defaults.headers.common['Authorization'] = `Bearer ${data.accessToken}`;
      login({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: {
          id: data.user.id,
          name: data.user.name,
          email: data.user.email,
          avatarUrl: data.user.avatarUrl ?? undefined,
          organizationId: data.organizationId,
          role: data.role,
          createdAt: new Date().toISOString(),
          isPlatformAdmin: false,
          timezone: 'UTC',
          twoFactorEnabled: false,
        },
      });
      setStep(3);
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.message || 'Something went wrong. Please try again.');
    },
  });

  const handleAccept = () => {
    setFormError('');
    if (!preview) return;

    // Existing user with password: just accept
    if (preview.isExistingUser && preview.hasPassword) {
      acceptMutation.mutate({ token });
      return;
    }

    if (!name.trim()) {
      setFormError('Please enter your full name.');
      return;
    }
    if (password.length < 8) {
      setFormError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    acceptMutation.mutate({ token, name: name.trim(), password });
  };

  // ── Error states ───────────────────────────────────────────────────────────
  const errorCode = (previewError as any)?.response?.status;
  const errorMsg = (previewError as any)?.response?.data?.message || 'Something went wrong.';

  if (!token) {
    return (
      <ErrorScreen
        icon={<AlertTriangle size={32} color="#ef4444" />}
        title="Invalid Invitation"
        message="No invitation token was found in this link. Please check the link you were sent."
      />
    );
  }

  if (isLoading) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={{ textAlign: 'center', padding: '60px 40px' }}>
            <Loader2 size={32} color="#6366f1" style={{ animation: 'spin 1s linear infinite' }} />
            <p style={{ marginTop: '16px', color: '#94a3b8' }}>Loading your invitation…</p>
          </div>
        </div>
      </div>
    );
  }

  if (previewError) {
    return (
      <ErrorScreen
        icon={<AlertTriangle size={32} color={errorCode === 410 ? '#f97316' : '#ef4444'} />}
        title={
          errorCode === 410
            ? 'Invitation Expired or Used'
            : errorCode === 404
              ? 'Invitation Not Found'
              : 'Something Went Wrong'
        }
        message={errorMsg}
        showContact={errorCode === 410}
      />
    );
  }

  if (!preview) return null;

  const roleLabel = ROLE_LABELS[preview.role] ?? preview.role;
  const roleBadgeColor = ROLE_COLORS[preview.role] ?? '#6366f1';
  const skipPasswordStep = preview.isExistingUser && preview.hasPassword;

  // ── Step 1: Welcome screen ─────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={s.gradBar} />
          <div style={{ textAlign: 'center', padding: '28px 40px 0' }}>
            <span style={s.logoMark} />
            <span style={s.logoText}>Boardly</span>
          </div>
          <div style={{ padding: '28px 40px 36px' }}>
            <h1 style={s.headline}>You're invited! 🎉</h1>
            <p style={s.sub}>
              <strong style={{ color: '#a5b4fc' }}>{preview.inviterName}</strong> has invited you to
              join <strong style={{ color: '#e2e8f0' }}>{preview.orgName}</strong> on Boardly.
            </p>

            {/* Info card */}
            <div style={s.infoCard}>
              <InfoRow
                icon={<Building2 size={14} />}
                label="Organization"
                value={preview.orgName}
              />
              <div style={s.sep} />
              <InfoRow icon={<User size={14} />} label="Invited by" value={preview.inviterName} />
              <div style={s.sep} />
              <InfoRow icon={<Mail size={14} />} label="Your email" value={preview.email} />
              <div style={s.sep} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <ShieldCheck size={14} color="#64748b" />
                <div>
                  <div style={s.infoLabel}>Your Role</div>
                  <span style={{ ...s.roleBadge, background: roleBadgeColor }}>{roleLabel}</span>
                </div>
              </div>
            </div>

            {/* Benefits */}
            <div style={s.benefits}>
              <p
                style={{
                  margin: '0 0 10px',
                  fontSize: '12px',
                  color: '#64748b',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                What you'll get access to
              </p>
              {[
                'Collaborative workspaces & project boards',
                'Task management, sprints, and timesheets',
                'Real-time team communication & notifications',
              ].map((b) => (
                <div
                  key={b}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}
                >
                  <CheckCircle2 size={13} color="#6366f1" />
                  <span style={{ fontSize: '13px', color: '#94a3b8' }}>{b}</span>
                </div>
              ))}
            </div>

            <button id="invite-accept-btn" onClick={() => setStep(2)} style={s.primaryBtn}>
              {skipPasswordStep ? `Join ${preview.orgName}` : 'Accept Invitation'}
              <ArrowRight size={16} />
            </button>
            <p
              style={{ textAlign: 'center', fontSize: '12px', color: '#475569', marginTop: '14px' }}
            >
              By accepting, you agree to Boardly's Terms of Service.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: Set up account / confirm join ──────────────────────────────────
  if (step === 2) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={s.gradBar} />
          <div style={{ padding: '36px 40px' }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={s.stepIcon}>
                {skipPasswordStep ? (
                  <Building2 size={22} color="#6366f1" />
                ) : (
                  <Lock size={22} color="#6366f1" />
                )}
              </div>
              <h1
                style={{ ...s.headline, fontSize: '21px', marginTop: '14px', marginBottom: '6px' }}
              >
                {skipPasswordStep ? `Join ${preview.orgName}` : 'Set Up Your Account'}
              </h1>
              <p style={{ ...s.sub, marginBottom: 0 }}>
                {skipPasswordStep
                  ? `Confirm to join as a ${roleLabel}.`
                  : 'Choose your name and create a password.'}
              </p>
            </div>

            {/* Role pill */}
            <div
              style={{
                ...s.infoCard,
                flexDirection: 'row',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '24px',
              }}
            >
              <Briefcase size={14} color="#6366f1" />
              <span style={{ fontSize: '13px', color: '#94a3b8' }}>
                Joining <strong style={{ color: '#e2e8f0' }}>{preview.orgName}</strong> as{' '}
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '99px',
                    background: roleBadgeColor,
                    color: '#fff',
                    fontSize: '11px',
                    fontWeight: 600,
                  }}
                >
                  {roleLabel}
                </span>
              </span>
            </div>

            {/* Form */}
            {!skipPasswordStep && (
              <div>
                <div style={s.fGroup}>
                  <label style={s.label} htmlFor="invite-name">
                    Full Name
                  </label>
                  <div style={{ position: 'relative' }}>
                    <User
                      size={14}
                      color="#64748b"
                      style={{
                        position: 'absolute',
                        left: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                      }}
                    />
                    <input
                      id="invite-name"
                      type="text"
                      placeholder="Jane Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      style={s.input}
                      autoFocus
                    />
                  </div>
                </div>

                <div style={s.fGroup}>
                  <label style={s.label} htmlFor="invite-password">
                    Create Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Lock
                      size={14}
                      color="#64748b"
                      style={{
                        position: 'absolute',
                        left: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                      }}
                    />
                    <input
                      id="invite-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Min. 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      style={{ ...s.input, paddingRight: '40px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      style={s.eyeBtn}
                    >
                      {showPassword ? (
                        <EyeOff size={14} color="#64748b" />
                      ) : (
                        <Eye size={14} color="#64748b" />
                      )}
                    </button>
                  </div>
                  <PasswordStrength password={password} />
                </div>

                <div style={s.fGroup}>
                  <label style={s.label} htmlFor="invite-confirm">
                    Confirm Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Shield
                      size={14}
                      color="#64748b"
                      style={{
                        position: 'absolute',
                        left: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                      }}
                    />
                    <input
                      id="invite-confirm"
                      type={showConfirm ? 'text' : 'password'}
                      placeholder="Repeat password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      style={{ ...s.input, paddingRight: '40px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      style={s.eyeBtn}
                    >
                      {showConfirm ? (
                        <EyeOff size={14} color="#64748b" />
                      ) : (
                        <Eye size={14} color="#64748b" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {(formError || acceptMutation.error) && (
              <div style={s.errorBox}>
                <AlertTriangle size={13} />
                {formError || (acceptMutation.error as any)?.response?.data?.message}
              </div>
            )}

            <button
              id="invite-join-btn"
              onClick={handleAccept}
              disabled={acceptMutation.isPending}
              style={{
                ...s.primaryBtn,
                marginTop: '8px',
                opacity: acceptMutation.isPending ? 0.7 : 1,
              }}
            >
              {acceptMutation.isPending ? (
                <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
              ) : skipPasswordStep ? (
                <Building2 size={15} />
              ) : (
                <CheckCircle2 size={15} />
              )}
              {acceptMutation.isPending
                ? 'Joining…'
                : skipPasswordStep
                  ? `Join ${preview.orgName}`
                  : 'Create Account & Join'}
            </button>
            <button id="invite-back-btn" onClick={() => setStep(1)} style={s.ghostBtn}>
              ← Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 3: Success ────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.gradBar} />
        <div style={{ padding: '56px 40px', textAlign: 'center' }}>
          <div style={s.successRing}>
            <CheckCircle2 size={40} color="#10b981" />
          </div>
          <h1 style={{ ...s.headline, fontSize: '24px', marginTop: '20px', marginBottom: '8px' }}>
            Welcome aboard! 🎉
          </h1>
          <p style={{ ...s.sub, marginBottom: '4px' }}>
            You're now a member of <strong style={{ color: '#e2e8f0' }}>{preview.orgName}</strong>
          </p>
          <div style={{ marginBottom: '36px' }}>
            <span style={{ ...s.roleBadge, background: roleBadgeColor }}>{roleLabel}</span>
          </div>
          <button id="invite-go-dashboard-btn" onClick={() => navigate('/')} style={s.primaryBtn}>
            Go to Dashboard <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── ErrorScreen ──────────────────────────────────────────────────────────────
function ErrorScreen({
  icon,
  title,
  message,
  showContact,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
  showContact?: boolean;
}) {
  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.gradBar} />
        <div style={{ padding: '60px 40px', textAlign: 'center' }}>
          <div style={{ marginBottom: '14px' }}>{icon}</div>
          <h1 style={{ ...s.headline, fontSize: '20px', marginBottom: '8px' }}>{title}</h1>
          <p style={s.sub}>{message}</p>
          {showContact && (
            <p style={{ fontSize: '12px', color: '#475569' }}>
              Ask your admin to send a new invitation.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── InfoRow ──────────────────────────────────────────────────────────────────
function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <span style={{ color: '#64748b', flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={s.infoLabel}>{label}</div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0' }}>{value}</div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#0f172a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  card: {
    background: 'linear-gradient(135deg, #1e293b 0%, #1a2540 100%)',
    borderRadius: '16px',
    border: '1px solid rgba(99,102,241,0.2)',
    width: '100%',
    maxWidth: '460px',
    overflow: 'hidden',
    boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
  },
  gradBar: { height: '4px', background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #06b6d4)' },
  logoMark: {
    width: '28px',
    height: '28px',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    borderRadius: '7px',
    display: 'inline-block',
    verticalAlign: 'middle',
    marginRight: '8px',
  },
  logoText: { fontSize: '18px', fontWeight: 700, color: '#f8fafc', verticalAlign: 'middle' },
  headline: {
    margin: '0 0 8px',
    fontSize: '24px',
    fontWeight: 700,
    color: '#f8fafc',
    lineHeight: 1.2,
  },
  sub: { margin: '0 0 20px', fontSize: '14px', color: '#94a3b8', lineHeight: 1.6 },
  infoCard: {
    background: 'rgba(99,102,241,0.07)',
    border: '1px solid rgba(99,102,241,0.18)',
    borderRadius: '12px',
    padding: '14px 18px',
    marginBottom: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  sep: { height: '1px', background: 'rgba(99,102,241,0.13)' },
  infoLabel: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.07em',
    textTransform: 'uppercase' as const,
    color: '#64748b',
    marginBottom: '2px',
  },
  roleBadge: {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 600,
    color: '#fff',
  },
  benefits: {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.05)',
    borderRadius: '10px',
    padding: '12px 14px',
    marginBottom: '20px',
  },
  primaryBtn: {
    width: '100%',
    padding: '13px 24px',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    boxShadow: '0 4px 18px rgba(99,102,241,0.3)',
    transition: 'opacity 0.2s ease',
  },
  ghostBtn: {
    width: '100%',
    padding: '9px',
    background: 'transparent',
    color: '#64748b',
    border: 'none',
    cursor: 'pointer',
    fontSize: '12px',
    marginTop: '6px',
  },
  fGroup: { marginBottom: '14px' },
  label: {
    display: 'block',
    fontSize: '11px',
    fontWeight: 700,
    color: '#94a3b8',
    marginBottom: '6px',
    letterSpacing: '0.04em',
  },
  input: {
    width: '100%',
    padding: '9px 12px 9px 34px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(99,102,241,0.22)',
    borderRadius: '8px',
    color: '#e2e8f0',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  eyeBtn: {
    position: 'absolute',
    right: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '2px',
    display: 'flex',
    alignItems: 'center',
  },
  errorBox: {
    background: 'rgba(239,68,68,0.08)',
    border: '1px solid rgba(239,68,68,0.25)',
    borderRadius: '8px',
    padding: '9px 12px',
    color: '#fca5a5',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '10px',
  },
  stepIcon: {
    width: '52px',
    height: '52px',
    background: 'rgba(99,102,241,0.1)',
    border: '1px solid rgba(99,102,241,0.25)',
    borderRadius: '14px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successRing: {
    width: '76px',
    height: '76px',
    background: 'rgba(16,185,129,0.08)',
    border: '1px solid rgba(16,185,129,0.25)',
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};
