import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import { join } from "path";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const logoBuffer = await readFile(join(process.cwd(), "public", "scribbl-logo.png"));
  const logoSrc = `data:image/png;base64,${logoBuffer.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#f0f0e8",
          position: "relative",
          fontFamily: "sans-serif",
        }}
      >
        {/* Top green accent bar */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 6, background: "#2f604b", display: "flex" }} />

        {/* Subtle grid pattern */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "radial-gradient(circle, #d0d0c0 1px, transparent 1px)",
            backgroundSize: "32px 32px",
            opacity: 0.4,
            display: "flex",
          }}
        />

        {/* Center content */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28, zIndex: 1 }}>
          {/* Logo in white pill */}
          <div
            style={{
              background: "white",
              borderRadius: 9999,
              padding: "20px 48px",
              boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
              display: "flex",
              alignItems: "center",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc} alt="Scribbl" style={{ height: 52, width: "auto" }} />
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize: 28,
              color: "#3a3a30",
              textAlign: "center",
              maxWidth: 680,
              lineHeight: 1.4,
              display: "flex",
            }}
          >
            Collaborative workspaces for teams, classes, and projects.
          </div>

          {/* Feature pills */}
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            {["Sessions", "Notes", "Chat", "Files", "Meetings"].map((label) => (
              <div
                key={label}
                style={{
                  background: "white",
                  border: "1.5px solid #d8d8ce",
                  borderRadius: 9999,
                  padding: "8px 20px",
                  fontSize: 16,
                  color: "#2f604b",
                  fontWeight: 600,
                  display: "flex",
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom URL */}
        <div
          style={{
            position: "absolute",
            bottom: 36,
            fontSize: 18,
            color: "#2f604b",
            fontWeight: 700,
            letterSpacing: "0.04em",
            display: "flex",
          }}
        >
          scribblapp.ca
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
