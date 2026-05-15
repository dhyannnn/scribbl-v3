"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { uploadAvatar, type AvatarUploadResult } from "./actions";

type AccountAvatarUploaderProps = {
  currentAvatarUrl: string | null;
  displayName: string;
};

export function AccountAvatarUploader({ currentAvatarUrl, displayName }: AccountAvatarUploaderProps) {
  const [avatarUrl, setAvatarUrl] = useState(currentAvatarUrl);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<AvatarUploadResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const visibleAvatarUrl = previewUrl ?? avatarUrl;
  const initials = useMemo(() => getInitials(displayName), [displayName]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setResult(null);

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    if (!file) {
      setPreviewUrl(null);
      return;
    }

    setPreviewUrl(URL.createObjectURL(file));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const nextResult = await uploadAvatar(formData);
      setResult(nextResult);

      if (nextResult.avatarUrl) {
        setAvatarUrl(nextResult.avatarUrl);
        setPreviewUrl(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    });
  }

  return (
    <section className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {visibleAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Avatar URLs come from Supabase Storage and may include cache-busting query strings.
            <img
              src={visibleAvatarUrl}
              alt={displayName}
              className="size-20 shrink-0 rounded-full border border-[#d8d8ce] object-cover"
            />
          ) : (
            <div className="grid size-20 shrink-0 place-items-center rounded-full bg-[#2f604b] text-xl font-semibold text-white">
              {initials}
            </div>
          )}
          <div>
            <h2 className="text-xl font-semibold">Profile Picture</h2>
            <p className="mt-1 text-sm text-[#66685f]">Upload a square image up to 5 MB.</p>
            {result?.error ? <p className="mt-2 text-sm text-[#8a3328]">{getAvatarErrorMessage(result.error)}</p> : null}
            {result?.avatarUrl ? <p className="mt-2 text-sm text-[#2f604b]">Profile picture updated.</p> : null}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-3 sm:min-w-[260px]">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-[#4d4f47]">Image</span>
            <input
              ref={fileInputRef}
              name="avatar"
              type="file"
              accept="image/*"
              required
              onChange={handleFileChange}
              className="block w-full rounded-md border border-[#c8c8bd] bg-[#fbfbf8] px-3 py-2 text-sm text-[#4d4f47] file:mr-3 file:rounded-md file:border-0 file:bg-[#e7eee7] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[#2f604b] hover:file:bg-[#dce8dd]"
            />
          </label>
          <button
            disabled={isPending}
            className="min-h-11 rounded-md bg-[#2f604b] px-4 text-sm font-medium text-white transition hover:bg-[#244b3a] disabled:cursor-not-allowed disabled:bg-[#9cac9f]"
          >
            {isPending ? "Uploading..." : "Upload Picture"}
          </button>
        </form>
      </div>
    </section>
  );
}

function getInitials(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");

  return initials || "?";
}

function getAvatarErrorMessage(error: NonNullable<AvatarUploadResult["error"]>) {
  switch (error) {
    case "unauthenticated":
      return "Sign in again before uploading a profile picture.";
    case "invalid":
      return "Choose a PNG, JPG, WebP, or GIF image.";
    case "too-large":
      return "Choose an image smaller than 5 MB.";
    case "upload-failed":
      return "The image could not be uploaded. Check that the avatars bucket exists.";
  }
}
