import StoreLink from "@/components/StoreLink";

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold mb-2">Collecter</h1>
      <p className="text-gray-500 mb-8">관심사를 모으고, 공유하세요.</p>
      <StoreLink className="px-5 py-3 rounded-lg bg-black text-white text-sm">
        App Store에서 받기
      </StoreLink>
    </main>
  );
}
