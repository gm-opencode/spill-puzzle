import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';
import { Icon, type IconName } from './Icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  /** Icon-only button; `aria-label` is then required. */
  iconOnly?: boolean;
  block?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = 'secondary',
  icon,
  iconOnly,
  block,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const cls = [
    styles.button,
    variant !== 'secondary' && styles[variant],
    iconOnly && styles.icon,
    block && styles.block,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={cls} {...rest}>
      {icon && <Icon name={icon} />}
      {!iconOnly && children}
    </button>
  );
}
