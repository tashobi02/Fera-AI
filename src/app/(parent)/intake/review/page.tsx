import type { Metadata } from "next";
import { getLocale } from "@/lib/locale-server";
import { locales } from "@/locales";
import { ReviewScreen } from "./review-screen";

export async function generateMetadata(): Promise<Metadata> {
  return { title: locales[await getLocale()].reviewTitle };
}
export default async function ReviewPage() {
  return <ReviewScreen locale={await getLocale()} />;
}
