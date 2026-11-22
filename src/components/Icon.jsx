// src/components/Icon.jsx
//
// TaxStory's icon set: one place that maps a meaning ("video", "warning") to a lucide-react icon, so the same idea
// always gets the same picture on every page, and icons look identical on Windows, Mac and phones (emoji did not).
//
//   <Icon name="video" />                       16px, inherits the text colour
//   <Icon name="warning" size={20} />
//   <IconLabel icon="video">Video walkthrough</IconLabel>   icon + text, aligned, for titles and labels
//
// Inside a .ts-btn just put <Icon/> before the label: the button already spaces and aligns it.
// To add an icon: import it from lucide-react and add a name below. Browse: https://lucide.dev/icons

import {
  ChartColumn, Scale, TrendingUp, Clapperboard, User, Users, MessageSquare, CreditCard, Settings, Bug, Eye, Lightbulb,
  NotebookPen, CircleCheck, FileText, Link2, TriangleAlert, Ticket, Image, ClipboardList, CalendarClock, Trash2, Lock,
  Building2, Rocket, FolderOpen, CloudUpload, House, UserRound, Briefcase, Zap, Pill, Building, PenLine, Mic, Share2,
  Mail, RefreshCw, Save, Flag, CircleX, Inbox, Phone, Globe, Bot, Wrench, ShieldCheck, Calculator, Palette, Target,
  Download, CircleHelp, LayoutGrid, Send, Repeat, Activity, Hand, Info, Star, Play, Hourglass,
} from 'lucide-react';

export const ICONS = {
  // product areas
  projections: ChartColumn, scenarios: Scale, planning: TrendingUp, video: Clapperboard, clients: Users, client: User,
  messages: MessageSquare, billing: CreditCard, settings: Settings, help: CircleHelp, dashboard: LayoutGrid,
  // things
  file: FileText, link: Link2, ticket: Ticket, image: Image, clipboard: ClipboardList, calendar: CalendarClock,
  building: Building2, folder: FolderOpen, upload: CloudUpload, download: Download, mic: Mic, mail: Mail, phone: Phone,
  globe: Globe, bot: Bot, calculator: Calculator, palette: Palette, target: Target, home: House, rental: Building,
  briefcase: Briefcase, senior: UserRound, health: Pill, note: NotebookPen, idea: Lightbulb, eye: Eye, bug: Bug,
  activity: Activity, wave: Hand, info: Info,
  // actions
  edit: PenLine, share: Share2, send: Send, refresh: RefreshCw, save: Save, delete: Trash2, launch: Rocket, convert: Repeat,
  // states
  success: CircleCheck, warning: TriangleAlert, error: CircleX, lock: Lock, shield: ShieldCheck, flag: Flag, zap: Zap,
  inbox: Inbox, tools: Wrench, star: Star, play: Play, hourglass: Hourglass,
};

export function Icon({ name, size = 16, strokeWidth = 2, className, style, title }) {
  const C = ICONS[name];
  if (!C) { if (import.meta.env?.DEV) console.warn(`[Icon] unknown icon "${name}"`); return null; }
  return <C size={size} strokeWidth={strokeWidth} className={className} style={style}
    aria-hidden={title ? undefined : true} aria-label={title} role={title ? 'img' : undefined} focusable="false" />;
}

export function IconLabel({ icon, size = 16, children, className = '', style }) {
  return (
    <span className={`ts-ico-label${className ? ` ${className}` : ''}`} style={style}>
      <Icon name={icon} size={size} />
      <span>{children}</span>
    </span>
  );
}
