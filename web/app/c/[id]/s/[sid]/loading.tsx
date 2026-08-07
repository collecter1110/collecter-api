export default function Loading() {
  return (
    <main className="flex min-h-screen animate-pulse flex-col">
      <div className="aspect-square w-full bg-neutral-200" />

      <section className="px-5 pt-6">
        <div className="h-3.5 w-14 rounded bg-neutral-100" />
        <div className="mt-2.5 h-7 w-1/2 rounded bg-neutral-100" />

        <div className="mt-4 flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-neutral-100" />
          <div className="h-4 w-20 rounded bg-neutral-100" />
          <div className="h-3 w-20 rounded bg-neutral-100" />
        </div>

        <hr className="mt-5 border-neutral-200" />

        <div className="mt-5 space-y-2">
          <div className="h-4 w-full rounded bg-neutral-100" />
          <div className="h-4 w-full rounded bg-neutral-100" />
          <div className="h-4 w-3/5 rounded bg-neutral-100" />
        </div>

        <div className="mt-5 h-6 w-14 rounded-full bg-neutral-100" />

        <div className="h-8" />
      </section>

      {/* 아이템이 없는 셀렉션도 있어 회색 섹션은 실제 화면에선 빠질 수 있다 */}
      <section className="flex-1 bg-neutral-100 px-5 pb-32 pt-7">
        <div className="mb-3 flex items-center gap-2">
          <div className="h-[14px] w-[3px] rounded-full bg-neutral-200" />
          <div className="h-4 w-20 rounded bg-neutral-200" />
        </div>

        <ul className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <li key={i} className="h-24 rounded-xl bg-white" />
          ))}
        </ul>
      </section>
    </main>
  );
}
