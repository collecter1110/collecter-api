import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
  getPublicCollection,
  getPublicSelections,
} from "@/lib/api";
import { formatDate } from "@/lib/format";
import OpenInApp from "@/components/OpenInApp";
import MetaViewContent from "@/components/MetaViewContent";
import BackButton from "@/components/BackButton";

type Params = { params: Promise<{ id: string }> };

function parseId(idParam: string): number | null {
  const n = parseInt(idParam, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const collectionId = parseId(id);
  if (collectionId === null) return {};

  const collection = await getPublicCollection(collectionId);
  if (!collection) return {};

  const description = collection.description ?? "Collecter에서 공유된 컬렉션";
  const images = collection.image_url ? [collection.image_url] : [];

  return {
    title: `${collection.collection_title} · Collecter`,
    description,
    openGraph: {
      title: collection.collection_title,
      description,
      images,
      type: "website",
      url: `https://share.collecter.kr/c/${collectionId}`,
    },
    twitter: {
      card: "summary_large_image",
      title: collection.collection_title,
      description,
      images,
    },
  };
}

export default async function CollectionPage({ params }: Params) {
  const { id } = await params;
  const collectionId = parseId(id);
  if (collectionId === null) notFound();

  const [collection, selections] = await Promise.all([
    getPublicCollection(collectionId),
    getPublicSelections(collectionId),
  ]);

  if (!collection) notFound();

  const tags = Array.isArray(collection.tags) ? collection.tags : [];
  const keywords = Array.isArray(collection.primary_keywords)
    ? collection.primary_keywords
    : [];

  // 헤더 메타 줄: 있는 항목만 골라 " | " 로 잇는다.
  const metaItems = [
    collection.category_name && (
      <span key="category" className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-brand" />
        {collection.category_name}
      </span>
    ),
    <span key="date">{formatDate(collection.created_at)}</span>,
    // 공개 컬렉션만 이 페이지로 내려오므로 항상 전체 공개다.
    <span key="visibility" className="flex items-center gap-1">
      <GlobeIcon />
      전체 공개
    </span>,
  ].filter(Boolean);

  return (
    <main className="min-h-screen pb-32">
      <MetaViewContent
        contentType="product_group"
        contentId={`collection-${collectionId}`}
        contentName={collection.collection_title}
        contentCategory={String(collection.category_id)}
      />

      <header className="relative aspect-square w-full bg-neutral-200 text-white">
        {collection.image_url && (
          <Image
            src={collection.image_url}
            alt={collection.collection_title}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        )}

        {/*
          밝은 배경 이미지에서도 흰 글자가 읽히도록 하단에 짙은 스크림을 깐다.
          위쪽은 뒤로가기 아이콘용으로만 살짝 어둡게.
        */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/95 via-black/60 to-transparent" />

        {/* 공유하기·더보기는 웹에 대응 기능이 없어 넣지 않는다. */}
        <BackButton />

        <div className="absolute inset-x-0 bottom-0 flex items-end gap-4 px-5 pb-7">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-white/90">
              {metaItems.map((item, i) => (
                <span key={i} className="flex items-center gap-x-2">
                  {i > 0 && <span className="text-white/40">|</span>}
                  {item}
                </span>
              ))}
            </div>

            <h1 className="mt-3 break-keep text-[26px] font-bold leading-snug drop-shadow-[0_1px_4px_rgba(0,0,0,0.4)]">
              {collection.collection_title}
            </h1>

            <div className="mt-4 flex items-center gap-2.5">
              {/* 프로필 이미지가 없는 계정이 많아 이니셜로 폴백한다. */}
              <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/25 text-[13px] font-semibold uppercase">
                {collection.owner_image_url ? (
                  <Image
                    src={collection.owner_image_url}
                    alt=""
                    fill
                    sizes="32px"
                    className="object-cover"
                  />
                ) : (
                  collection.owner_name.slice(0, 1)
                )}
              </span>
              <span className="truncate text-[15px] font-medium">
                {collection.owner_name}
              </span>
            </div>
          </div>

          {/* 좋아요는 웹에서 누를 수 없다 — 개수 표시 전용 */}
          <div
            className="flex h-[52px] w-[52px] shrink-0 flex-col items-center justify-center rounded-full bg-black/35 backdrop-blur-sm"
            aria-label={`좋아요 ${collection.like_num}개`}
          >
            <HeartIcon />
            <span className="mt-1 text-[11px] font-medium leading-none">
              {collection.like_num}
            </span>
          </div>
        </div>
      </header>

      <div className="px-5 pt-6">
        {collection.description && (
          <p className="whitespace-pre-wrap break-keep text-[15px] leading-relaxed text-neutral-800">
            {collection.description}
          </p>
        )}

        {/* 태그는 디스크립션(15px)보다 한 단계 작게 */}
        {tags.length > 0 && (
          <p className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-neutral-400">
            {tags.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </p>
        )}

        {/* 키워드 칩 — 글자는 검정, 크기는 태그와 같은 13px */}
        {keywords.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
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
      </div>

      <section className="px-5">
        <div className="mb-3 mt-8 flex items-center gap-2">
          <span className="h-[14px] w-[3px] rounded-full bg-brand" />
          <h2 className="text-[15px] font-bold tracking-tight">SELECTION</h2>
          <span className="text-[13px] text-neutral-400">
            {selections.length}
          </span>
        </div>

        {selections.length === 0 ? (
          <p className="py-12 text-center text-sm text-neutral-400">
            아직 셀렉션이 없어요.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3">
            {selections.map((s) => {
              const chips = Array.isArray(s.keywords) ? s.keywords : [];

              return (
                <li key={s.id}>
                  <Link
                    href={`/c/${collectionId}/s/${s.id}`}
                    className="group relative block aspect-[3/4] overflow-hidden rounded-[10px] bg-neutral-100"
                  >
                    {s.image_url && (
                      <Image
                        src={s.image_url}
                        alt={s.selection_title}
                        fill
                        sizes="(max-width: 640px) 50vw, 25vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />

                    <div className="absolute inset-x-0 bottom-0 p-3">
                      <p className="line-clamp-2 break-keep text-[15px] font-semibold text-white">
                        {s.selection_title}
                      </p>
                      {/* 유리질 칩 — 반투명 흰 면 + 블러, 테두리는 한 겹만 */}
                      {chips.length > 0 && (
                        <ul className="mt-1.5 flex flex-wrap gap-1">
                          {chips.slice(0, 2).map((k) => (
                            <li
                              key={k.keyword_id}
                              className="rounded-full border border-white/30 bg-white/15 px-2 py-[3px] text-[10px] font-medium text-white backdrop-blur-md"
                            >
                              {k.keyword_name}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <OpenInApp
        schemeUrl={`${process.env.NEXT_PUBLIC_APP_SCHEME ?? "collecterapp"}://c/${collectionId}`}
        source="collection"
        contentType="product_group"
        contentId={`collection-${collectionId}`}
      />
    </main>
  );
}

function GlobeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className="h-[13px] w-[13px]"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-[19px] w-[19px]"
      aria-hidden
    >
      <path d="M12 21s-7.5-4.7-9.3-9A5.4 5.4 0 0 1 12 6.6a5.4 5.4 0 0 1 9.3 5.4C19.5 16.3 12 21 12 21Z" />
    </svg>
  );
}
