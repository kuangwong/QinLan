import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };
const paths = {
  ArrowDownWideNarrow: ['M3 4v16m-3-3 3 3 3-3', 'M10 5h11M10 10h8M10 15h5M10 20h2'],
  ArrowRight: ['M5 12h14m-6-6 6 6-6 6'],
  Bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9', 'M10 21h4'],
  BookOpen: ['M12 7C9 4 5 4 2 5v15c4-2 7-1 10 1 3-2 6-3 10-1V5c-3-1-7-1-10 2ZM12 7v14'],
  CalendarDays: ['M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM7 2v4m10-4v4M3 10h18', 'M7 14h.01M12 14h.01M17 14h.01M7 18h.01M12 18h.01M17 18h.01'],
  Check: ['m5 12 4 4L19 6'],
  CheckCheck: ['m2 12 4 4L16 6m-4 10 10-10'],
  ChevronDown: ['m6 9 6 6 6-6'],
  ChevronLeft: ['m15 18-6-6 6-6'],
  ChevronRight: ['m9 18 6-6-6-6'],
  CircleCheck: ['M22 11.1V12a10 10 0 1 1-5.9-9.1', 'm22 4-10 10-3-3'],
  Clock3: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM12 6v6h4'],
  Copy: ['M9 9h11v12H9ZM15 9V3H3v12h6'],
  Download: ['M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5'],
  Ellipsis: ['M5 12h.01M12 12h.01M19 12h.01'],
  Flower2: ['M12 8c-8-9-13 4-5 5-8 6 4 13 6 5 7 8 13-5 5-6 8-7-5-13-6-4Z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'],
  Heart: ['M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z'],
  HelpCircle: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z', 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3m.1 4h.01'],
  Leaf: ['M20 3c-6-1-15 1-15 9a7 7 0 0 0 7 7c8 0 10-9 8-16Z', 'M3 21 15 9m-7 7h5m-2-3V9'],
  Link: ['m10 13 4-4', 'M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 12a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1'],
  ListTodo: ['m3 6 1 1 2-2M10 6h11M3 12h3m4 0h11M3 18h3m4 0h11'],
  LogOut: ['M9 21H4V3h5m6 5 5 4-5 4m-6-4h11'],
  Menu: ['M4 6h16M4 12h16M4 18h16'],
  Plus: ['M12 5v14M5 12h14'],
  Search: ['M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-2 6 6 6'],
  Settings2: ['M3 6h4m4 0h10M3 12h10m4 0h4M3 18h4m4 0h10', 'M11 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM17 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM11 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z'],
  Share2: ['M8 11 16 6M8 13l8 5', 'M8 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM22 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM22 19a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'],
  Shuffle: ['M3 4h3l12 16h3m-4-4 4 4-4 3M3 20h3l4-5m4-6 4-5h3m-4-3 4 3-4 4'],
  Sparkles: ['m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM3 3v4M1 5h4m15-3v4m-2-2h4'],
  Sprout: ['M12 22v-9M12 17C5 17 2 13 2 8c6-1 10 3 10 9ZM12 13c0-7 3-10 10-10 0 7-3 10-10 10Z'],
  Trash2: ['M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7'],
  UserPlus: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM20 7v6m-3-3h6'],
  Users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM17 3a4 4 0 0 1 0 8m5 10v-2a4 4 0 0 0-3-3.9'],
  WandSparkles: ['m4 20 13-13 3 3L7 23l-3-3Zm10-10 3 3M5 2v4M3 4h4m13-3v4m-2-2h4M4 11v4m-2-2h4'],
  X: ['m6 6 12 12M6 18 18 6'],
};
function icon(name: keyof typeof paths) {
  return function Icon({ size = 24, strokeWidth = 1.7, ...props }: IconProps) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name].map((d, i) => <path key={i} d={d} />)}</svg>;
  };
}
export const ArrowDownWideNarrow = icon('ArrowDownWideNarrow');
export const ArrowRight = icon('ArrowRight');
export const Bell = icon('Bell');
export const BookOpen = icon('BookOpen');
export const CalendarDays = icon('CalendarDays');
export const Check = icon('Check');
export const CheckCheck = icon('CheckCheck');
export const ChevronDown = icon('ChevronDown');
export const ChevronLeft = icon('ChevronLeft');
export const ChevronRight = icon('ChevronRight');
export const CircleCheck = icon('CircleCheck');
export const Clock3 = icon('Clock3');
export const Copy = icon('Copy');
export const Download = icon('Download');
export const Ellipsis = icon('Ellipsis');
export const Flower2 = icon('Flower2');
export const Heart = icon('Heart');
export const HelpCircle = icon('HelpCircle');
export const Leaf = icon('Leaf');
export const Link = icon('Link');
export const ListTodo = icon('ListTodo');
export const LogOut = icon('LogOut');
export const Menu = icon('Menu');
export const Plus = icon('Plus');
export const Search = icon('Search');
export const Settings2 = icon('Settings2');
export const Share2 = icon('Share2');
export const Shuffle = icon('Shuffle');
export const Sparkles = icon('Sparkles');
export const Sprout = icon('Sprout');
export const Trash2 = icon('Trash2');
export const UserPlus = icon('UserPlus');
export const Users = icon('Users');
export const WandSparkles = icon('WandSparkles');
export const X = icon('X');
