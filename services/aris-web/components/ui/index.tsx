import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
}

export const Button = ({ 
  children, 
  variant = 'primary', 
  className = '', 
  ...props 
}: ButtonProps) => {
  const baseClass = 'btn';
  
  let variantClass = 'btn-primary';
  if (variant === 'secondary') variantClass = 'btn-secondary';
  if (variant === 'ghost') variantClass = 'btn-ghost';
  
  return (
    <button 
      className={`${baseClass} ${variantClass} ${className}`} 
      {...props}
    >
      {children}
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

export const Badge = ({ children, variant = 'sky' }: { children: React.ReactNode; variant?: 'sky' | 'amber' | 'emerald' | 'violet' | 'red' | 'slate' }) => {
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
