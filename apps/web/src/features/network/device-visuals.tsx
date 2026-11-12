import {
  Camera,
  Cloud,
  Cpu,
  HardDrive,
  HelpCircle,
  Laptop,
  Monitor,
  Network,
  Phone,
  Printer,
  Router,
  Server,
  Shield,
  Wifi,
  type LucideIcon,
} from 'lucide-react';
import type { DeviceType } from '@nis2/shared';
import { cn } from '@/lib/cn';

const ICONS: Record<DeviceType, LucideIcon> = {
  ROUTER: Router,
  SWITCH: Network,
  FIREWALL: Shield,
  SERVER: Server,
  WORKSTATION: Monitor,
  LAPTOP: Laptop,
  PRINTER: Printer,
  IP_CAMERA: Camera,
  NVR: HardDrive,
  NAS: HardDrive,
  ACCESS_POINT: Wifi,
  PHONE: Phone,
  IOT: Cpu,
  CLOUD_SERVICE: Cloud,
  UNKNOWN: HelpCircle,
};

export function DeviceTypeIcon({ type, className }: { type: DeviceType; className?: string }) {
  const Icon = ICONS[type] ?? HelpCircle;
  return <Icon className={cn('h-5 w-5', className)} aria-hidden="true" />;
}
