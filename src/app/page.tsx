import { locales } from "@/locales";

export default function Home() {
  const { bn, en } = locales;
  return (
    <main>
      <h1>
        {bn.appName} <span aria-hidden="true">·</span> <span lang="en">{en.appName}</span>
      </h1>
      <p>{bn.demoBanner}</p>
      <p lang="en">{en.demoBanner}</p>
    </main>
  );
}
