import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DynamicIcon } from './common/DynamicIcon';
import { BotSelector } from './BotSelector';
import { NetworkSwitcher } from './NetworkSwitcher';
import { useLocation } from 'react-router-dom';
import { AnimatedText } from './common/AnimatedText';
import { VitalSignsHeader } from './VitalSignsHeader';

interface ModernHeaderProps {
  activeToken: string;
  savedBots: any[];
  onBotChange: () => void;
  onOpenSettings: () => void;
  position?: 'top' | 'bottom';
  stats?: any;
}

export function ModernHeader({ activeToken, savedBots, onBotChange, onOpenSettings, position = 'top', stats }: ModernHeaderProps) {
  const location = useLocation();
  const [isExpanded, setIsExpanded] = useState(false);

  let title = "TeleMan";
  if (location.pathname === '/') title = "Playground";
  else if (location.pathname === '/batch') title = "Batch";
  else if (location.pathname.startsWith('/autosyncer')) title = "Sync";

  const SettingsButton = ({ className }: { className?: string }) => (
    <button
      onClick={onOpenSettings}
      className={`p-2 text-text-muted hover:text-text-main hover:bg-surface-highlight rounded-xl transition-colors ${className}`}
      aria-label="Settings"
    >
      <DynamicIcon name={"settings" as any} size={20} />
    </button>
  );

  const isBottom = position === 'bottom';

  // Don't show expandable stats on bottom position
  const showStats = stats && !isBottom;

  return (
    <header className={isBottom
      ? "fixed bottom-6 left-0 right-0 z-50 flex justify-center px-6 pointer-events-none"
      : "sticky top-0 z-50 bg-canvas/80 backdrop-blur-xl border-b border-border px-4 transition-all duration-300"
    }>
       {/* Main Header Bar */}
       <div className="flex items-center justify-between min-w-0 w-full h-16 shrink-0">
         {/* Left Side: Icon + Title */}
         <div className="flex items-center gap-3 min-w-0">
           {/* Icon - Click to expand */}
           {!isBottom && (
             <motion.button
               onClick={() => setIsExpanded(!isExpanded)}
               className="p-2.5 bg-primary/20 rounded-xl text-primary shrink-0 hover:bg-primary/30 transition-colors"
               animate={{ rotate: isExpanded ? 180 : 0 }}
               transition={{ duration: 0.3 }}
             >
               <DynamicIcon name={"terminal" as any} size={18} />
             </motion.button>
           )}

           {isBottom && (
             <div className="p-2.5 bg-primary/20 rounded-xl text-primary shrink-0">
               <DynamicIcon name={"terminal" as any} size={18} />
             </div>
           )}

           {/* Title */}
           <h1 className="font-bold text-base tracking-tight text-text-main truncate pr-2">
             <AnimatedText text={title} key={title} />
           </h1>
         </div>

         {/* Right Side: Bot Selector + Settings */}
         {!isBottom && (
           <div className="flex items-center gap-2 shrink-0">
             <BotSelector
               currentBotToken={activeToken}
               savedBots={savedBots}
               onBotChange={onBotChange}
               onOpenSettings={onOpenSettings}
               isCompact={true}
             />
             <div className="w-px h-6 bg-border/50 mx-1 shrink-0"></div>
             <NetworkSwitcher />
             <div className="w-px h-6 bg-border/50 mx-1 shrink-0"></div>
             <SettingsButton />
           </div>
         )}

         {/* Inverted Actions for Bottom */}
         {isBottom && (
           <div className="flex items-center gap-2 border-l border-border/50 pl-2">
              <BotSelector
                currentBotToken={activeToken}
                savedBots={savedBots}
                onBotChange={onBotChange}
                onOpenSettings={onOpenSettings}
                isCompact={true}
              />
              <SettingsButton />
           </div>
         )}
       </div>

       {/* Expandable Stats Section */}
       <AnimatePresence>
         {isExpanded && showStats && (
           <motion.div
             initial={{ height: 0, opacity: 0 }}
             animate={{ height: 'auto', opacity: 1 }}
             exit={{ height: 0, opacity: 0 }}
             transition={{ duration: 0.3, ease: "easeInOut" }}
             className="overflow-hidden"
           >
             <div className="pt-3 pb-3">
               <VitalSignsHeader stats={stats} />
             </div>
           </motion.div>
         )}
       </AnimatePresence>
    </header>
  );
}
