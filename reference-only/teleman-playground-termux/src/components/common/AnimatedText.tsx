import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface AnimatedTextProps {
    text: string;
    className?: string;
    once?: boolean;
}

const GLITCH_CHARS = '!@#$%^&*()_+{}:"<>?-=[];,./0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function AnimatedText({ text, className = "", once = true }: AnimatedTextProps) {
    const [displayText, setDisplayText] = useState(text);
    const [config, setConfig] = useState({
        enabled: localStorage.getItem('textEffectEnabled') !== 'false',
        type: localStorage.getItem('textEffectType') || 'glitch'
    });

    useEffect(() => {
        const handleSettingsChange = (e: any) => {
            if (e.detail.textEffectEnabled !== undefined || e.detail.textEffectType !== undefined) {
                setConfig(prev => ({
                    enabled: e.detail.textEffectEnabled ?? prev.enabled,
                    type: e.detail.textEffectType ?? prev.type
                }));
            }
        };
        window.addEventListener('settingsChanged', handleSettingsChange as EventListener);
        return () => window.removeEventListener('settingsChanged', handleSettingsChange as EventListener);
    }, []);

    const hasAnimated = useRef(false);
    const prevText = useRef(text);

    // Glitch Reveal Logic
    useEffect(() => {
        // Prevent re-animation if text is identical to previous poll
        if (hasAnimated.current && prevText.current === text) {
            return;
        }
        prevText.current = text;

        if (!config.enabled || config.type !== 'glitch' || (once && hasAnimated.current)) {
            setDisplayText(text);
            return;
        }

        let iteration = 0;
        let interval: any = null;

        interval = setInterval(() => {
            setDisplayText(
                text.split("").map((_, index) => {
                    if (index < iteration) return text[index];
                    return GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
                }).join("")
            );

            if (iteration >= text.length) {
                clearInterval(interval);
                hasAnimated.current = true;
            }
            iteration += 1 / 3;
        }, 30);

        return () => clearInterval(interval);
    }, [text, config, once]);

    if (!config.enabled) return <span className={className}>{text}</span>;

    // Typewriter
    if (config.type === 'typewriter') {
        const sentence = {
            hidden: { opacity: 1 },
            visible: {
                opacity: 1,
                transition: {
                    delay: 0.2,
                    staggerChildren: 0.05,
                },
            },
        };
        const letter = {
            hidden: { opacity: 0, display: 'none' },
            visible: { opacity: 1, display: 'inline' },
        };

        return (
            <motion.span
                className={className}
                variants={sentence}
                initial="hidden"
                whileInView="visible"
                viewport={{ once }}
            >
                {text.split("").map((char, index) => (
                    <motion.span key={char + "-" + index} variants={letter}>
                        {char}
                    </motion.span>
                ))}
            </motion.span>
        );
    }

    // Gaussian Blur
    if (config.type === 'blur') {
        return (
            <motion.span
                className={className}
                initial={{ opacity: 0, filter: 'blur(10px)', y: 5 }}
                whileInView={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
                viewport={{ once }}
                transition={{ duration: 0.8, ease: "easeOut" }}
            >
                {text}
            </motion.span>
        );
    }

    // Staggered Fade
    if (config.type === 'fade') {
        return (
            <motion.span
                className={className}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once }}
                transition={{ duration: 1, ease: "easeInOut" }}
            >
                {text}
            </motion.span>
        );
    }

    // Default / Glitch (Uses the state-driven string reveal)
    return <span className={className}>{displayText}</span>;
}
