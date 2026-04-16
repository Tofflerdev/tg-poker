/**
 * Neon Strip UI primitives — barrel re-export.
 *
 * Phase 2 / Plan 02-01 (D-06, discretionary layout choice).
 * Downstream plans (02-04..02-08) import from here:
 *   import { Button, Card, Tab, TabBar, Badge, type ActionTier } from '../components/ui';
 */

export { Button, type ButtonProps } from './Button';
export { Card, type CardProps } from './Card';
export { Tab, TabBar, type TabProps, type TabBarProps } from './Tab';
export { Badge, type BadgeProps } from './Badge';
export { VARIANT_TIER, type ActionTier } from './tokens';
