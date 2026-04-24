import React from 'react';
import { useTheme } from '../../context/ThemeContext';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function GlassCard({ children, className = '', style }: GlassCardProps) {
  const { currentTheme } = useTheme();
  const glassBlur = currentTheme?.background?.glassBlur ?? false;
  
  return (
    <div 
      className={className}
      style={glassBlur ? { 
        backdropFilter: 'blur(10px)', 
        WebkitBackdropFilter: 'blur(10px)',
        ...style 
      } : style}
    >
      {children}
    </div>
  );
}
