import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  isLoading?: boolean;
}

export const Button = ({ 
  children, 
  variant = 'primary', 
  isLoading, 
  className = '', 
  disabled,
  ...props 
}: ButtonProps) => {
  const baseClass = 'btn';
  const variantClass = variant === 'primary' ? 'btn-primary' : 'btn-secondary';
  
  return (
    <button 
      className={`${baseClass} ${variantClass} ${className}`} 
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? '...' : children}
    </button>
  );
};

export const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => {
  return <input className="input" {...props} />;
};

export const Card = ({ 
  children, 
  className = '', 
  style,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  return <div className={`card ${className}`} style={style} {...props}>{children}</div>;
};

export const Badge = ({ children, variant = 'sky' }: { children: React.ReactNode; variant?: 'sky' | 'amber' | 'emerald' | 'violet' | 'red' }) => {
  const style = {
    backgroundColor: `var(--accent-${variant}-bg)`,
    color: `var(--accent-${variant})`,
    border: `1px solid var(--accent-${variant}-bg)`
  };
  
  return (
    <span className="badge" style={style}>
      {children}
    </span>
  );
};
