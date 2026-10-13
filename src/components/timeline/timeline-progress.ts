export const TIMELINE_READING_LINE = 0.6;
export const TIMELINE_BRANCH_DISTANCE = 64;

export function branchCompletionPosition(marker: HTMLElement) {
  const rect = marker.getBoundingClientRect();
  return (
    window.scrollY +
    rect.top +
    rect.height / 2 -
    innerHeight * TIMELINE_READING_LINE +
    TIMELINE_BRANCH_DISTANCE
  );
}
