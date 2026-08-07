import { notFound } from "next/navigation";
import Image from "next/image";
import type { Metadata } from "next";
import { getPublicSelectionDetail } from "@/lib/api";
import { formatDate } from "@/lib/format";
import ImageCarousel from "@/components/ImageCarousel";
import OpenInApp from "@/components/OpenInApp";
import MetaViewContent from "@/components/MetaViewContent";
import BackButton from "@/components/BackButton";
import ParentHistoryEntry from "@/components/ParentHistoryEntry";

type Params = { params: Promise<{ id: string; sid: string }> };

function parseId(idParam: string): number | null {
  const n = parseInt(idParam, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id, sid } = await params;
  const collectionId = parseId(id);
  const selectionId = parseId(sid);
  if (collectionId === null || selectionId === null) return {};

  const selection = await getPublicSelectionDetail(collectionId, selectionId);
  if (!selection) return {};

  const description = selection.description ?? "Collecter에서 공유된 셀렉션";
  const firstImage = selection.selection_images[0]?.image_url;
  const images = firstImage ? [firstImage] : [];

  return {
    title: `${selection.selection_title} · Collecter`,
    description,
    openGraph: {
      title: selection.selection_title,
      description,
      images,
      type: "website",
      url: `https://share.collecter.kr/c/${collectionId}/s/${selectionId}`,
    },
    twitter: {
      card: "summary_large_image",
      title: selection.selection_title,
      description,
      images,
    },
  };
}

type Item = { text: string; order: number };

/** items 는 [{ item_order, item_title }] 형태지만 과거 데이터가 섞여 있어 방어적으로 읽는다. */
function parseItems(items: unknown): Item[] {
  if (!Array.isArray(items)) return [];

  return items
    .map((raw, idx): Item => {
      if (typeof raw === "string") return { text: raw, order: idx };

      if (raw && typeof raw === "object") {
        const obj = raw as Record<string, unknown>;
        const text =
          typeof obj.item_title === "string"
            ? obj.item_title
            : typeof obj.text === "string"
              ? obj.text
              : "";
        const order =
          typeof obj.item_order === "number" ? obj.item_order : idx;
        return { text, order };
      }

      return { text: "", order: idx };
    })
    .filter((item) => item.text.trim().length > 0)
    .sort((a, b) => a.order - b.order);
}

