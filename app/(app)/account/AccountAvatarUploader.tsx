"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { uploadAvatar, type AvatarUploadResult } from "./actions";

type Props = { currentAvatarUrl: string | null; displayName: string };

export function AccountAvatarUploader({ currentAvatarUrl, displayName }: Props) {
  const [avatarUrl, setAvatarUrl] = useState(currentAvatarUrl);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<AvatarUploadResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const visibleAvatarUrl = previewUrl ?? avatarUrl;
  const initials = useMemo(() => getInitials(displayName), [displayName]);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setResult(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!file) { setPreviewUrl(null); return; }
    setPreviewUrl(URL.createObjectURL(file));
    // Auto-submit on file select
    const form = e.target.form;
    if (form) form.requestSubmit();
  }

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const next = await uploadAvatar(formData);
      setResult(next);
      if (next.avatarUrl) {
        setAvatarUrl(next.avatarUrl);
        setPreviewUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    });
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <form onSubmit={handleSubmit} className="relative">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          name="avatar"
          type="file"
          accept="image/*"
          required
          onChange={handleFileChange}
          className="sr-only"
        />

        {/* Avatar circle */}
        {visibleAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={visibleAvatarUrl}
            alt={displayName}
            className="size-24 rounded-full border-2 border-[var(--color-border)] object-cover"
          />
        ) : (
          <div className="flex size-24 items-center justify-center rounded-full bg-[var(--color-secondary)] text-2xl font-bold text-white">
            {initials}
          </div>
        )}

        {/* Edit button overlay */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending}
          title="Change photo"
          className="absolute bottom-0 right-0 flex size-8 items-center justify-center rounded-full border-2 border-[var(--color-surface)] bg-[var(--color-surface-high)] text-[var(--color-muted)] shadow-sm transition hover:bg-[var(--color-border)] disabled:opacity-50"
        >
          {isPending ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          )}
        </button>
      </form>

      {/* Feedback */}
      {result?.error && (
        <p className="text-xs text-[var(--color-danger)]">{getAvatarErrorMessage(result.error)}</p>
      )}
      {result?.avatarUrl && (
        <p className="text-xs text-[var(--color-success)]">Photo updated.</p>
      )}
    </div>
  );
}

function getInitials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

function getAvatarErrorMessage(error: NonNullable<AvatarUploadResult["error"]>) {
  switch (error) {
    case "unauthenticated": return "Sign in again before uploading.";
    case "invalid": return "Choose a PNG, JPG, WebP, or GIF.";
    case "too-large": return "Image must be under 5 MB.";
    case "upload-failed": return "Upload failed. Try again.";
  }
}
