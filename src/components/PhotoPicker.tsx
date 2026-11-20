/**
 * A button that opens the file picker from its own click, so the browser treats it as
 * a user gesture (spec §2.1: `accept="image/*"`, no `capture`, so camera and gallery
 * are both offered).
 */
import { useRef, type ComponentProps } from 'react';
import { Button } from './Button';

interface PhotoPickerProps extends Omit<ComponentProps<typeof Button>, 'onClick' | 'onChange'> {
  onPick(file: File): void;
}

export function PhotoPicker({ onPick, children, ...button }: PhotoPickerProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button {...button} onClick={() => input.current?.click()}>
        {children}
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        data-testid="photo-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ''; // allow picking the same file again
          if (file) onPick(file);
        }}
      />
    </>
  );
}
