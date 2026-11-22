import { Html, Head, Main, NextScript } from "next/document";

const TITLE = "地铁冲冲冲！开合肥地铁小游戏";
const DESC = "开合肥地铁 1–7 号线：加速、刹车、精准停车接乘客，看谁的车上人最多！6–14 岁小朋友都能玩。";

export default function Document() {
  return (
    <Html lang="zh-CN">
      <Head>
        <meta name="description" content={DESC} />
        <meta name="keywords" content="合肥地铁,地铁游戏,开地铁,儿童游戏,小游戏,地铁冲冲冲" />
        <meta name="theme-color" content="#1e6fd9" />
        {/* 添加到手机主屏幕后像 App 一样全屏打开 */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="地铁冲冲冲" />
        {/* 分享链接时的标题、简介和预览图 */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESC} />
        <meta property="og:image" content="/share.png" />
        <meta itemProp="name" content={TITLE} />
        <meta itemProp="description" content={DESC} />
        <meta itemProp="image" content="/share.png" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
