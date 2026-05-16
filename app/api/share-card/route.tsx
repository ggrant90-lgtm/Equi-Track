import { ImageResponse } from "next/og";

/**
 * Share card image route.
 *
 * Usage:
 *   GET /api/share-card?text=...&icon=📋&barn=Hilltop+Stables&size=square
 *
 * Returns a 1080×1080 (square) or 1080×1920 (story) PNG rendered
 * with next/og. The URL is the shareable artifact — there's no
 * bucket persistence in v1; we serve the image directly with a
 * generous Cache-Control so social-media link previews and shares
 * can fetch a stable bitmap.
 *
 * Design: parchment cream background, double-line brass-gold border,
 * BarnBook wordmark top-left, big serif headline as the hero, optional
 * barn name underline, decorative quill watermark, and the
 * barnbook.us URL bottom-left. No financial numbers — privacy.
 *
 * Fonts: Fraunces (serif) + Instrument Sans (sans) fetched from
 * Google Fonts at request time and cached server-side. The Satori
 * renderer that backs `next/og` needs explicit Buffer-loaded fonts.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PARCHMENT = "#f5efe4";
const INK = "#1c1a14";
const INK_SOFT = "rgba(28,26,20,0.7)";
const BRASS = "#c9a84c";
const FOREST = "#2a4031";

async function fetchFont(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font fetch failed: ${url}`);
  return res.arrayBuffer();
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const text =
      url.searchParams.get("text")?.trim() ||
      "A moment worth remembering.";
    const icon = url.searchParams.get("icon")?.trim() || "🐴";
    const barn = url.searchParams.get("barn")?.trim() || null;
    const sizeParam = url.searchParams.get("size") || "square";
    const isStory = sizeParam === "story";
    const width = 1080;
    const height = isStory ? 1920 : 1080;

    // Fraunces + Instrument Sans via Google Fonts. Cached by Node's
    // fetch cache + the route's revalidate semantics; in production
    // this lands once per cold start.
    const [fraunces, sans] = await Promise.all([
      fetchFont(
        "https://fonts.gstatic.com/s/fraunces/v32/6NUh8FyLNQOQZAnv9ZwNjucMHVn85Ni7emA.woff2",
      ).catch(() => null),
      fetchFont(
        "https://fonts.gstatic.com/s/instrumentsans/v1/pxiByp8kv8JHgFVrLDz8Z11lFc-K.woff2",
      ).catch(() => null),
    ]);

    const fonts = [];
    if (fraunces) {
      fonts.push({
        name: "Fraunces",
        data: fraunces,
        style: "normal" as const,
        weight: 600 as const,
      });
    }
    if (sans) {
      fonts.push({
        name: "Instrument Sans",
        data: sans,
        style: "normal" as const,
        weight: 500 as const,
      });
    }

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: PARCHMENT,
            display: "flex",
            flexDirection: "column",
            position: "relative",
            color: INK,
            padding: 80,
            fontFamily: "Instrument Sans, system-ui, sans-serif",
          }}
        >
          {/* Background subtle radial wash */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background:
                "radial-gradient(circle at 30% 25%, rgba(201,168,76,0.18) 0%, rgba(201,168,76,0) 55%)",
              display: "flex",
            }}
          />

          {/* Outer double-line border */}
          <div
            style={{
              position: "absolute",
              inset: 36,
              border: `2px solid ${BRASS}`,
              borderRadius: 8,
              display: "flex",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 50,
              border: `1px solid rgba(201,168,76,0.45)`,
              borderRadius: 4,
              display: "flex",
            }}
          />

          {/* Wordmark — top left */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              zIndex: 2,
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: 999,
                background: BRASS,
                display: "flex",
              }}
            />
            <div
              style={{
                fontFamily: fraunces
                  ? "Fraunces, serif"
                  : "Georgia, serif",
                fontSize: 30,
                color: FOREST,
                letterSpacing: "-0.01em",
              }}
            >
              BarnBook
            </div>
          </div>

          {/* Centered hero */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "40px 60px",
              zIndex: 2,
            }}
          >
            <div
              style={{
                fontSize: isStory ? 140 : 110,
                lineHeight: 1,
                marginBottom: 30,
                display: "flex",
                filter: "drop-shadow(0 4px 12px rgba(201,168,76,0.35))",
              }}
            >
              {icon}
            </div>
            <div
              style={{
                fontFamily: fraunces
                  ? "Fraunces, serif"
                  : "Georgia, serif",
                fontSize: isStory ? 72 : 64,
                lineHeight: 1.12,
                textAlign: "center",
                color: INK,
                letterSpacing: "-0.02em",
                maxWidth: 820,
                display: "flex",
              }}
            >
              {text}
            </div>

            {barn && (
              <div
                style={{
                  marginTop: 50,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    width: 80,
                    height: 1,
                    background: BRASS,
                    display: "flex",
                  }}
                />
                <div
                  style={{
                    fontSize: 26,
                    color: INK_SOFT,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  {barn}
                </div>
              </div>
            )}
          </div>

          {/* Footer — barnbook.us bottom-left */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              zIndex: 2,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 1,
                  background: BRASS,
                  display: "flex",
                }}
              />
              <div
                style={{
                  fontSize: 22,
                  color: FOREST,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                barnbook.us
              </div>
            </div>
            <div
              style={{
                fontSize: 18,
                color: "rgba(28,26,20,0.4)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                display: "flex",
              }}
            >
              Shareable moment
            </div>
          </div>
        </div>
      ),
      {
        width,
        height,
        fonts: fonts.length > 0 ? fonts : undefined,
        headers: {
          // 30 days. The URL is opaque to clients; if the user shares
          // the same celebration twice we want the same bitmap.
          "Cache-Control": "public, max-age=2592000, s-maxage=2592000, immutable",
          "Content-Type": "image/png",
        },
      },
    );
  } catch (err) {
    return new Response(
      `Failed to render share card: ${(err as Error).message}`,
      { status: 500 },
    );
  }
}
