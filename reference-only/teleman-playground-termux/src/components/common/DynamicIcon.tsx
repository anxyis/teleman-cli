import { Icon } from '@iconify/react';
import { useTheme } from '../../context/ThemeContext';

export type IconName =
    | 'settings' | 'terminal' | 'dashboard' | 'folders' | 'sync' | 'plus' | 'save'
    | 'trash' | 'play' | 'edit' | 'check' | 'loader' | 'chevron-down' | 'chevron-up'
    | 'chevron-left' | 'chevron-right' | 'arrow-left' | 'database' | 'user' | 'message'
    | 'hash' | 'clock' | 'refresh' | 'cpu' | 'activity' | 'hard-drive' | 'alert'
    | 'check-circle' | 'x-circle' | 'stop' | 'skip' | 'video' | 'folder-open'
    | 'calendar' | 'search' | 'sort' | 'file-text' | 'play-circle' | 'history'
    | 'book' | 'braces' | 'wand' | 'copy' | 'x' | 'grip' | 'layers' | 'target' | 'archive' | 'file-json' | 'beaker'
    | 'wifi' | 'tailscale' | 'eye' | 'download' | 'filter' | 'check-square' | 'square' | 'image' | 'type';

interface DynamicIconProps {
    name: IconName;
    size?: number | string;
    className?: string;
    strokeWidth?: number;
}

// Icon Set Prefixes:
// Lucide: lucide
// Phosphor: ph
// Tabler: tabler
// Heroicons: heroicons
// Remix: ri

