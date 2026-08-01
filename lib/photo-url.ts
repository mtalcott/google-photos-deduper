// Google Photos media URLs (GpdMediaItem.thumb) are "bare" — no size suffix —
// and accept an appended directive to request a specific rendition:
// `=h{height}` scales to a height (preserving aspect ratio); `=w{width}-h{height}`
// scales/crops to fit both dimensions. This is the one place that builds those
// URLs; every call site should go through here rather than concatenating its
// own suffix.

export function buildThumbUrl(
  thumb: string,
  size: { height: number; width?: number }
): string {
  const { width, height } = size;
  return width ? `${thumb}=w${width}-h${height}` : `${thumb}=h${height}`;
}
