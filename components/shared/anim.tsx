'use client';

import { motion, type Variants } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';

export const EASE = [0.22, 1, 0.36, 1] as const;

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15, ease: 'easeIn' } },
};

export const staggerContainer: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.05, delayChildren: 0.06 } },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.32, ease: EASE } },
};

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.3, ease: EASE } },
  exit: { opacity: 0, transition: { duration: 0.15, ease: 'easeIn' } },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.94, y: 10 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 340, damping: 28 } },
  exit: { opacity: 0, scale: 0.96, y: 6, transition: { duration: 0.16, ease: 'easeIn' } },
};

export const CARD_HOVER = { y: -3 } as const;
export const CARD_TAP = { scale: 0.99 } as const;
export const CARD_TRANSITION = { type: 'spring', stiffness: 360, damping: 26 } as const;

interface MotionPageProps extends HTMLMotionProps<'div'> {
  children: ReactNode;
}

export function MotionPage({ children, ...rest }: MotionPageProps) {
  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" {...rest}>
      {children}
    </motion.div>
  );
}

interface StaggerGroupProps extends HTMLMotionProps<'div'> {
  children: ReactNode;
}

export function StaggerGroup({ children, ...rest }: StaggerGroupProps) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, ...rest }: MotionPageProps) {
  return (
    <motion.div variants={staggerItem} {...rest}>
      {children}
    </motion.div>
  );
}