const MAP: Record<IconName, Record<string, string>> = {
    'settings': { lucide: 'lucide:settings', ph: 'ph:gear', tabler: 'tabler:settings', heroicons: 'heroicons:cog-6-tooth', ri: 'ri:settings-3-line' },
    'terminal': { lucide: 'lucide:terminal', ph: 'ph:terminal-window', tabler: 'tabler:terminal-2', heroicons: 'heroicons:command-line', ri: 'ri:terminal-box-line' },
    'dashboard': { lucide: 'lucide:layout-dashboard', ph: 'ph:layout', tabler: 'tabler:layout-dashboard', heroicons: 'heroicons:squares-2x2', ri: 'ri:dashboard-line' },
    'folders': { lucide: 'lucide:folders', ph: 'ph:folders', tabler: 'tabler:folders', heroicons: 'heroicons:folder-open', ri: 'ri:folder-2-line' },
    'sync': { lucide: 'lucide:refresh-cw', ph: 'ph:arrows-clockwise', tabler: 'tabler:refresh', heroicons: 'heroicons:arrow-path', ri: 'ri:refresh-line' },
    'plus': { lucide: 'lucide:plus', ph: 'ph:plus', tabler: 'tabler:plus', heroicons: 'heroicons:plus', ri: 'ri:add-line' },
    'save': { lucide: 'lucide:save', ph: 'ph:floppy-disk', tabler: 'tabler:device-floppy', heroicons: 'heroicons:document-check', ri: 'ri:save-line' },
    'trash': { lucide: 'lucide:trash-2', ph: 'ph:trash', tabler: 'tabler:trash', heroicons: 'heroicons:trash', ri: 'ri:delete-bin-line' },
    'play': { lucide: 'lucide:play', ph: 'ph:play', tabler: 'tabler:play-button', heroicons: 'heroicons:play', ri: 'ri:play-line' },
    'edit': { lucide: 'lucide:pencil', ph: 'ph:pencil-line', tabler: 'tabler:edit', heroicons: 'heroicons:pencil-square', ri: 'ri:edit-line' },
    'check': { lucide: 'lucide:check', ph: 'ph:check', tabler: 'tabler:check', heroicons: 'heroicons:check', ri: 'ri:check-line' },
    'loader': { lucide: 'lucide:loader-2', ph: 'ph:spinner-gap', tabler: 'tabler:loader-2', heroicons: 'heroicons:arrow-path', ri: 'ri:loader-4-line' },
    'chevron-down': { lucide: 'lucide:chevron-down', ph: 'ph:caret-down', tabler: 'tabler:chevron-down', heroicons: 'heroicons:chevron-down', ri: 'ri:arrow-down-s-line' },
    'chevron-up': { lucide: 'lucide:chevron-up', ph: 'ph:caret-up', tabler: 'tabler:chevron-up', heroicons: 'heroicons:chevron-up', ri: 'ri:arrow-up-s-line' },
    'chevron-left': { lucide: 'lucide:chevron-left', ph: 'ph:caret-left', tabler: 'tabler:chevron-left', heroicons: 'heroicons:chevron-left', ri: 'ri:arrow-left-s-line' },
    'chevron-right': { lucide: 'lucide:chevron-right', ph: 'ph:caret-right', tabler: 'tabler:chevron-right', heroicons: 'heroicons:chevron-right', ri: 'ri:arrow-right-s-line' },
    'arrow-left': { lucide: 'lucide:arrow-left', ph: 'ph:arrow-left', tabler: 'tabler:arrow-left', heroicons: 'heroicons:arrow-left', ri: 'ri:arrow-left-line' },
    'database': { lucide: 'lucide:database', ph: 'ph:database', tabler: 'tabler:database', heroicons: 'heroicons:circle-stack', ri: 'ri:database-2-line' },
    'user': { lucide: 'lucide:user', ph: 'ph:user', tabler: 'tabler:user', heroicons: 'heroicons:user', ri: 'ri:user-line' },
    'message': { lucide: 'lucide:message-square', ph: 'ph:chat-centered-text', tabler: 'tabler:message-circle', heroicons: 'heroicons:chat-bubble-left-right', ri: 'ri:message-3-line' },
    'hash': { lucide: 'lucide:hash', ph: 'ph:hash', tabler: 'tabler:hash', heroicons: 'heroicons:hashtag', ri: 'ri:hashtag' },
    'clock': { lucide: 'lucide:clock', ph: 'ph:clock', tabler: 'tabler:clock', heroicons: 'heroicons:clock', ri: 'ri:time-line' },
    'refresh': { lucide: 'lucide:refresh-cw', ph: 'ph:arrows-clockwise', tabler: 'tabler:refresh', heroicons: 'heroicons:arrow-path', ri: 'ri:refresh-line' },
    'cpu': { lucide: 'lucide:cpu', ph: 'ph:cpu', tabler: 'tabler:cpu', heroicons: 'heroicons:cpu-chip', ri: 'ri:cpu-line' },
    'activity': { lucide: 'lucide:activity', ph: 'ph:activity', tabler: 'tabler:activity', heroicons: 'heroicons:chart-bar', ri: 'ri:pulse-line' },
    'hard-drive': { lucide: 'lucide:hard-drive', ph: 'ph:hard-drive', tabler: 'tabler:hard-drive', heroicons: 'heroicons:folder', ri: 'ri:hard-drive-2-line' },
    'alert': { lucide: 'lucide:alert-triangle', ph: 'ph:warning', tabler: 'tabler:alert-triangle', heroicons: 'heroicons:exclamation-triangle', ri: 'ri:error-warning-line' },
    'check-circle': { lucide: 'lucide:check-circle-2', ph: 'ph:check-circle', tabler: 'tabler:circle-check', heroicons: 'heroicons:check-circle', ri: 'ri:checkbox-circle-line' },
    'x-circle': { lucide: 'lucide:x-circle', ph: 'ph:x-circle', tabler: 'tabler:circle-x', heroicons: 'heroicons:x-circle', ri: 'ri:close-circle-line' },
    'stop': { lucide: 'lucide:stop-circle', ph: 'ph:stop-circle', tabler: 'tabler:player-stop', heroicons: 'heroicons:stop-circle', ri: 'ri:stop-circle-line' },
    'skip': { lucide: 'lucide:skip-forward', ph: 'ph:skip-forward', tabler: 'tabler:player-skip-forward', heroicons: 'heroicons:forward', ri: 'ri:skip-forward-line' },
    'video': { lucide: 'lucide:file-video', ph: 'ph:video', tabler: 'tabler:video', heroicons: 'heroicons:video-camera', ri: 'ri:video-line' },
    'folder-open': { lucide: 'lucide:folder-open', ph: 'ph:folder-open', tabler: 'tabler:folder-open', heroicons: 'heroicons:folder-open', ri: 'ri:folder-open-line' },
    'calendar': { lucide: 'lucide:calendar', ph: 'ph:calendar', tabler: 'tabler:calendar', heroicons: 'heroicons:calendar', ri: 'ri:calendar-line' },
    'search': { lucide: 'lucide:search', ph: 'ph:magnifying-glass', tabler: 'tabler:search', heroicons: 'heroicons:magnifying-glass', ri: 'ri:search-line' },
    'sort': { lucide: 'lucide:arrow-up-down', ph: 'ph:arrows-down-up', tabler: 'tabler:arrows-sort', heroicons: 'heroicons:bars-3-bottom-left', ri: 'ri:sort-asc' },
    'file-text': { lucide: 'lucide:file-text', ph: 'ph:file-text', tabler: 'tabler:file-text', heroicons: 'heroicons:document-text', ri: 'ri:file-text-line' },
    'play-circle': { lucide: 'lucide:play-circle', ph: 'ph:play-circle', tabler: 'tabler:player-play', heroicons: 'heroicons:play-circle', ri: 'ri:play-circle-line' },
    'history': { lucide: 'lucide:history', ph: 'ph:history', tabler: 'tabler:history', heroicons: 'heroicons:clock', ri: 'ri:history-line' },
    'book': { lucide: 'lucide:book-open', ph: 'ph:book-open', tabler: 'tabler:book', heroicons: 'heroicons:book-open', ri: 'ri:book-open-line' },
    'braces': { lucide: 'lucide:braces', ph: 'ph:brackets-curly', tabler: 'tabler:braces', heroicons: 'heroicons:code-bracket', ri: 'ri:code-s-line' },
    'wand': { lucide: 'lucide:wand-2', ph: 'ph:wand', tabler: 'tabler:wand', heroicons: 'heroicons:sparkles', ri: 'ri:magic-line' },
    'copy': { lucide: 'lucide:copy', ph: 'ph:copy', tabler: 'tabler:copy', heroicons: 'heroicons:document-duplicate', ri: 'ri:file-copy-line' },
    'x': { lucide: 'lucide:x', ph: 'ph:x', tabler: 'tabler:x', heroicons: 'heroicons:x-mark', ri: 'ri:close-line' },
    'grip': { lucide: 'lucide:grip-vertical', ph: 'ph:dots-six-vertical', tabler: 'tabler:grip-vertical', heroicons: 'heroicons:bars-2', ri: 'ri:draggable' },
    'layers': { lucide: 'lucide:layers', ph: 'ph:layers', tabler: 'tabler:layers-intersect', heroicons: 'heroicons:layers', ri: 'ri:layers-line' },
    'target': { lucide: 'lucide:target', ph: 'ph:target', tabler: 'tabler:target', heroicons: 'heroicons:map-pin', ri: 'ri:focus-3-line' },
    'archive': { lucide: 'lucide:archive', ph: 'ph:archive', tabler: 'tabler:archive', heroicons: 'heroicons:archive-box', ri: 'ri:archive-line' },
    'beaker': { lucide: 'lucide:beaker', ph: 'ph:flask', tabler: 'tabler:beaker', heroicons: 'heroicons:beaker', ri: 'ri:flask-line' },
    'file-json': { lucide: 'lucide:file-json', ph: 'ph:file-js', tabler: 'tabler:file-type-js', heroicons: 'heroicons:document-text', ri: 'ri:file-code-line' },
    'wifi': { lucide: 'lucide:wifi', ph: 'ph:wifi-high', tabler: 'tabler:wifi', heroicons: 'heroicons:signal', ri: 'ri:wifi-line' },
    'tailscale': { lucide: 'lucide:globe-2', ph: 'ph:globe', tabler: 'tabler:world', heroicons: 'heroicons:globe-alt', ri: 'ri:global-line' },
    'eye': { lucide: 'lucide:eye', ph: 'ph:eye', tabler: 'tabler:eye', heroicons: 'heroicons:eye', ri: 'ri:eye-line' },
    'download': { lucide: 'lucide:download', ph: 'ph:download-simple', tabler: 'tabler:download', heroicons: 'heroicons:arrow-down-tray', ri: 'ri:download-line' },
    'filter': { lucide: 'lucide:filter', ph: 'ph:funnel', tabler: 'tabler:filter', heroicons: 'heroicons:funnel', ri: 'ri:filter-line' },
    'check-square': { lucide: 'lucide:check-square', ph: 'ph:check-square', tabler: 'tabler:checkbox', heroicons: 'heroicons:check-badge', ri: 'ri:checkbox-line' },
    'square': { lucide: 'lucide:square', ph: 'ph:square', tabler: 'tabler:square', heroicons: 'heroicons:square-2x2', ri: 'ri:checkbox-blank-line' },
    'image': { lucide: 'lucide:image', ph: 'ph:image', tabler: 'tabler:photo', heroicons: 'heroicons:photo', ri: 'ri:image-line' },
    'type': { lucide: 'lucide:type', ph: 'ph:text-t', tabler: 'tabler:typography', heroicons: 'heroicons:language', ri: 'ri:font-size' },
};

export function DynamicIcon({ name, size = 20, className = '', strokeWidth }: DynamicIconProps) {
    const { currentTheme } = useTheme();
    
    // Default to lucide if theme pack not found
    const pack = (currentTheme as any)?.tokens?.icons?.pack || 'lucide';
    const iconId = MAP[name]?.[pack] || MAP[name]?.['lucide'];

    return (
        <Icon 
            icon={iconId} 
            width={size} 
            height={size} 
            className={`lucide ${className}`} 
            style={{ strokeWidth: strokeWidth }}
        />
    );
}
