export default function SectionHeading({
  eyebrow,
  title,
  desc,
}: {
  eyebrow: string;
  title: string;
  desc?: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-widest text-[#6366f1]">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
      {desc ? <p className="mt-3 text-base text-[var(--muted-fg)]">{desc}</p> : null}
    </div>
  );
}