/** 순서가 의미를 가지면 ol, 아니면 ul 로 낸다. */
function ItemList({
  isOrdered,
  className,
  children,
}: {
  isOrdered: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return isOrdered ? (
    <ol className={className}>{children}</ol>
  ) : (
    <ul className={className}>{children}</ul>
  );
}

export default async function SelectionDetailPage({ params }: Params) {
  const { id, sid } = await params;
  const collectionId = parseId(id);
  const selectionId = parseId(sid);
  if (collectionId === null || selectionId === null) notFound();

  const selection = await getPublicSelectionDetail(collectionId, selectionId);
  if (!selection) notFound();

  const keywords = Array.isArray(selection.keywords) ? selection.keywords : [];
  const items = parseItems(selection.items);
  const scheme = process.env.NEXT_PUBLIC_APP_SCHEME ?? "collecterapp";

  return (
    <main className="flex min-h-screen flex-col">
      <MetaViewContent
        contentType="product"
        contentId={`selection-${selectionId}`}
        contentName={selection.selection_title}
        contentCategory={String(selection.category_id)}
      />

      {/* 브라우저 뒤로가기도 컬렉션으로 가도록 이전 항목을 심는다 */}
      <ParentHistoryEntry href={`/c/${collectionId}`} />

      <div className="relative">
        {selection.selection_images.length > 0 ? (
          <ImageCarousel
            images={selection.selection_images}
            alt={selection.selection_title}
          />
        ) : (
          <div className="aspect-square w-full bg-neutral-200" />
        )}

        {/* 뒤로가기 아이콘이 밝은 사진 위에서도 보이도록 상단만 살짝 어둡게 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/35 to-transparent" />

        {/*
          여기선 돌아갈 곳이 확실하므로 히스토리가 없어도 부모 컬렉션으로 폴백한다.
          더보기는 웹에 대응 기능이 없어 넣지 않는다.
        */}
        <BackButton fallbackHref={`/c/${collectionId}`} />
      </div>

      <section className="px-5 pt-6">
        {selection.category_name && (
          <div className="flex items-center gap-1.5 text-[13px] text-neutral-700">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            {selection.category_name}
          </div>
        )}

        <h1 className="mt-2.5 break-keep text-[26px] font-bold leading-snug">
          {selection.selection_title}
        </h1>

        <div className="mt-4 flex items-center gap-2.5">
          {/* 프로필 이미지가 없는 계정이 많아 이니셜로 폴백한다. */}
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-200 text-[13px] font-semibold uppercase text-neutral-500">
            {selection.owner_image_url ? (
              <Image
                src={selection.owner_image_url}
                alt=""
                fill
                sizes="32px"
                className="object-cover"
              />
            ) : (
              selection.owner_name.slice(0, 1)
            )}
          </span>
          <span className="truncate text-[15px] font-medium">
            {selection.owner_name}
          </span>
          <span className="text-neutral-300">·</span>
          <span className="shrink-0 text-[12px] text-neutral-400">
            {formatDate(selection.created_at)}
          </span>
        </div>

        <hr className="mt-5 border-neutral-200" />

        {selection.description && (
          <p className="mt-5 whitespace-pre-wrap break-keep text-[15px] leading-relaxed text-neutral-800">
            {selection.description}
          </p>
        )}

        {/* 컬렉션 페이지와 같은 민트 칩 */}
        {keywords.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-2">
            {keywords.map((k) => (
              <li
                key={k.keyword_id}
                className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-[3px] text-[11px] text-neutral-900"
              >
                {k.keyword_name}
              </li>
            ))}
          </ul>
        )}

        {selection.link && (
          <a
            href={selection.link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-block break-all text-[13px] text-neutral-500 underline underline-offset-2"
          >
            {selection.link}
          </a>
        )}

        <div className="h-8" />
      </section>

      {items.length > 0 ? (
        <section className="flex-1 bg-neutral-100 px-5 pb-32 pt-7">
          {/* 순서가 있는 셀렉션은 ORDER, 그렇지 않으면 LIST */}
          <div className="mb-3 flex items-center gap-2">
            <span className="h-[14px] w-[3px] rounded-full bg-brand" />
            <h2 className="text-[15px] font-bold tracking-tight">
              {selection.is_ordered ? "ORDER" : "LIST"}
            </h2>
            <span className="text-[13px] text-neutral-400">{items.length}</span>
          </div>

          <ItemList isOrdered={selection.is_ordered} className="space-y-3">
            {items.map((item, idx) => (
              <li key={idx} className="flex items-center gap-3">
                {/* 번호는 카드 바깥 왼쪽에 세로 중앙 정렬 */}
                {selection.is_ordered && (
                  <span className="w-4 shrink-0 text-center text-[15px] font-bold text-neutral-800">
                    {idx + 1}
                  </span>
                )}
                <div className="flex-1 whitespace-pre-wrap break-keep rounded-xl bg-white px-4 py-5 text-[15px] leading-relaxed text-neutral-800 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  {item.text}
                </div>
              </li>
            ))}
          </ItemList>
        </section>
      ) : (
        // 아이템이 없어도 아래는 회색으로 채운다 — 흰 화면으로 끝나지 않게.
        <div className="min-h-40 flex-1 bg-neutral-100" />
      )}

      <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-white via-white to-white/0 p-4">
        <OpenInApp
          schemeUrl={`${scheme}://c/${collectionId}/s/${selectionId}`}
          source="selection"
          contentType="product"
          contentId={`selection-${selectionId}`}
        />
      </div>
    </main>
  );
}
