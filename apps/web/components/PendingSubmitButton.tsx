"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

type PendingSubmitButtonProps = {
  children: ReactNode;
  className: string;
  disabled?: boolean;
  pendingLabel?: ReactNode;
  name?: string;
  value?: string;
};

export function PendingSubmitButton({
  children,
  className,
  disabled = false,
  name,
  pendingLabel,
  value,
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button name={name} value={value} disabled={disabled || pending} className={className}>
      {pending ? (pendingLabel ?? "Working...") : children}
    </button>
  );
}
