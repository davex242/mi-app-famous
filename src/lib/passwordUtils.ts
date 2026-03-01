// Password strength validation utilities

export interface PasswordStrength {
  score: number; // 0-4
  label: 'Very Weak' | 'Weak' | 'Fair' | 'Strong' | 'Very Strong';
  color: string;
  requirements: {
    minLength: boolean;
    hasUppercase: boolean;
    hasLowercase: boolean;
    hasNumber: boolean;
    hasSpecial: boolean;
  };
  feedback: string[];
}

export function checkPasswordStrength(password: string): PasswordStrength {
  const requirements = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
  };

  const feedback: string[] = [];
  
  if (!requirements.minLength) feedback.push('At least 8 characters');
  if (!requirements.hasUppercase) feedback.push('One uppercase letter');
  if (!requirements.hasLowercase) feedback.push('One lowercase letter');
  if (!requirements.hasNumber) feedback.push('One number');
  if (!requirements.hasSpecial) feedback.push('One special character (!@#$%^&*)');

  const metRequirements = Object.values(requirements).filter(Boolean).length;
  
  let score: number;
  let label: PasswordStrength['label'];
  let color: string;

  if (metRequirements <= 1) {
    score = 0;
    label = 'Very Weak';
    color = 'bg-red-500';
  } else if (metRequirements === 2) {
    score = 1;
    label = 'Weak';
    color = 'bg-orange-500';
  } else if (metRequirements === 3) {
    score = 2;
    label = 'Fair';
    color = 'bg-yellow-500';
  } else if (metRequirements === 4) {
    score = 3;
    label = 'Strong';
    color = 'bg-blue-500';
  } else {
    score = 4;
    label = 'Very Strong';
    color = 'bg-green-500';
  }

  return { score, label, color, requirements, feedback };
}

export function generateRandomPassword(length: number = 12): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%^&*';
  
  const allChars = uppercase + lowercase + numbers + special;
  
  // Ensure at least one of each type
  let password = '';
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];
  
  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

export function generateResetToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let token = '';
  for (let i = 0; i < 6; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

export function isPasswordValid(password: string): boolean {
  const strength = checkPasswordStrength(password);
  return strength.score >= 3; // Require at least "Strong" password
}
