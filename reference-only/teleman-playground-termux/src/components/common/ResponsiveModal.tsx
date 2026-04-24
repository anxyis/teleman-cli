import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DynamicIcon } from './DynamicIcon';
import { AnimatedText } from './AnimatedText';
import { motion, AnimatePresence } from 'framer-motion';

interface ResponsiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  widthClass?: string;
}

const EASING_MAP: any = {
  'easeIn': [0.55, 0.055, 0.675, 0.19],
  'easeOut': [0.215, 0.61, 0.355, 1],
  'easeInOut': [0.645, 0.045, 0.355, 1],
  'circOut': [0.075, 0.82, 0.165, 1],
  'expoOut': [0.19, 1, 0.22, 1],
  'backOut': [0.175, 0.885, 0.32, 1.275],
  'anticipate': [0.6, -0.28, 0.735, 0.045],
  'quartOut': [0.165, 0.84, 0.44, 1],
  'quintOut': [0.23, 1, 0.32, 1],
  'cubicOut': [0.215, 0.61, 0.355, 1],
  'linear': [0, 0, 1, 1]
};

export function ResponsiveModal({
  isOpen,
  onClose,
  title,
  description,
  children,
  actions,
  widthClass = 'max-w-2xl'
}: ResponsiveModalProps) {
  // Read animation settings
  const config = {
    enabled: localStorage.getItem('modalAnimEnabled') !== 'false',
    style: localStorage.getItem('modalAnimStyle') || 'slide-left',
    speed: parseFloat(localStorage.getItem('modalAnimSpeed') || '0.3'),
    bouncy: localStorage.getItem('modalAnimBouncy') === 'true',
    stiffness: parseInt(localStorage.getItem('modalAnimStiffness') || '300'),
    easing: localStorage.getItem('modalAnimEasing') || 'easeIn'
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const getAnimationProps = () => {
    if (!config.enabled) return { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 0 } };

    const initialMap: any = {
      'slide-left': { x: -100, opacity: 0 },
      'slide-right': { x: 100, opacity: 0 },
      'slide-up': { y: 100, opacity: 0 },
      'scale': { scale: 0.9, opacity: 0 }
    };

    const transition: any = config.bouncy 
      ? { type: 'spring', stiffness: config.stiffness, damping: 25 }
      : { duration: config.speed, ease: EASING_MAP[config.easing] || config.easing };

    return {
      initial: initialMap[config.style] || initialMap['slide-left'],
      animate: { x: 0, y: 0, scale: 1, opacity: 1 },
      exit: { ...initialMap[config.style], opacity: 0 },
      transition
    };
  };

  const anim = getAnimationProps();

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4">
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal Container */}
          <motion.div
            {...anim}
            className={`
              relative w-full h-full md:h-auto md:max-h-[85vh] ${widthClass}
              bg-surface shadow-2xl overflow-hidden flex flex-col border border-border/20
              focus:outline-none
            `}
            style={{ borderRadius: 'var(--radius-modal)' }}
            tabIndex={-1}
          >

            {/* Header */}
            <div className="p-4 border-b border-border flex justify-between items-center shrink-0 bg-surface z-10 sticky top-0">
              <div>
                {title && (
                  <h2 className="text-lg font-bold text-text-main leading-tight">
                    <AnimatedText text={title} />
                  </h2>
                )}
                {description && <p className="text-sm text-text-muted mt-0.5">{description}</p>}
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-surface-highlight text-text-muted hover:text-text-main rounded-xl transition-colors"
              >
                <DynamicIcon name="x" size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar bg-canvas/30">
              {children}
            </div>

            {/* Actions Footer */}
            {actions && (
              <div className="p-4 border-t border-border bg-surface shrink-0 z-10">
                {actions}
              </div>
            )}

            {/* Mobile Safe Area Spacer (if no actions) */}
            {!actions && <div className="h-safe md:hidden bg-surface" />}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
