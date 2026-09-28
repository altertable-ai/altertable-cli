import { createElement, type CSSProperties } from "react";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpenText,
  Check,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Copy,
  FileCode2,
  Info,
  LoaderCircle,
  Minus,
  Moon,
  PanelRightOpen,
  Presentation,
  Radio,
  RotateCw,
  Search,
  Sun,
  TextWrap,
  X,
  type LucideProps,
} from "lucide-react";

/** Semantic icon names keep a single meaning and optical size across an app. */
const brandedIcons = {
  cancel: X,
  calendar: CalendarDays,
  clock: Clock3,
  check: Check,
  disclosure: ChevronDown,
  previousMonth: ChevronLeft,
  nextMonth: ChevronRight,
  explore: BookOpenText,
  inspect: PanelRightOpen,
  info: Info,
  openDetails: ChevronRight,
  present: Presentation,
  error: CircleAlert,
  close: X,
  previous: ArrowLeft,
  next: ArrowRight,
  lightTheme: Sun,
  darkTheme: Moon,
  live: Radio,
  loading: LoaderCircle,
  refresh: RotateCw,
  reset: X,
  search: Search,
  copy: Copy,
  sql: FileCode2,
  wrap: TextWrap,
  trendDown: ArrowDownRight,
  trendFlat: Minus,
  trendUp: ArrowUpRight,
} as const;

export type AppIconName = keyof typeof brandedIcons;
export type AppIconProps = Omit<LucideProps, "size"> & { name: AppIconName; size?: number };

export function AppIcon({ name, size = 18, strokeWidth = 1.8, style, ...props }: AppIconProps) {
  const Icon = brandedIcons[name];
  const fixedSize: CSSProperties = {
    ...style,
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    maxWidth: size,
    maxHeight: size,
    flexShrink: 0,
  };
  return createElement(Icon, {
    "aria-hidden": true,
    focusable: "false",
    ...props,
    size,
    strokeWidth,
    style: fixedSize,
  });
}
