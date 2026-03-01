import React from 'react';
import { Check, X } from 'lucide-react';
import { PasswordStrength } from '@/lib/passwordUtils';

interface PasswordStrengthIndicatorProps {
  strength: PasswordStrength;
  showRequirements?: boolean;
}

export default function PasswordStrengthIndicator({ 
  strength, 
  showRequirements = true 
}: PasswordStrengthIndicatorProps) {
  return (
    <div className="space-y-3">
      {/* Strength Bar */}
      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500">Password Strength</span>
          <span className={`text-xs font-medium ${
            strength.score === 0 ? 'text-red-600' :
            strength.score === 1 ? 'text-orange-600' :
            strength.score === 2 ? 'text-yellow-600' :
            strength.score === 3 ? 'text-blue-600' :
            'text-green-600'
          }`}>
            {strength.label}
          </span>
        </div>
        <div className="flex gap-1">
          {[0, 1, 2, 3, 4].map((index) => (
            <div
              key={index}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                index <= strength.score ? strength.color : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Requirements Checklist */}
      {showRequirements && (
        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          <p className="text-xs font-medium text-gray-700 mb-2">Password Requirements:</p>
          <div className="grid grid-cols-1 gap-1.5">
            <RequirementItem 
              met={strength.requirements.minLength} 
              text="At least 8 characters" 
            />
            <RequirementItem 
              met={strength.requirements.hasUppercase} 
              text="One uppercase letter (A-Z)" 
            />
            <RequirementItem 
              met={strength.requirements.hasLowercase} 
              text="One lowercase letter (a-z)" 
            />
            <RequirementItem 
              met={strength.requirements.hasNumber} 
              text="One number (0-9)" 
            />
            <RequirementItem 
              met={strength.requirements.hasSpecial} 
              text="One special character (!@#$%^&*)" 
            />
          </div>
        </div>
      )}
    </div>
  );
}

function RequirementItem({ met, text }: { met: boolean; text: string }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${met ? 'text-green-600' : 'text-gray-500'}`}>
      {met ? (
        <Check className="w-3.5 h-3.5 flex-shrink-0" />
      ) : (
        <X className="w-3.5 h-3.5 flex-shrink-0" />
      )}
      <span>{text}</span>
    </div>
  );
}
