import { ChevronDown, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/cn';

export interface DropdownMenuItem {
  key: string;
  label: string;
  icon?: LucideIcon;
  to?: string;
  onSelect?: () => void;
  danger?: boolean;
}

interface DropdownMenuProps {
  label: string;
  trigger: ReactNode;
  items: DropdownMenuItem[];
  align?: 'left' | 'right';
  triggerClassName: string;
  menuClassName?: string;
  header?: ReactNode;
  footer?: ReactNode;
}

export function DropdownMenu({
  label,
  trigger,
  items,
  align = 'left',
  triggerClassName,
  menuClassName,
  header,
  footer,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | HTMLButtonElement | null>>([]);
  const location = useLocation();
  const menuId = useId();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const focusItem = (index: number) => {
    if (items.length === 0) return;
    const wrapped = (index + items.length) % items.length;
    itemRefs.current[wrapped]?.focus();
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = itemRefs.current.findIndex((item) => item === document.activeElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusItem(current < 0 ? 0 : current + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusItem(current < 0 ? items.length - 1 : current - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusItem(items.length - 1);
    }
  };

  const itemClass = (danger?: boolean) =>
    cn(
      'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors',
      danger
        ? 'text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-700/15'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    );

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(event) => {
        if (!containerRef.current?.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={label}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen(true);
            window.requestAnimationFrame(() => focusItem(0));
          }
        }}
      >
        {trigger}
        <ChevronDown
          className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={cn(
            'absolute top-full z-50 mt-2 min-w-56 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl',
            align === 'right' ? 'right-0' : 'left-0',
            menuClassName,
          )}
          onKeyDown={onMenuKeyDown}
        >
          {header ? <div className="border-b border-border px-3 py-2.5">{header}</div> : null}
          {items.map((item, index) => {
            const Icon = item.icon;
            if (item.to) {
              return (
                <NavLink
                  key={item.key}
                  ref={(node) => {
                    itemRefs.current[index] = node;
                  }}
                  to={item.to}
                  role="menuitem"
                  tabIndex={-1}
                  className={({ isActive }) =>
                    cn(
                      itemClass(item.danger),
                      isActive &&
                        'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-200',
                    )
                  }
                  onClick={() => setOpen(false)}
                >
                  {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
                  {item.label}
                </NavLink>
              );
            }
            return (
              <button
                key={item.key}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={itemClass(item.danger)}
                onClick={() => {
                  setOpen(false);
                  item.onSelect?.();
                }}
              >
                {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
                {item.label}
              </button>
            );
          })}
          {footer ? (
            <div role="group" className="border-t border-border px-3 py-2.5">
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
