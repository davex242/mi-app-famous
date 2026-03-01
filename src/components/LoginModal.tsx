import React, { useState, useEffect, useRef } from 'react';
import { Lock, Mail, AlertCircle, Database, ArrowLeft, KeyRound, CheckCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { checkPasswordStrength, generateResetToken, isPasswordValid } from '@/lib/passwordUtils';
import PasswordStrengthIndicator from './PasswordStrengthIndicator';

// 3D Animated Background Component
function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let animationId: number;
    let particles: Particle[] = [];
    let mouseX = 0;
    let mouseY = 0;
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    class Particle {
      x: number;
      y: number;
      z: number;
      size: number;
      speedX: number;
      speedY: number;
      speedZ: number;
      color: string;
      rotationX: number;
      rotationY: number;
      rotationSpeed: number;
      shape: 'cube' | 'pyramid' | 'sphere' | 'ring';
      constructor() {
        this.x = Math.random() * canvas!.width;
        this.y = Math.random() * canvas!.height;
        this.z = Math.random() * 1000;
        this.size = Math.random() * 30 + 10;
        this.speedX = (Math.random() - 0.5) * 2;
        this.speedY = (Math.random() - 0.5) * 2;
        this.speedZ = Math.random() * 2 + 0.5;
        this.rotationX = Math.random() * Math.PI * 2;
        this.rotationY = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.05;
        const colors = ['rgba(59, 130, 246, 0.6)', 'rgba(139, 92, 246, 0.6)', 'rgba(236, 72, 153, 0.6)', 'rgba(14, 165, 233, 0.6)', 'rgba(168, 85, 247, 0.6)'];
        this.color = colors[Math.floor(Math.random() * colors.length)];
        const shapes: ('cube' | 'pyramid' | 'sphere' | 'ring')[] = ['cube', 'pyramid', 'sphere', 'ring'];
        this.shape = shapes[Math.floor(Math.random() * shapes.length)];
      }
      update() {
        this.x += this.speedX + (mouseX - canvas!.width / 2) * 0.001;
        this.y += this.speedY + (mouseY - canvas!.height / 2) * 0.001;
        this.z -= this.speedZ;
        this.rotationX += this.rotationSpeed;
        this.rotationY += this.rotationSpeed * 1.5;
        if (this.z <= 0) {
          this.z = 1000;
          this.x = Math.random() * canvas!.width;
          this.y = Math.random() * canvas!.height;
        }
        if (this.x < 0) this.x = canvas!.width;
        if (this.x > canvas!.width) this.x = 0;
        if (this.y < 0) this.y = canvas!.height;
        if (this.y > canvas!.height) this.y = 0;
      }
      draw() {
        const scale = 1000 / (1000 + this.z);
        const x2d = (this.x - canvas!.width / 2) * scale + canvas!.width / 2;
        const y2d = (this.y - canvas!.height / 2) * scale + canvas!.height / 2;
        const size = this.size * scale;
        ctx!.save();
        ctx!.translate(x2d, y2d);
        ctx!.globalAlpha = scale * 0.8;
        switch (this.shape) {
          case 'cube':
            this.drawCube(size);
            break;
          case 'pyramid':
            this.drawPyramid(size);
            break;
          case 'sphere':
            this.drawSphere(size);
            break;
          case 'ring':
            this.drawRing(size);
            break;
        }
        ctx!.restore();
      }
      drawCube(size: number) {
        const cos = Math.cos(this.rotationY);
        const sin = Math.sin(this.rotationY);
        const cosX = Math.cos(this.rotationX);
        const sinX = Math.sin(this.rotationX);
        const vertices = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]].map(([x, y, z]) => {
          const rotY = [x * cos - z * sin, y, x * sin + z * cos];
          const rotX = [rotY[0], rotY[1] * cosX - rotY[2] * sinX, rotY[1] * sinX + rotY[2] * cosX];
          return [rotX[0] * size * 0.5, rotX[1] * size * 0.5];
        });
        const faces = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [0, 3, 7, 4], [1, 2, 6, 5]];
        faces.forEach(face => {
          ctx!.beginPath();
          ctx!.moveTo(vertices[face[0]][0], vertices[face[0]][1]);
          for (let j = 1; j < face.length; j++) {
            ctx!.lineTo(vertices[face[j]][0], vertices[face[j]][1]);
          }
          ctx!.closePath();
          ctx!.fillStyle = this.color;
          ctx!.fill();
          ctx!.strokeStyle = 'rgba(255, 255, 255, 0.3)';
          ctx!.lineWidth = 1;
          ctx!.stroke();
        });
      }
      drawPyramid(size: number) {
        const cos = Math.cos(this.rotationY);
        const sin = Math.sin(this.rotationY);
        const vertices = [[0, -1, 0], [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]].map(([x, y, z]) => {
          const rotY = [x * cos - z * sin, y, x * sin + z * cos];
          return [rotY[0] * size * 0.5, rotY[1] * size * 0.5];
        });
        const faces = [[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1], [1, 2, 3, 4]];
        faces.forEach(face => {
          ctx!.beginPath();
          ctx!.moveTo(vertices[face[0]][0], vertices[face[0]][1]);
          for (let j = 1; j < face.length; j++) {
            ctx!.lineTo(vertices[face[j]][0], vertices[face[j]][1]);
          }
          ctx!.closePath();
          ctx!.fillStyle = this.color;
          ctx!.fill();
          ctx!.strokeStyle = 'rgba(255, 255, 255, 0.3)';
          ctx!.lineWidth = 1;
          ctx!.stroke();
        });
      }
      drawSphere(size: number) {
        const gradient = ctx!.createRadialGradient(-size * 0.3, -size * 0.3, 0, 0, 0, size);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
        gradient.addColorStop(0.5, this.color);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
        ctx!.beginPath();
        ctx!.arc(0, 0, size * 0.5, 0, Math.PI * 2);
        ctx!.fillStyle = gradient;
        ctx!.fill();
      }
      drawRing(size: number) {
        ctx!.rotate(this.rotationX);
        ctx!.beginPath();
        ctx!.ellipse(0, 0, size * 0.6, size * 0.2, 0, 0, Math.PI * 2);
        ctx!.strokeStyle = this.color;
        ctx!.lineWidth = size * 0.1;
        ctx!.stroke();
        const gradient = ctx!.createRadialGradient(-size * 0.1, -size * 0.1, 0, 0, 0, size * 0.25);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
        gradient.addColorStop(1, this.color);
        ctx!.beginPath();
        ctx!.arc(0, 0, size * 0.25, 0, Math.PI * 2);
        ctx!.fillStyle = gradient;
        ctx!.fill();
      }
    }
    for (let i = 0; i < 50; i++) {
      particles.push(new Particle());
    }
    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };
    window.addEventListener('mousemove', handleMouseMove);
    const animate = () => {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p1, i) => {
        particles.slice(i + 1).forEach(p2 => {
          const scale1 = 1000 / (1000 + p1.z);
          const scale2 = 1000 / (1000 + p2.z);
          const x1 = (p1.x - canvas.width / 2) * scale1 + canvas.width / 2;
          const y1 = (p1.y - canvas.height / 2) * scale1 + canvas.height / 2;
          const x2 = (p2.x - canvas.width / 2) * scale2 + canvas.width / 2;
          const y2 = (p2.y - canvas.height / 2) * scale2 + canvas.height / 2;
          const dist = Math.hypot(x2 - x1, y2 - y1);
          if (dist < 150) {
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = `rgba(139, 92, 246, ${(1 - dist / 150) * 0.3})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        });
      });
      particles.sort((a, b) => b.z - a.z);
      particles.forEach(particle => {
        particle.update();
        particle.draw();
      });
      animationId = requestAnimationFrame(animate);
    };
    ctx.fillStyle = 'rgb(15, 23, 42)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    animate();
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);
  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" style={{
    background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)'
  }} />;
}
type ViewMode = 'login' | 'forgot-password' | 'verify-code' | 'reset-password' | 'success';
export default function LoginModal() {
  const {
    login
  } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Forgot password states
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [enteredToken, setEnteredToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const passwordStrength = checkPasswordStrength(newPassword);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email, password);
    if (!result.success) {
      setError(result.error || 'Login failed');
    }
    setLoading(false);
  };
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Check if user exists
      const {
        data: user,
        error: userError
      } = await supabase.from('app_users').select('id, name, email').eq('email', resetEmail.toLowerCase()).single();
      if (userError || !user) {
        setError('No account found with this email address');
        setLoading(false);
        return;
      }

      // Generate reset token
      const token = generateResetToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Delete any existing tokens for this user
      await supabase.from('password_reset_tokens').delete().eq('user_id', user.id);

      // Save token to database
      const {
        error: tokenError
      } = await supabase.from('password_reset_tokens').insert({
        user_id: user.id,
        token: token,
        expires_at: expiresAt.toISOString()
      });
      if (tokenError) {
        throw new Error('Failed to create reset token');
      }

      // Send email
      const {
        error: emailError
      } = await supabase.functions.invoke('send-notification', {
        body: {
          type: 'password_reset',
          data: {
            userEmail: user.email,
            userName: user.name,
            resetToken: token
          }
        }
      });
      if (emailError) {
        console.error('Email error:', emailError);
        // Still proceed even if email fails - show the token for testing
      }
      setResetToken(token);
      setUserId(user.id);
      setViewMode('verify-code');
      setSuccessMessage(`A reset code has been sent to ${resetEmail}`);
    } catch (err: any) {
      setError(err.message || 'Failed to process password reset');
    } finally {
      setLoading(false);
    }
  };
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Verify token
      const {
        data: tokenData,
        error: tokenError
      } = await supabase.from('password_reset_tokens').select('*').eq('token', enteredToken.toUpperCase()).eq('used', false).single();
      if (tokenError || !tokenData) {
        setError('Invalid or expired reset code');
        setLoading(false);
        return;
      }

      // Check if expired
      if (new Date(tokenData.expires_at) < new Date()) {
        setError('This reset code has expired. Please request a new one.');
        setLoading(false);
        return;
      }
      setUserId(tokenData.user_id);
      setViewMode('reset-password');
    } catch (err: any) {
      setError(err.message || 'Failed to verify code');
    } finally {
      setLoading(false);
    }
  };
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate passwords
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!isPasswordValid(newPassword)) {
      setError('Password does not meet strength requirements');
      return;
    }
    setLoading(true);
    try {
      // Update password
      const {
        error: updateError
      } = await supabase.from('app_users').update({
        password_hash: newPassword
      }).eq('id', userId);
      if (updateError) {
        throw new Error('Failed to update password');
      }

      // Mark token as used
      await supabase.from('password_reset_tokens').update({
        used: true
      }).eq('token', enteredToken.toUpperCase());
      setViewMode('success');
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };
  const resetForgotPassword = () => {
    setViewMode('login');
    setResetEmail('');
    setEnteredToken('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setSuccessMessage('');
    setUserId(null);
  };
  return <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden">
      <AnimatedBackground />
      <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 via-purple-900/20 to-pink-900/20 backdrop-blur-[1px]" />

      <div className="relative z-10 w-full max-w-md">
        <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-3xl blur-xl opacity-30 animate-pulse" />
        
        <div className="relative backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 p-8 text-black bg-transparent bg-[url('https://d64gsuwffb70l.cloudfront.net/696f18a7729ddf932867bd60_1769490063695_c1e8ec1c.png')] bg-contain bg-center">
          
          {/* Login View */}
          {viewMode === 'login' && <>
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl shadow-lg shadow-blue-500/30 mb-4 animate-bounce">
                  <Database className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-3xl font-bold text-white">New Host Manager</h1>
                <p className="mt-2 text-green-500 text-lg">Recruitment Database Management System</p>
              </div>

              <div className="space-y-6">
                <h2 className="font-semibold text-center text-red-500 text-4xl">Welcome back</h2>
                
                {error && <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg flex items-center gap-2 text-red-300 backdrop-blur-sm">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span className="text-sm">{error}</span>
                  </div>}

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-slate-300">Email</label>
                    <div className="relative group">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-blue-400 transition-colors" />
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-white placeholder-slate-500" placeholder="Enter your email" required />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2 text-slate-300">Password</label>
                    <div className="relative group">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-blue-400 transition-colors" />
                      <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-white placeholder-slate-500" placeholder="Enter your password" required />
                    </div>
                  </div>

                  <div className="text-right">
                    <button type="button" onClick={() => setViewMode('forgot-password')} className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
                      Forgot Password?
                    </button>
                  </div>

                  <button type="submit" disabled={loading} className="w-full py-3 font-semibold rounded-lg bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 hover:scale-[1.02] focus:ring-4 focus:ring-purple-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">
                    {loading ? <span className="flex items-center justify-center gap-2">
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Signing in...
                      </span> : 'Sign In'}
                  </button>
                </form>

                <div className="mt-6 pt-6 border-t border-slate-700/50">
                  <p className="text-sm text-slate-500 text-center">
                    <span className="font-mono text-slate-400">by</span>
                  </p>
                  <p className="text-sm text-center text-slate-400">
                    <span className="font-mono bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">-STRex Developers-</span>
                  </p>
                </div>
              </div>
            </>}

          {/* Forgot Password View */}
          {viewMode === 'forgot-password' && <>
              <button onClick={resetForgotPassword} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6">
                <ArrowLeft className="w-4 h-4" />
                Back to Login
              </button>

              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl shadow-lg shadow-amber-500/30 mb-4">
                  <KeyRound className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-white">Forgot Password</h1>
                <p className="mt-2 text-slate-400">Enter your email to receive a reset code</p>
              </div>

              {error && <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg flex items-center gap-2 text-red-300 backdrop-blur-sm mb-4">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm">{error}</span>
                </div>}

              <form onSubmit={handleForgotPassword} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-2 text-slate-300">Email Address</label>
                  <div className="relative group">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-blue-400 transition-colors" />
                    <input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-white placeholder-slate-500" placeholder="Enter your email" required />
                  </div>
                </div>

                <button type="submit" disabled={loading} className="w-full py-3 font-semibold rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 hover:scale-[1.02] focus:ring-4 focus:ring-amber-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">
                  {loading ? <span className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Sending...
                    </span> : 'Send Reset Code'}
                </button>
              </form>
            </>}

          {/* Verify Code View */}
          {viewMode === 'verify-code' && <>
              <button onClick={resetForgotPassword} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6">
                <ArrowLeft className="w-4 h-4" />
                Back to Login
              </button>

              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-2xl shadow-lg shadow-blue-500/30 mb-4">
                  <KeyRound className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-white">Enter Reset Code</h1>
                <p className="mt-2 text-slate-400">Check your email for the 6-digit code</p>
              </div>

              {successMessage && <div className="p-3 bg-green-500/20 border border-green-500/50 rounded-lg flex items-center gap-2 text-green-300 backdrop-blur-sm mb-4">
                  <CheckCircle className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm">{successMessage}</span>
                </div>}

              {error && <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg flex items-center gap-2 text-red-300 backdrop-blur-sm mb-4">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm">{error}</span>
                </div>}

              <form onSubmit={handleVerifyCode} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-2 text-slate-300">Reset Code</label>
                  <input type="text" value={enteredToken} onChange={e => setEnteredToken(e.target.value.toUpperCase())} className="w-full px-4 py-4 bg-slate-800/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-white placeholder-slate-500 text-center text-2xl tracking-[0.5em] font-mono" placeholder="XXXXXX" maxLength={6} required />
                </div>

                <button type="submit" disabled={loading || enteredToken.length !== 6} className="w-full py-3 font-semibold rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-[1.02] focus:ring-4 focus:ring-blue-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">
                  {loading ? <span className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Verifying...
                    </span> : 'Verify Code'}
                </button>
              </form>

              <p className="text-center text-slate-500 text-sm mt-4" data-mixed-content="true" data-mixed-content="true" data-mixed-content="true">
                Didn't receive the code?{' '}
                <button onClick={() => setViewMode('forgot-password')} className="text-blue-400 hover:text-blue-300">
                  Resend
                </button>
              </p>
            </>}

          {/* Reset Password View */}
          {viewMode === 'reset-password' && <>
              <button onClick={resetForgotPassword} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6">
                <ArrowLeft className="w-4 h-4" />
                Back to Login
              </button>

              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl shadow-lg shadow-green-500/30 mb-4">
                  <Lock className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-white">Set New Password</h1>
                <p className="mt-2 text-slate-400">Create a strong password for your account</p>
              </div>

              {error && <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg flex items-center gap-2 text-red-300 backdrop-blur-sm mb-4">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm">{error}</span>
                </div>}

              <form onSubmit={handleResetPassword} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-2 text-slate-300">New Password</label>
                  <div className="relative group">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-blue-400 transition-colors" />
                    <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-white placeholder-slate-500" placeholder="Enter new password" required />
                  </div>
                </div>

                {newPassword && <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                    <PasswordStrengthIndicator strength={passwordStrength} />
                  </div>}

                <div>
                  <label className="block text-sm font-medium mb-2 text-slate-300">Confirm Password</label>
                  <div className="relative group">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-blue-400 transition-colors" />
                    <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={`w-full pl-10 pr-4 py-3 bg-slate-800/50 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-white placeholder-slate-500 ${confirmPassword && confirmPassword !== newPassword ? 'border-red-500' : 'border-slate-700'}`} placeholder="Confirm new password" required />
                  </div>
                  {confirmPassword && confirmPassword !== newPassword && <p className="text-red-400 text-sm mt-1">Passwords do not match</p>}
                </div>

                <button type="submit" disabled={loading || !isPasswordValid(newPassword) || newPassword !== confirmPassword} className="w-full py-3 font-semibold rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg shadow-green-500/30 hover:shadow-green-500/50 hover:scale-[1.02] focus:ring-4 focus:ring-green-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">
                  {loading ? <span className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Resetting...
                    </span> : 'Reset Password'}
                </button>
              </form>
            </>}

          {/* Success View */}
          {viewMode === 'success' && <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full shadow-lg shadow-green-500/30 mb-6">
                <CheckCircle className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Password Reset Successful!</h1>
              <p className="text-slate-400 mb-8">Your password has been updated. You can now sign in with your new password.</p>
              <button onClick={resetForgotPassword} className="w-full py-3 font-semibold rounded-lg bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 hover:scale-[1.02] focus:ring-4 focus:ring-purple-500/30 transition-all">
                Back to Sign In
              </button>
            </div>}
        </div>
      </div>

      <div className="fixed top-10 left-10 w-20 h-20 bg-blue-500/20 rounded-full blur-xl animate-pulse" />
      <div className="fixed bottom-10 right-10 w-32 h-32 bg-purple-500/20 rounded-full blur-xl animate-pulse" style={{
      animationDelay: '1s'
    }} />
      <div className="fixed top-1/2 right-20 w-16 h-16 bg-pink-500/20 rounded-full blur-xl animate-pulse" style={{
      animationDelay: '2s'
    }} />
    </div>;
}