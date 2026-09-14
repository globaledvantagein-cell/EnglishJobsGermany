// Cache module — re-exports for clean imports from one path.
//
//   memoryGet/Set/Delete/Clear → JS Map, current tab only
//   localGet/Set/Delete/ClearAll → localStorage, persists across sessions
//
// Use memory for: detail pages, things that should be fresh-ish each session
// Use local for:  light list data, dropdowns, anything expensive to refetch

export {
    memoryGet,
    memorySet,
    memoryDelete,
    memoryClear,
} from './memoryCache';

export {
    localGet,
    localSet,
    localDelete,
    localClearAll,
} from './localCache';
