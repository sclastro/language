export default function MessageBubble({
  role,
  content,
}: {
  role: "user" | "assistant";
  content: string;
}) {
  return (
    <div className={`row ${role}`}>
      <div className="bubble">{content}</div>
    </div>
  );
}
