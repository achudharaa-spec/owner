import React, { useState, useEffect } from 'react';
import { auth, signInWithEmailAndPassword, createUserWithEmailAndPassword, googleProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut } from '../firebase';
import { RateLimiter, sanitizeInput } from '../utils/security';
import { toast } from '../utils/toast';

const limiter = new RateLimiter(5, 300); // 5 max attempts, 300s lockout

const CONFIGURED_ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || 'achudharaa@gmail.com').toLowerCase().trim();
const VISITING_CARD_PHONE = '9842686264';
const CUSTOM_ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'SriSuryaTex@2026';

export default function Login({ onLoginSuccess }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [honeypot, setHoneypot] = useState('');

  // Primary Direct Admin Authentication (No 2-Step Verification)
  const handlePrimaryAuth = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    // Anti-bot check
    if (honeypot) {
      console.warn('Bot attempt rejected.');
      return;
    }

    const lockStatus = limiter.isLockedOut();
    if (lockStatus.locked) {
      setErrorMsg(`⚠️ Too many failed attempts. Security lockout active for ${lockStatus.remainingSecs} seconds.`);
      return;
    }

    const rawId = sanitizeInput(identifier).trim();
    const cleanId = rawId.toLowerCase();
    const numericPhone = cleanId.replace(/[^0-9]/g, '');
    const strippedPhone = numericPhone.length === 12 && numericPhone.startsWith('91') ? numericPhone.slice(2) : numericPhone;

    // Check matching against configured .env email OR visiting card mobile number
    const isEmailMatch = Boolean(CONFIGURED_ADMIN_EMAIL && cleanId === CONFIGURED_ADMIN_EMAIL);
    const isPhoneMatch = Boolean(strippedPhone === VISITING_CARD_PHONE);
    const isAllowedIdentifier = isEmailMatch || isPhoneMatch;

    setIsSubmitting(true);

    // Verify Password: custom password or Firebase credentials
    const isPasswordValid = password === CUSTOM_ADMIN_PASSWORD;

    if (!isAllowedIdentifier) {
      limiter.recordFailedAttempt();
      setErrorMsg('🚨 Access Denied: Unauthorized Admin ID. Only the registered custom email or visiting card mobile number (98426 86264) is allowed.');
      setIsSubmitting(false);
      return;
    }

    if (!isPasswordValid) {
      limiter.recordFailedAttempt();
      setErrorMsg('🚨 Access Denied: Incorrect password. Not allowed.');
      setIsSubmitting(false);
      return;
    }

    // Both identifier and password match!
    try {
      // Establish local admin session
      sessionStorage.setItem('sst_admin_session', 'true');
      localStorage.setItem('sst_admin_session', 'true');
      sessionStorage.setItem('sst_admin_identifier', rawId);

      // Always establish Firebase Auth session as the admin account so Firestore recognizes the user
      try {
        await signInWithEmailAndPassword(auth, CONFIGURED_ADMIN_EMAIL, CUSTOM_ADMIN_PASSWORD);
      } catch (fbErr) {
        console.info('Firebase auth sign-in note:', fbErr.message);
        try {
          await createUserWithEmailAndPassword(auth, CONFIGURED_ADMIN_EMAIL, CUSTOM_ADMIN_PASSWORD);
        } catch (createErr) {
          console.warn('Firebase user creation note:', createErr.message);
        }
      }

      limiter.resetAttempts();
      toast.success('Admin authenticated successfully! Welcome to Sri Surya Tex.', 'Access Granted');
      onLoginSuccess();
    } catch (err) {
      console.error('Login error:', err);
      setErrorMsg('Authentication error: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Google Sign-In with .env Email Authorization
  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    const lockStatus = limiter.isLockedOut();
    if (lockStatus.locked) {
      setErrorMsg(`⚠️ Too many failed attempts. Security lockout active for ${lockStatus.remainingSecs} seconds.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const userCredential = await signInWithPopup(auth, googleProvider);
      const googleEmail = (userCredential.user.email || '').toLowerCase().trim();

      // Check if Google account email matches custom mail id from .env
      if (googleEmail === CONFIGURED_ADMIN_EMAIL) {
        sessionStorage.setItem('sst_admin_session', 'true');
        localStorage.setItem('sst_admin_session', 'true');
        sessionStorage.setItem('sst_admin_identifier', googleEmail);
        limiter.resetAttempts();
        toast.success('Admin authenticated via Google! Welcome.', 'Access Granted');
        onLoginSuccess();
      } else {
        await signOut(auth);
        setErrorMsg(`🚨 Access Denied: Google account (${userCredential.user.email}) is not allowed.`);
      }
    } catch (err) {
      console.warn('Google sign-in warning:', err.code, err.message);
      if (err.code !== 'auth/popup-closed-by-user') {
        setErrorMsg('Google Sign-In Error: ' + (err.message || err.code));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-card">
        {/* Brand Header with Sri Surya Tex logo */}
        <div className="login-header">
          <div className="login-logo-container">
            <img
              src="/assets/logo.png"
              alt="Sri Surya Tex"
              className="login-brand-logo"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = '/assets/logo.jpg';
              }}
            />
          </div>
          <h2>SRI SURYA TEX</h2>
          <p className="login-subtitle">Admin Operations & Dispatch Portal</p>
          <div className="login-badge-strip">
            <span className="badge-secure">
              <i className="fa-solid fa-lock-open"></i> Direct Admin Login
            </span>
          </div>
        </div>

        {/* Anti-Bot Honeypot */}
        <div style={{ display: 'none' }} aria-hidden="true">
          <input
            type="text"
            name="security_honeypot_field"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
            tabIndex="-1"
            autoComplete="off"
          />
        </div>

        {/* Direct Login Form */}
        <form className="login-form" onSubmit={handlePrimaryAuth}>
          <div className="form-group">
            <label>Admin Email or Mobile Number</label>
            <div className="input-icon-wrapper">
              <input
                id="admin-identifier"
                type="text"
                className="form-control"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="achudharaa@gmail.com or 98426 86264"
                required
                autoFocus
              />
              <i className="fa-solid fa-user-shield input-icon"></i>
            </div>
          </div>

          <div className="form-group">
            <label>Password</label>
            <div className="input-icon-wrapper">
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                className="form-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin password"
                required
              />
              <i
                className={`fa-solid ${showPassword ? 'fa-eye' : 'fa-eye-slash'} input-icon`}
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? 'Hide password' : 'Show password'}
              ></i>
            </div>
          </div>

          {errorMsg && (
            <div className="error-msg">
              <i className="fa-solid fa-triangle-exclamation"></i>
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-block btn-login"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <span><i className="fa-solid fa-circle-notch fa-spin"></i> Authenticating...</span>
            ) : (
              <span><i className="fa-solid fa-arrow-right-to-bracket"></i> Sign In as Admin</span>
            )}
          </button>

          <div style={{ margin: '0.4rem 0', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }}></div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #64748b)', textTransform: 'uppercase', fontWeight: 600 }}>or</span>
            <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }}></div>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isSubmitting}
            className="btn btn-secondary btn-block btn-google-signin"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.6rem',
              background: '#ffffff',
              color: '#1f2937',
              border: '1.5px solid #cbd5e1',
              fontWeight: 600,
              fontSize: '0.84rem',
              padding: '0.55rem 1rem',
              borderRadius: '9px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
              cursor: 'pointer'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" style={{ display: 'block', flexShrink: 0 }}>
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                fill="#EA4335"
              />
            </svg>
            <span>Sign In with Google Account</span>
          </button>
        </form>

        <div className="login-footer">
          <p>Sri Surya Tex &bull; 185, Eswaran Kovil Kidangu Street, Erode &bull; Cell: 98426 86264</p>
        </div>
      </div>
    </div>
  );
}
