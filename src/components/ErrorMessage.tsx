export function ErrorMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="error-message">{message}</div>;
}
