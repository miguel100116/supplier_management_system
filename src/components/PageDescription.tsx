interface PageDescriptionProps {
  children: string;
}

export function PageDescription({ children }: PageDescriptionProps) {
  return (
    <p className="page-description">{children}</p>
  );
}
