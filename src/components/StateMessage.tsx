interface StateMessageProps {
  title: string;
  message: string;
  compact?: boolean;
}

export function StateMessage({ title, message, compact = false }: StateMessageProps) {
  return (
    <div className={`panel flex items-center justify-center text-center ${compact ? 'min-h-32' : 'min-h-72'}`}>
      <div>
        <h3 className="card-title">{title}</h3>
        <p className="supporting-text mt-2 max-w-xl">{message}</p>
      </div>
    </div>
  );
}
