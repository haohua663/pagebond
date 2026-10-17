"use client";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";

export type HoverCardItem = {
  title: string;
  description: string;
  link?: string;
  id?: string;
};

export const HoverEffect = ({
  items,
  className,
  onSelect,
}: {
  items: HoverCardItem[];
  className?: string;
  onSelect?: (item: HoverCardItem, index: number) => void;
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <div
      className={cn(
        "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 py-6",
        className,
      )}
    >
      {items.map((item, idx) => {
        const sharedClass =
          "relative group block p-2 h-full w-full text-left cursor-pointer";
        const body = (
          <>
            <AnimatePresence>
              {hoveredIndex === idx && (
                <motion.span
                  className="absolute inset-0 h-full w-full bg-sunk/80 block rounded-3xl"
                  layoutId="hoverBackground"
                  initial={{ opacity: 0 }}
                  animate={{
                    opacity: 1,
                    transition: { duration: 0.15 },
                  }}
                  exit={{
                    opacity: 0,
                    transition: { duration: 0.15, delay: 0.2 },
                  }}
                />
              )}
            </AnimatePresence>
            <Card>
              <CardTitle>{item.title}</CardTitle>
              <CardDescription>{item.description}</CardDescription>
            </Card>
          </>
        );
        if (onSelect) {
          return (
            <button
              type="button"
              key={item.id || item.title}
              data-testid={item.id ? `home-card-${item.id}` : undefined}
              className={sharedClass}
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
              onClick={() => onSelect(item, idx)}
            >
              {body}
            </button>
          );
        }
        return (
          <a
            href={item.link || "#"}
            key={item.link || item.title}
            className={sharedClass}
            onMouseEnter={() => setHoveredIndex(idx)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {body}
          </a>
        );
      })}
    </div>
  );
};

export const Card = ({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) => {
  return (
    <div
      className={cn(
        "rounded-2xl h-full w-full p-4 overflow-hidden bg-ink border border-white/10 group-hover:border-sky-400/80 relative z-20 transition-colors",
        className,
      )}
    >
      <div className="relative z-50">
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
};

export const CardTitle = ({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) => {
  return (
    <h4 className={cn("text-paper font-bold tracking-wide mt-2 text-xl", className)}>
      {children}
    </h4>
  );
};

export const CardDescription = ({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) => {
  return (
    <p
      className={cn(
        "mt-4 text-paper/70 tracking-wide leading-relaxed text-sm min-h-[3.5rem]",
        className,
      )}
    >
      {children}
    </p>
  );
};
