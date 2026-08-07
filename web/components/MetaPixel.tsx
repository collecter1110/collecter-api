import { META_PIXEL_ID } from "@/lib/fbq";
import MetaPageView from "@/components/MetaPageView";

// Meta 기본 코드 — 안내받은 스니펫 그대로다.
//
// next/script를 쓰지 않는 이유: beforeInteractive는 스니펫을 script 태그가 아니라
// self.__next_s 큐에 데이터로 넣고 Next 부트스트랩이 대신 실행한다. 아래처럼
// 평범한 인라인 script로 두면 <body> 최상단에서 HTML 파싱 중 바로 실행돼
// Meta 안내(헤드에 붙여넣기)와 같은 타이밍이 나오고, 소스 보기에도 그대로 보인다.
export default function MetaPixel() {
  if (!META_PIXEL_ID) return null;

  return (
    <>
      <script
        id="meta-pixel"
        dangerouslySetInnerHTML={{
          __html: `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');`,
        }}
      />

      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          alt=""
          src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
        />
      </noscript>

      <MetaPageView />
    </>
  );
}
