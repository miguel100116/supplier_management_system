import React, { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';

// Admin descriptions share the title row. Other views keep their copy in place.
export const PageDescriptionTarget = createContext<HTMLElement | null>(null);

interface PageDescriptionProps {
  children: string;
}

export function PageDescription({ children }: PageDescriptionProps) {
  const target = useContext(PageDescriptionTarget);
  const description = <p className="text-sm font-medium leading-6 text-slate-600 dark:text-slate-300">{children}</p>;
  return target ? createPortal(description, target) : description;
}
