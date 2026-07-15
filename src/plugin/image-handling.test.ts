import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the (synchronous, durable) image-saver so we exercise the call-site
// plumbing at our two consumers WITHOUT touching the real filesystem. Locks in:
// the image part must embed the returned markdown string, and a write-failure
// must surface the inline base64 fallback rather than a path to a nonexistent
// file. image-saver.saveImageToDisk is sync + durable (mkdirSync/writeFileSync),
// so processImageData returns synchronously.
const processImageDataMock = vi.fn();
vi.mock("./image-saver", () => ({
  processImageData: (...args: unknown[]) => processImageDataMock(...args),
  saveImageToDisk: vi.fn(),
}));

import { transformThinkingParts } from "./request-helpers";
import { deduplicateThinkingText, createThoughtBuffer } from "./core/streaming/transformer";

function imageResponse() {
  return {
    candidates: [
      {
        content: {
          parts: [
            { inlineData: { mimeType: "image/png", data: "AAAABBBB" } },
          ],
        },
      },
    ],
  };
}

describe("image inlineData handling", () => {
  beforeEach(() => {
    processImageDataMock.mockReset();
  });

  it("transformThinkingParts embeds the saved file-path markdown", () => {
    processImageDataMock.mockReturnValue(
      "![Generated Image](/tmp/generated/image-1.png)",
    );

    const result = transformThinkingParts(imageResponse()) as any;
    expect(result.candidates[0].content.parts[0].text).toBe(
      "![Generated Image](/tmp/generated/image-1.png)",
    );
  });

  it("deduplicateThinkingText embeds the saved file-path markdown", () => {
    processImageDataMock.mockReturnValue(
      "![Generated Image](/tmp/generated/image-2.png)",
    );

    const buffer = createThoughtBuffer();
    const result = deduplicateThinkingText(imageResponse(), buffer) as any;
    expect(result.candidates[0].content.parts[0].text).toBe(
      "![Generated Image](/tmp/generated/image-2.png)",
    );
  });

  it("propagates the base64 fallback (write-failure path) instead of a broken file link", () => {
    // image-saver returns a base64 data URL when the durable write fails.
    const fallback = "![Generated Image](data:image/png;base64,AAAABBBB)";
    processImageDataMock.mockReturnValue(fallback);

    const result = transformThinkingParts(imageResponse()) as any;
    expect(result.candidates[0].content.parts[0].text).toBe(fallback);
  });

  it("leaves the part untouched when the saver returns null (no data)", () => {
    processImageDataMock.mockReturnValue(null);

    const result = transformThinkingParts(imageResponse()) as any;
    expect(result.candidates[0].content.parts[0].inlineData).toEqual({
      mimeType: "image/png",
      data: "AAAABBBB",
    });
  });
});
