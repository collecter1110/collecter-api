export default function Loading() {
  return (
    <main className="min-h-screen animate-pulse pb-32">
      {/* 1:1 히어로 — 실제 화면과 같이 하단에 메타/제목/작성자/좋아요가 얹힌다 */}
      <div className="relative aspect-square w-full bg-neutral-200">
        <div className="absolute inset-x-0 bottom-0 flex items-end gap-4 px-5 pb-7">
          <div className="min-w-0 flex-1">
            <div className="h-3.5 w-40 rounded bg-neutral-300" />
            <div className="mt-3 h-7 w-2/3 rounded bg-neutral-300" />
            <div className="mt-4 flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-neutral-300" />
              <div className="h-4 w-24 rounded bg-neutral-300" />
            </div>
          </div>
          <div className="h-[52px] w-[52px] shrink-0 rounded-full bg-neutral-300" />
        </div>
      </div>

      <div className="px-5 pt-6">
        <div className="h-4 w-full rounded bg-neutral-100" />
        <div className="mt-2 h-4 w-4/5 rounded bg-neutral-100" />
        <div className="mt-4 h-3.5 w-32 rounded bg-neutral-100" />
        <div className="mt-4 flex gap-2">
          <div className="h-6 w-14 rounded-full bg-neutral-100" />
          <div className="h-6 w-11 rounded-full bg-neutral-100" />
          <div className="h-6 w-16 rounded-full bg-neutral-100" />
        </div>
      </div>

      <section className="px-5">
        <div className="mb-3 mt-8 flex items-center gap-2">
          <div className="h-[14px] w-[3px] rounded-full bg-neutral-200" />
          <div className="h-4 w-24 rounded bg-neutral-100" />
        </div>

        <ul className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <li
              key={i}
              className="aspect-[3/4] rounded-[10px] bg-neutral-100"
            />
          ))}
        </ul>
      </section>
    </main>
  );
}
