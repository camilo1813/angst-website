// The one mobile breakpoint used by every world renderer and by the story coordinator.
// Kept in its own dependency-free module so importing it never pulls Three.js into a chunk.
export const MOBILE_BREAKPOINT_QUERY = '(max-width: 640px)';
