import { useRef } from 'react';
import { t } from '../../i18n/t';
import styles from './DifficultyPicker.module.css';

interface DifficultyPickerProps {
  options: number[];
  value: number;
  onChange(value: number): void;
  /** "6 × 8 = 48 pieces" for the current value. */
  summary: string;
}

/** Difficulty chips as an ARIA radio group with arrow-key navigation (NFR-7). */
export function DifficultyPicker({ options, value, onChange, summary }: DifficultyPickerProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (index: number) => {
    const i = (index + options.length) % options.length;
    onChange(options[i]!);
    refs.current[i]?.focus();
  };
  return (
    <div className={styles.fieldset}>
      <div className={styles.legend} id="difficulty-label">
        {t('new.difficulty')}
      </div>
      <div className={styles.chips} role="radiogroup" aria-labelledby="difficulty-label">
        {options.map((n, i) => (
          <button
            key={n}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={n === value}
            aria-label={t('new.chip', { count: n })}
            tabIndex={n === value ? 0 : -1}
            className={styles.chip}
            onClick={() => onChange(n)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                move(i + 1);
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                move(i - 1);
              }
            }}
          >
            {n}
          </button>
        ))}
      </div>
      <p className={styles.grid} aria-live="polite" data-testid="grid-summary">
        {summary}
      </p>
    </div>
  );
}
