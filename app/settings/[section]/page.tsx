import { notFound } from "next/navigation";
import { isSettingsSection } from "@/lib/settings-sections";
import { SettingsContent } from "@/components/settings-content";
export const dynamic = "force-dynamic";
export default async function SettingsPage({ params }: { params: Promise<{ section: string }> }) { const { section } = await params; if (!isSettingsSection(section)) notFound(); return <SettingsContent key={section} section={section} />; }
